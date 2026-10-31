import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function jsonResponse(body: Record<string, unknown>, status: number, origin: string | null) {
  const allowedOrigin = Deno.env.get('APP_ORIGIN');
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Access-Control-Allow-Origin': allowedOrigin ?? origin ?? '*', Vary: 'Origin' },
  });
}

function readDefaultKey(variable: string): string | undefined {
  const raw = Deno.env.get(variable);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed.default;
  } catch {
    return raw;
  }
}

async function findInvitedUser(adminClient: ReturnType<typeof createClient>, requestId: string) {
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((user) => user.app_metadata?.staff_invite_request_id === requestId || user.user_metadata?.staff_invite_request_id === requestId);
    if (match) return match;
    if (data.users.length < 200) return null;
  }
  throw new Error('Auth user lookup reached its page limit.');
}

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');
  const allowedOrigin = Deno.env.get('APP_ORIGIN');
  if (allowedOrigin && origin && origin !== allowedOrigin) return jsonResponse({ error: 'Origin not allowed.' }, 403, origin);
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: { ...corsHeaders, 'Access-Control-Allow-Origin': allowedOrigin ?? origin ?? '*', Vary: 'Origin' } });
  }
  if (request.method !== 'POST') return jsonResponse({ error: 'Use POST.' }, 405, origin);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const publishableKey = readDefaultKey('SUPABASE_PUBLISHABLE_KEYS') ?? Deno.env.get('SUPABASE_ANON_KEY');
  const secretKey = readDefaultKey('SUPABASE_SECRET_KEYS') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('authorization');
  if (!supabaseUrl || !publishableKey || !secretKey) return jsonResponse({ error: 'Staff account service is not configured.' }, 500, origin);
  if (!authorization?.startsWith('Bearer ')) return jsonResponse({ error: 'Sign in as an administrator.' }, 401, origin);

  const callerClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authError } = await callerClient.auth.getUser();
  if (authError || !authData.user) return jsonResponse({ error: 'Invalid or expired session.' }, 401, origin);
  const { data: profile, error: profileError } = await callerClient.from('profiles').select('role,is_active').eq('id', authData.user.id).maybeSingle();
  if (profileError || profile?.role !== 'ADMIN' || profile.is_active !== true) return jsonResponse({ error: 'Administrator access is required.' }, 403, origin);

  let payload: { action?: string; email?: string; full_name?: string; user_id?: string; active?: boolean; idempotency_key?: string };
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'Request body must be valid JSON.' }, 400, origin);
  }

  const adminClient = createClient(supabaseUrl, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });

  if (payload.action === 'create') {
    const email = payload.email?.trim().toLowerCase();
    const fullName = payload.full_name?.trim();
    const requestId = payload.idempotency_key?.trim();
    if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !fullName || fullName.length > 160 || !requestId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
      return jsonResponse({ error: 'Provide a valid email, a name up to 160 characters, and a UUID idempotency_key.' }, 400, origin);
    }

    const { error: requestInsertError } = await adminClient.from('staff_invite_requests').insert({
      idempotency_key: requestId,
      email,
      full_name: fullName,
      requested_by: authData.user.id,
      status: 'PENDING',
    });
    const { data: inviteRequest, error: requestReadError } = await adminClient.from('staff_invite_requests')
      .select('idempotency_key,email,full_name,requested_by,auth_user_id,status')
      .eq('idempotency_key', requestId)
      .maybeSingle();
    if (requestReadError) return jsonResponse({ error: 'Invitation request could not be recorded.' }, 500, origin);
    if (!inviteRequest) {
      if (requestInsertError) return jsonResponse({ error: 'An invitation already exists for this email or idempotency key.' }, 409, origin);
      return jsonResponse({ error: 'Invitation request could not be recorded.' }, 500, origin);
    }
    if (inviteRequest.email !== email || inviteRequest.full_name !== fullName || inviteRequest.requested_by !== authData.user.id) {
      return jsonResponse({ error: 'This idempotency key belongs to a different request.' }, 409, origin);
    }
    if (inviteRequest.status === 'COMPLETED' && inviteRequest.auth_user_id) {
      return jsonResponse({ user_id: inviteRequest.auth_user_id, message: 'Staff invitation already completed.' }, 200, origin);
    }
    // A duplicate email under another idempotency key is a conflict, not a second invite.
    if (requestInsertError) {
      const { data: emailRequest, error: emailReadError } = await adminClient.from('staff_invite_requests').select('idempotency_key').eq('email', email).maybeSingle();
      if (emailReadError || emailRequest?.idempotency_key !== requestId) return jsonResponse({ error: 'An invitation already exists for this email.' }, 409, origin);
    }

    let invitedUser: Awaited<ReturnType<typeof findInvitedUser>> = null;
    try {
      if (inviteRequest.auth_user_id) {
        const { data, error } = await adminClient.auth.admin.getUserById(inviteRequest.auth_user_id);
        if (error) return jsonResponse({ error: 'Invitation Auth account could not be verified. Retry with the same idempotency_key.' }, 503, origin);
        invitedUser = data.user;
      }
      if (!invitedUser) invitedUser = await findInvitedUser(adminClient, requestId);
      if (!invitedUser) {
        const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
          data: { full_name: fullName, staff_invite_request_id: requestId },
        });
        if (error) {
          // A timeout may have happened after Auth created the user; look up the marker before reporting failure.
          invitedUser = await findInvitedUser(adminClient, requestId);
          if (!invitedUser) return jsonResponse({ error: 'Invitation could not be completed. Retry with the same idempotency_key.' }, 409, origin);
        } else invitedUser = data.user;
      }
    } catch {
      return jsonResponse({ error: 'Invitation status could not be verified. Retry with the same idempotency_key.' }, 503, origin);
    }
    if (!invitedUser) return jsonResponse({ error: 'Invitation could not be completed. Retry with the same idempotency_key.' }, 503, origin);
    const { error: recordUserError } = await adminClient.from('staff_invite_requests')
      .update({ auth_user_id: invitedUser.id })
      .eq('idempotency_key', requestId)
      .eq('requested_by', authData.user.id);
    if (recordUserError) return jsonResponse({ error: 'Invitation is pending provisioning. Retry with the same idempotency_key.' }, 503, origin);
    if (invitedUser.app_metadata?.staff_invite_request_id !== requestId) {
      const { error: markerError } = await adminClient.auth.admin.updateUserById(invitedUser.id, {
        app_metadata: { ...invitedUser.app_metadata, staff_invite_request_id: requestId },
      });
      if (markerError) return jsonResponse({ error: 'Invitation is pending secure provisioning. Retry with the same idempotency_key.' }, 503, origin);
    }

    const { error: promoteError } = await adminClient.rpc('service_promote_staff_profile', {
      p_request_id: requestId,
      p_user_id: invitedUser.id,
      p_actor_id: authData.user.id,
      p_full_name: fullName,
    });
    if (promoteError) return jsonResponse({ error: 'Invitation is pending provisioning. Retry with the same idempotency_key.' }, 503, origin);
    return jsonResponse({ user_id: invitedUser.id, message: 'Staff invitation sent.' }, 201, origin);
  }

  if (payload.action === 'set_active') {
    if (!payload.user_id || typeof payload.active !== 'boolean' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.user_id)) {
      return jsonResponse({ error: 'Provide a valid staff user_id and active boolean.' }, 400, origin);
    }
    // Deactivation first removes all application data access via RLS, then blocks future Auth sessions.
    if (!payload.active) {
      const { error } = await adminClient.rpc('service_set_staff_active', { p_user_id: payload.user_id, p_actor_id: authData.user.id, p_active: false });
      if (error) return jsonResponse({ error: 'Staff account status could not be updated.' }, 404, origin);
    }
    const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(payload.user_id, {
      ban_duration: payload.active ? 'none' : '876000h',
    });
    if (authUpdateError) return jsonResponse({ error: 'Database access status changed, but Auth session blocking failed. Retry this request.' }, 503, origin);
    if (payload.active) {
      const { error } = await adminClient.rpc('service_set_staff_active', { p_user_id: payload.user_id, p_actor_id: authData.user.id, p_active: true });
      if (error) return jsonResponse({ error: 'Auth access was restored, but database access remains disabled. Retry this request.' }, 503, origin);
    }
    return jsonResponse({ user_id: payload.user_id, active: payload.active }, 200, origin);
  }

  return jsonResponse({ error: 'Unsupported action.' }, 400, origin);
});
