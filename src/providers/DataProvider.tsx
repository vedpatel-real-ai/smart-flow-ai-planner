import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getService, type PlannerService } from "./service";
import { useAuth } from "@/hooks/useAuth";
import { errorText } from "@/auth/session";
import { demoStoreKey } from "./DemoProvider";
import { Button } from "@/components/ui/button";

type Snapshot = Awaited<ReturnType<PlannerService["snapshot"]>>;
const WorkspaceContext = createContext<(Snapshot & { service: PlannerService; refresh(): Promise<void> }) | null>(null);

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("Missing workspace context");
  return value;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { mode, user } = useAuth();
  const owner = user!.id;
  const service = useMemo(() => getService(mode!, owner), [mode, owner]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const revision = useRef(0);
  const invalidate = useCallback(() => { revision.current++; }, []);

  const refresh = useCallback(async () => {
    const request = ++revision.current;
    try {
      const data = await service.snapshot();
      if (revision.current === request) { setSnapshot(data); setError(""); }
    } catch (failure) {
      if (revision.current === request) setError(errorText(failure));
      throw failure;
    }
  }, [service]);
  useEffect(() => {
    const load = () => { void refresh().catch(() => { /* error is rendered below */ }); };
    load();
    const sync = (event: StorageEvent) => {
      if (mode === "demo" && (!event.key || event.key === demoStoreKey)) load();
    };
    window.addEventListener("storage", sync);
    return () => { invalidate(); window.removeEventListener("storage", sync); };
  }, [mode, refresh, invalidate]);
  if (error) return <section className="mx-auto max-w-xl space-y-3 rounded-xl border bg-card p-6"><h2 className="text-lg font-semibold">Could not load this workspace</h2><p role="alert">{error}</p>
    <Button variant="outline" onClick={() => { void refresh().catch(() => undefined); }}>Retry</Button></section>;
  if (!snapshot) return <p role="status" className="rounded-xl border bg-card p-6 text-muted-foreground">Loading workspace…</p>;
  return <WorkspaceContext.Provider value={{ ...snapshot, service, refresh }}>{children}</WorkspaceContext.Provider>;
}
