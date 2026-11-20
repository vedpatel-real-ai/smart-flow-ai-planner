export type Account = { id: string; email?: string; user_metadata: Record<string, unknown> };
export type Identity =
  | { kind: "signed-out" | "restoring" | "authenticating" | "unavailable" | "auth-error" | "verify-email"; message?: string }
  | { kind: "active" | "signing-out"; mode: "demo" | "cloud"; user: Account; message?: string };

export interface CloudAuth {
  restore(): Promise<Account | null>;
  signIn(email: string, password: string): Promise<Account>;
  signUp(email: string, password: string, name: string): Promise<Account | null>;
  signOut(): Promise<void>;
  listen(callback: (user: Account | null) => void): () => void;
}

const modeKey = "smart-taskflow-backend-mode";
const demoFlag = "smart-taskflow-demo-authenticated";

export function errorText(error: unknown) {
  if (typeof error === "object" && error && "message" in error && typeof error.message === "string") return error.message;
  return "The operation could not be completed.";
}

export class SessionController {
  private state: Identity = { kind: "signed-out" };
  private listeners = new Set<() => void>();
  private generation = 0;
  private unsubscribe?: () => void;

  constructor(private storage: Pick<Storage, "getItem" | "setItem" | "removeItem">, private cloud: CloudAuth | null, private demo: Account) {}

  snapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private publish(state: Identity) {
    this.state = state;
    this.listeners.forEach(listener => listener());
  }

  stop = () => {
    this.generation++;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  };

  private watchCloud(token: number) {
    this.unsubscribe = this.cloud?.listen(user => {
      if (token !== this.generation) return;
      if (user) this.publish({ kind: "active", mode: "cloud", user });
      else {
        this.stop();
        this.publish({ kind: "signed-out" });
      }
    });
  }

  private failed(error: unknown) {
    const transient = error instanceof TypeError || (error instanceof Error && /fetch|network|unavailable|connect|retry/i.test(error.name + error.message));
    this.publish({ kind: transient ? "unavailable" : "auth-error", message: errorText(error) });
  }

  start = async () => {
    this.stop();
    const token = this.generation;
    try {
      const mode = this.storage.getItem(modeKey);
      if (mode === "demo" && this.storage.getItem(demoFlag) === "true") {
        this.publish({ kind: "active", mode: "demo", user: this.demo });
        return;
      }
      if (mode !== "supabase" || !this.cloud) {
        this.publish({ kind: mode === "supabase" ? "unavailable" : "signed-out" });
        return;
      }
      this.publish({ kind: "restoring" });
      this.watchCloud(token);
      const user = await this.cloud.restore();
      if (token !== this.generation || this.state.kind !== "restoring") return;
      this.publish(user ? { kind: "active", mode: "cloud", user } : { kind: "signed-out" });
    } catch (error) {
      if (token === this.generation) { this.stop(); this.failed(error); }
    }
  };

  enterDemo = () => {
    this.stop();
    try {
      this.storage.setItem(modeKey, "demo");
      this.storage.setItem(demoFlag, "true");
      this.publish({ kind: "active", mode: "demo", user: this.demo });
    } catch (error) { this.failed(error); }
  };

  authenticate = async (email: string, password: string, name?: string) => {
    this.stop();
    const token = this.generation;
    if (!this.cloud) {
      this.publish({ kind: "unavailable", message: "Cloud access needs a configured Supabase URL and public key." });
      return;
    }
    this.publish({ kind: "authenticating" });
    try {
      this.storage.setItem(modeKey, "supabase");
      this.storage.removeItem(demoFlag);
      const user = name === undefined ? await this.cloud.signIn(email, password) : await this.cloud.signUp(email, password, name);
      if (token !== this.generation) return;
      if (!user) {
        this.publish({ kind: "verify-email", message: "Check your email to verify your account before signing in." });
        return;
      }
      this.watchCloud(token);
      this.publish({ kind: "active", mode: "cloud", user });
    } catch (error) {
      if (token === this.generation) this.failed(error);
    }
  };

  signOut = async () => {
    const previous = this.state;
    if (previous.kind !== "active") return;
    this.stop();
    const token = this.generation;
    this.publish({ ...previous, kind: "signing-out" });
    if (previous.mode === "cloud") {
      try {
        await this.cloud!.signOut();
      } catch (error) {
        if (token !== this.generation) return;
        this.watchCloud(token);
        this.publish({ ...previous, message: errorText(error) });
        return;
      }
    }
    if (token !== this.generation) return;
    try {
      this.storage.removeItem(demoFlag);
      this.storage.removeItem(modeKey);
      this.publish({ kind: "signed-out" });
    } catch (error) {
      // Cloud revocation has already completed, even if the preference cannot be cleared.
      if (previous.mode === "cloud") this.publish({ kind: "signed-out", message: errorText(error) });
      else this.publish({ ...previous, message: errorText(error) });
    }
  };
}
