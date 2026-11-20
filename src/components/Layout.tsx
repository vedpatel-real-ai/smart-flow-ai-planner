import { type ReactNode } from "react";
import { Brain } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import DemoStorageControls from "./DemoStorageControls";

export default function Layout({ children }: { children: ReactNode }) {
  const { state, mode, user, signOut } = useAuth();
  const name = user?.user_metadata.display_name;
  return <div className="min-h-screen bg-background">
    <header className="border-b bg-card">
      <div className="container flex flex-wrap items-center justify-between gap-3 py-3 px-4">
        <div className="flex items-center gap-2"><Brain aria-hidden="true" className="h-9 w-9 rounded-xl bg-primary p-2 text-white"/>
          <h1 className="text-xl font-bold">Smart Flow</h1>
          <Badge variant="outline">{mode === "demo" ? "Demo · this browser" : "Cloud · Supabase"}</Badge></div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm break-all">{mode === "demo" ? "Sample workspace" : typeof name === "string" && name.trim() || user?.email || "Account"}</span>
          {mode === "demo" && <DemoStorageControls />}
          <Button size="sm" variant="outline" disabled={state.kind === "signing-out"} onClick={signOut}>Sign out</Button>
        </div>
      </div>
    </header>
    {state.message && <p role="alert" className="container p-4">{state.message}</p>}
    <main className="container mx-auto px-4 py-6">{children}</main>
  </div>;
}
