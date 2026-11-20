import { useState, type FormEvent } from "react";
import { Brain } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cloudAuth } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Auth() {
  const { authenticate, enterDemo, restore, state } = useAuth();
  const [registration, setRegistration] = useState(false);
  const pending = state.kind === "authenticating" || state.kind === "restoring";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    await authenticate(String(fields.get("email")), String(fields.get("password")),
      registration ? String(fields.get("name") ?? "") : undefined);
  }
  return <main className="min-h-screen grid place-items-center bg-gradient-to-br from-primary/10 via-background to-secondary/20 p-4">
    <div className="w-full max-w-md space-y-5">
      <div className="flex gap-3 items-center justify-center"><Brain className="text-primary" aria-hidden="true"/>
        <h1 className="text-3xl font-bold">Smart Flow</h1></div>
      <Card><CardHeader><CardTitle>Cloud workspace</CardTitle>
        <CardDescription>{cloudAuth ? "Sign in to save your tasks to your account." : "Cloud access requires a Supabase URL and public key in this installation."}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {cloudAuth && <form key={String(registration)} onSubmit={submit} className="space-y-3">
          {registration && <div><Label htmlFor="account-name">Display name</Label><Input id="account-name" name="name" autoComplete="name"/></div>}
          <div><Label htmlFor="account-email">Email</Label><Input id="account-email" name="email" type="email" autoComplete="email" required/></div>
          <div><Label htmlFor="account-password">Password</Label><Input id="account-password" name="password" type="password" autoComplete={registration ? "new-password":"current-password"} required/></div>
          <Button type="submit" disabled={pending}>{pending ? "Connecting…" : registration ? "Create account" : "Sign in to cloud"}</Button>
          <Button type="button" variant="link" disabled={pending} onClick={() => setRegistration(!registration)}>{registration ? "Use existing account" : "Register"}</Button>
        </form>}
        {state.message && <p role={state.kind === "verify-email" ? "status" : "alert"}>{state.message}</p>}
        {state.kind === "unavailable" && cloudAuth && <Button variant="outline" onClick={restore}>Retry connection</Button>}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Demo workspace</CardTitle><CardDescription>Sample tasks and changes stay in this browser profile after sign-out. Anyone using the profile can reopen them.</CardDescription></CardHeader>
        <CardContent><Button variant="outline" onClick={enterDemo}>Explore Demo</Button></CardContent></Card>
    </div>
  </main>;
}
