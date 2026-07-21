import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client for the existing socialbotic project, using the
 * SERVICE key (bypasses RLS). Same pattern and env-var names as the project's
 * publish/generate scripts — SUPABASE_URL + SUPABASE_SERVICE_KEY.
 *
 * The `subscribers` table is managed in Supabase directly (RLS enabled, granted
 * to service_role): columns email (unique), source, created_at, unsubscribed_at.
 * There is no migration tooling or direct DB connection here — everything goes
 * through the REST API.
 */
const globalForSupabase = globalThis as unknown as {
  subSupabase?: SupabaseClient;
};

export function hasSupabase(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
}

export function getSupabase(): SupabaseClient {
  if (globalForSupabase.subSupabase) return globalForSupabase.subSupabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_SERVICE_KEY are not set — the subscribe API needs them."
    );
  }
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  globalForSupabase.subSupabase = client;
  return client;
}
