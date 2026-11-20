import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/integrations/supabase/types";
import { cloudService } from "../../src/providers/SupabaseProvider";

export const url = process.env.SMART_FLOW_TEST_URL;
export const key = process.env.SMART_FLOW_TEST_ANON_KEY;
if (!url || !["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname) || !key) {
  throw new Error(
    "Set SMART_FLOW_TEST_URL and SMART_FLOW_TEST_ANON_KEY for a disposable local Supabase stack.",
  );
}

export async function account(transport: typeof fetch = fetch) {
  const db = createClient<Database>(url!, key!, {
    global: { fetch: transport },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const fixture = crypto.randomUUID();
  const { data, error } = await db.auth.signUp({
    email: fixture + "@example.test",
    password: "Demo!" + fixture,
    options: { data: { display_name: "Test workspace" } },
  });
  if (error || !data.user || !data.session) {
    throw new Error("Local signup requires email confirmation disabled. " + (error?.message ?? ""));
  }
  return { db, owner: data.user.id, service: cloudService(db, data.user.id) };
}
