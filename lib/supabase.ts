import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://pwpcisztfnukjnavszgv.supabase.co";

// Publishable keys are intentionally safe to ship to browsers. Authorization
// is enforced by Supabase Auth, RLS, and the state-machine RPC functions.
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_G0uhAaCg7-5Mv6sLcK-xvw_iU2a7jhh";

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce",
  },
});
