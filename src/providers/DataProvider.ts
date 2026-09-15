import { createContext, createElement, ReactNode, useContext, useEffect, useState } from "react";
import { DemoProvider } from "./DemoProvider";
import { canUseSupabase, SupabaseProvider } from "./SupabaseProvider";
import { isSupabaseConfigured } from "@/integrations/supabase/client";

type BackendMode = "supabase" | "demo";

const STORAGE_MODE_KEY = "smart-taskflow-backend-mode";

const getInitialMode = (): BackendMode => {
  if (!isSupabaseConfigured) {
    return "demo";
  }
  const stored = localStorage.getItem(STORAGE_MODE_KEY);
  if (stored === "supabase" || stored === "demo") {
    return stored;
  }
  return "demo";
};

let activeMode: BackendMode = getInitialMode();
let activeProvider: typeof DemoProvider | typeof SupabaseProvider =
  activeMode === "supabase" ? SupabaseProvider : DemoProvider;

export const getActiveDataProvider = () => activeProvider;
export const getActiveBackendMode = () => activeMode;

export const forceDemoMode = () => {
  activeProvider = DemoProvider;
  activeMode = "demo";
  localStorage.setItem(STORAGE_MODE_KEY, "demo");
};

interface DataContextType {
  mode: BackendMode;
  isDemoMode: boolean;
  setMode: (mode: BackendMode) => void;
}

const DataProviderContext = createContext<DataContextType>({
  mode: "demo",
  isDemoMode: true,
  setMode: () => undefined,
});

export const DataProvider = ({ children }: { children: ReactNode }) => {
  const [mode, setModeState] = useState<BackendMode>(activeMode);

  const setMode = (newMode: BackendMode) => {
    activeMode = newMode;
    activeProvider = newMode === "supabase" ? SupabaseProvider : DemoProvider;
    localStorage.setItem(STORAGE_MODE_KEY, newMode);
    setModeState(newMode);
  };

  useEffect(() => {
    let mounted = true;

    if (!isSupabaseConfigured) {
      if (activeMode !== "demo") {
        setMode("demo");
      }
      return;
    }

    canUseSupabase().then((available) => {
      if (!mounted) return;
      if (available && activeMode === "supabase") {
        activeProvider = SupabaseProvider;
        setModeState("supabase");
      } else if (!available && activeMode === "supabase") {
        // Fallback to demo mode if configured Supabase is unreachable
        setMode("demo");
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  return createElement(
    DataProviderContext.Provider,
    { value: { mode, isDemoMode: mode === "demo", setMode } },
    children
  );
};

export const useDataProvider = () => useContext(DataProviderContext);
