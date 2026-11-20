import { supabase } from "../integrations/supabase/client";
import { demoService } from "./DemoProvider";
import { cloudService } from "./SupabaseProvider";
import type { PlannerService } from "./contract";

export { SavedRankingError } from "./contract";
export type { PlannerService, Scope, WorkspaceSnapshot } from "./contract";
export { resetDemo } from "./DemoProvider";

export function getService(mode: "demo" | "cloud", userId: string): PlannerService {
  if (mode === "demo") return demoService(userId);
  if (!supabase) throw new Error("Cloud access is unavailable.");
  return cloudService(supabase, userId);
}
