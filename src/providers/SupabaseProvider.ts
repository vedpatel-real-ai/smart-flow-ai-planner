import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";

export const SupabaseProvider = {
  mode: "supabase" as const,
  auth: supabase.auth,
  from: supabase.from.bind(supabase),
};

export const canUseSupabase = async (): Promise<boolean> => {
  if (!isSupabaseConfigured) {
    return false;
  }

  try {
    const probe = Promise.all([
      supabase.auth.getSession(),
      supabase.from("categories").select("id").limit(1),
    ]);

    const timeout = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), 1500)
    );

    const result = await Promise.race([probe, timeout]);
    if (!result) {
      return false;
    }

    const [sessionResult, databaseResult] = result;
    return !sessionResult.error && !databaseResult.error;
  } catch {
    return false;
  }
};
