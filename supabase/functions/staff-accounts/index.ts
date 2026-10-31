import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function jsonResponse(body: Record<string, unknown>, status: number, origin: string | null) {
  const allowedOrigin = Deno.env.get('APP_ORIGIN');
  const corsOrigin = allowedOrigin ?? origin ?? '*';
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Access-Control-Allow-Origin': corsOrigin, Vary: 'Origin' },
  });
}

function readDefaultKey(variable: string): string | undefined {
  const raw = Deno.env.get(variable);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed.default;
  } catch {
    // Legacy single-key variables contain a raw key instead of a key map.
    return raw;
  }
}

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');
  const allowedOrigin = Deno.env.get('APP_ORIGIN');
  if (allowedOrigin && origin && origin !== allowedOrigin) {
    return jsonResponse({ error: 'Origin not allowed.' }, 403, origin);
  }
  if (request.method === 'OPTIONS') return new Response('ok', { headers: { ...corsHeaders, 'Access-Control-Allow-Origin': allowedOrigin ?? origin ?? '*' } });
  if (request.method !== 'POST') return jsonResponse({ error: 'Use POST.' }, 405, origin);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const publishableKey = readDefaultKey('SUPABASE_PUBLISHABLE_KEYS') ?? Deno.env.get('SUPABASE_ANON_KEY');
  const secretKey = readDefaultKey('SUPABASE_SECRET_KEYS') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('authorization');
  if (!supabaseUrl || !publishableKey || !secretKey) {
    return jsonResponse({ error: 'Staff account service is not configured.' }, 500, origin);
  }
  if (!authorization?.startsWith('Bearer ')) return jsonResponse({ error: 'Sign in as an administrator.' }, 401, origin);

  const callerClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authError } = await callerClient.auth.getUser();
  if (authError || !authData.user) return jsonResponse({ error: 'Invalid or expired session.' }, 401, origin);

  const { data: profile, error: profileError } = await callerClient
    .from('profiles')
    .select('role,is_active')
    .eq('id', authData.user.id)
    .maybeSingle();
  if (profileError || profile?.role !== 'ADMIN' || profile.is_active !== true) {
    return jsonResponse({ error: 'Administrator access is required.' }, 403, origin);
  }

  let payload: { action?: string; email?: string; full_name?: string; user_id?: string; active?: boolean };
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'Request body must be valid JSON.' }, 400, origin);
  }

  const adminKey = secretKey;
  const adminClient = createClient(supabaseUrl, adminKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (payload.action === 'create') {
    const email = payload.email?.trim().toLowerCase();
    const fullName = payload.full_name?.trim();
    if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !fullName || fullName.length > 160) {
      return jsonResponse({ error: 'Provide a valid email and a name up to 160 characters.' }, 400, origin);
    }

    // Auth signup triggers always make CUSTOMER profiles; this trusted operation promotes only this invited account.
    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName },
    });
    const invitedUser = inviteData.user;
    if (inviteError || !invitedUser) return jsonResponse({ error: 'Could not invite this staff member.' }, 409, origin);

    const { data: promotedProfile, error: promoteError } = await adminClient
      .from('profiles')
      .update({ role: 'STAFF', full_name: fullName })
      .eq('id', invitedUser.id)
      .eq('role', 'CUSTOMER')
      .select('id,role')
      .maybeSingle();
    if (promoteError || promotedProfile?.role !== 'STAFF') {
      await adminClient.auth.admin.deleteUser(invitedUser.id);
      return jsonResponse({ error: 'Staff profile could not be provisioned; the invitation was rolled back.' }, 500, origin);
    }

    const { error: customerError } = await adminClient.from('customers').delete().eq('profile_id', invitedUser.id);
    if (customerError) {
      await adminClient.from('profiles').update({ role: 'CUSTOMER' }).eq('id', invitedUser.id);
      await adminClient.auth.admin.deleteUser(invitedUser.id);
      return jsonResponse({ error: 'Staff profile cleanup failed; the invitation was rolled back.' }, 500, origin);
    }
    return jsonResponse({ user_id: invitedUser.id, message: 'Staff invitation sent.' }, 201, origin);
  }

  if (payload.action === 'set_active') {
    if (!payload.user_id || typeof payload.active !== 'boolean') {
      return jsonResponse({ error: 'Provide a staff user_id and active boolean.' }, 400, origin);
    }
    const { data: target, error: targetError } = await adminClient
      .from('profiles')
      .select('id,role')
      .eq('id', payload.user_id)
      .maybeSingle();
    if (targetError || target?.role !== 'STAFF') return jsonResponse({ error: 'Staff account not found.' }, 404, origin);
    const { error: updateError } = await adminClient
      .from('profiles')
      .update({ is_active: payload.active })
      .eq('id', payload.user_id)
      .eq('role', 'STAFF');
    if (updateError) return jsonResponse({ error: 'Staff account status could not be updated.' }, 500, origin);
    return jsonResponse({ user_id: payload.user_id, active: payload.active }, 200, origin);
  }

  return jsonResponse({ error: 'Unsupported action.' }, 400, origin);
});
