import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { SessionController } from "@/auth/session";
import { cloudAuth } from "@/integrations/supabase/client";
import { demoUser } from "@/demo/auth";

const AuthContext = createContext<SessionController | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [controller] = useState(() => new SessionController({
    getItem: key => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
    removeItem: key => window.localStorage.removeItem(key),
  }, cloudAuth, demoUser));
  useEffect(() => {
    void controller.start();
    const sync = (event: StorageEvent) => {
      if (!event.key || event.key === "smart-taskflow-backend-mode" || event.key === "smart-taskflow-demo-authenticated") void controller.start();
    };
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener("storage", sync); controller.stop(); };
  }, [controller]);
  return <AuthContext.Provider value={controller}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const controller = useContext(AuthContext);
  if (!controller) throw new Error("Missing session context");
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot);
  const active = state.kind === "active" || state.kind === "signing-out" ? state : null;
  return { state, user: active?.user, mode: active?.mode, authenticate: controller.authenticate,
    signOut: controller.signOut, enterDemo: controller.enterDemo, restore: controller.start };
}
