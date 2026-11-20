import { type ReactNode, useState } from "react";
import { Brain } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { resetDemo } from "@/providers/service";
import { errorText } from "@/auth/session";

export default function Layout({ children }: { children: ReactNode }) {
  const { state, mode, user, signOut } = useAuth();
  const [problem, setProblem] = useState("");
  async function reset() {
    if (!window.confirm("Replace all tasks in this browser’s demo workspace with the original sample data?")) return;
    try { await resetDemo(); location.reload(); } catch (error) { setProblem(errorText(error)); }
  }
  const name = user?.user_metadata.display_name;
  return <div className="min-h-screen bg-background">
    <header className="border-b bg-card">
      <div className="container flex flex-wrap items-center justify-between gap-3 py-3 px-4">
        <div className="flex items-center gap-2"><Brain aria-hidden="true" className="text-primary"/>
          <h1 className="text-xl font-bold">Smart Flow</h1>
          <Badge variant="outline">{mode === "demo" ? "Demo · this browser" : "Cloud · Supabase"}</Badge></div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm break-all">{mode === "demo" ? "Sample workspace" : typeof name === "string" && name.trim() || user?.email || "Account"}</span>
          {mode === "demo" && <Button size="sm" variant="outline" onClick={reset}>Reset demo</Button>}
          <Button size="sm" variant="outline" disabled={state.kind === "signing-out"} onClick={signOut}>Sign out</Button>
        </div>
      </div>
    </header>
    {(problem || state.message) && <p role="alert" className="container p-4">{problem || state.message}</p>}
    <main className="container mx-auto px-4 py-6">{children}</main>
  </div>;
}
