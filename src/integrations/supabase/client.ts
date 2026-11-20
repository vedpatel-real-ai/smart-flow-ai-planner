import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import type { CloudAuth } from "@/auth/session";

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY)?.trim();
export const supabase = url && /^https?:\/\//.test(url) && key
  ? createClient<Database>(url, key)
  : null;

export const cloudAuth: CloudAuth | null = supabase && {
  async restore() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (!data.session) return null;
    const verified = await supabase.auth.getUser();
    if (verified.error) throw verified.error;
    return verified.data.user;
  },
  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.user;
  },
  async signUp(email, password, name) {
    const { data, error } = await supabase.auth.signUp({ email, password,
      options: { data: { display_name: name.trim() }, emailRedirectTo: location.origin } });
    if (error) throw error;
    return data.session?.user ?? null;
  },
  async signOut() {
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) throw error;
  },
  listen(callback) {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "INITIAL_SESSION") callback(session?.user ?? null);
    });
    return () => data.subscription.unsubscribe();
  },
};
