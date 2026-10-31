import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

const missingVariables = [
  ['VITE_SUPABASE_URL', supabaseUrl],
  ['VITE_SUPABASE_PUBLISHABLE_KEY', supabasePublishableKey],
]
  .filter(([, value]) => !value)
  .map(([name]) => name);

if (missingVariables.length > 0) {
  throw new Error(
    `[Brightloop] Supabase configuration is incomplete. Add ${missingVariables.join(', ')} to the project-root .env.local file, then restart Vite.`,
  );
}

let parsedSupabaseUrl;
try {
  parsedSupabaseUrl = new URL(supabaseUrl);
} catch {
  throw new Error(
    '[Brightloop] VITE_SUPABASE_URL must be a valid absolute URL. Check the project-root .env.local file.',
  );
}

if (!['https:', 'http:'].includes(parsedSupabaseUrl.protocol) || !parsedSupabaseUrl.hostname) {
  throw new Error(
    '[Brightloop] VITE_SUPABASE_URL must use http:// or https:// and include a hostname.',
  );
}

// Only the public publishable key belongs in this browser client.
if (!supabasePublishableKey.startsWith('sb_publishable_')) {
  throw new Error(
    '[Brightloop] VITE_SUPABASE_PUBLISHABLE_KEY must be a Supabase publishable key (sb_publishable_…). Do not use a service-role or secret key.',
  );
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey);
