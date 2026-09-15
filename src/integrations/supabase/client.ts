import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const envUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)?.trim();

export const isSupabaseConfigured = Boolean(
  envUrl &&
  envKey &&
  envUrl.startsWith("http") &&
  !envUrl.includes("your_supabase_url") &&
  !envUrl.includes("dltvxwxormfvofwqcrqh")
);

const defaultUrl = isSupabaseConfigured ? envUrl! : "https://placeholder-smart-taskflow.supabase.co";
const defaultKey = isSupabaseConfigured ? envKey! : "placeholder-anon-key";

export const supabase = createClient<Database>(defaultUrl, defaultKey, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});