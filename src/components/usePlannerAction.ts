import { useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useWorkspace } from "@/providers/DataProvider";
import { SavedRankingError } from "@/providers/service";

export function usePlannerAction() {
  const { refresh } = useWorkspace();
  const { toast } = useToast();
  const active = useRef(false);
  const [busy, setBusy] = useState(false);
  async function run(operation: () => Promise<void>, success: string, onSaved?: () => void) {
    if (active.current) return;
    active.current = true;
    setBusy(true);
    try {
      let warning: string | undefined;
      try {
        await operation();
      } catch (error) {
        if (!(error instanceof SavedRankingError)) throw error;
        warning = error.message;
      }
      onSaved?.();
      try {
        await refresh();
      } catch {
        warning = [warning, "The update was saved. Reload the workspace to see the latest data."].filter(
          Boolean,
        ).join(" ");
      }
      toast({ title: warning ? "Saved with a warning" : success, description: warning });
    } catch (error) {
      toast({
        title: "Action failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      active.current = false;
      setBusy(false);
    }
  }
  return { run, busy };
}
