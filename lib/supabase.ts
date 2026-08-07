import { createClient } from "@supabase/supabase-js";

const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const configuredPublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// Publishable keys are intentionally safe to ship to browsers. Authorization
// is enforced by Supabase Auth, RLS, and the state-machine RPC functions.
// Non-secret placeholders keep the archived prototype buildable without
// silently coupling it to any hosted Supabase project.
const supabaseUrl = configuredUrl ?? "http://127.0.0.1:54321";
const supabasePublishableKey = configuredPublishableKey ?? "sb_publishable_not_configured";

export const isSupabaseConfigured = Boolean(configuredUrl && configuredPublishableKey);

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce",
  },
});
