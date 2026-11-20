import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionController, type Account, type CloudAuth } from "../../src/auth/session";

const sample: Account = { id: "sample", user_metadata: {} };
const account: Account = { id: "owner", user_metadata: { display_name: "Alex" } };
const key = "smart-taskflow-backend-mode";

function fixture() {
  const values = new Map<string, string>();
  const storage: Storage = {
    get length() { return values.size; },
    key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: key => { values.delete(key); },
    clear: () => values.clear(),
  };
  let notify: (user: Account | null) => void = () => {};
  const unsubscribe = vi.fn();
  const auth = {
    signIn: vi.fn(async () => account),
    signUp: vi.fn(async (): Promise<Account | null> => null),
    restore: vi.fn(async (): Promise<Account | null> => account),
    signOut: vi.fn(async () => {}),
    listen: (listener: typeof notify) => { notify = listener; return unsubscribe; },
  } satisfies CloudAuth;
  return { storage, auth, unsubscribe, event: (user: Account | null) => notify(user),
    session: new SessionController(storage, auth, sample) };
}

describe("workspace identity", () => {
  let f: ReturnType<typeof fixture>;
  beforeEach(() => { f = fixture(); });
  it("opens the entry screen on a fresh profile without probing cloud", async () => {
    await f.session.start(); expect(f.session.snapshot().kind).toBe("signed-out");
    expect(f.auth.restore).not.toHaveBeenCalled();
  });
  it("persists explicit demo entry across restart without sending credentials", async () => {
    f.session.enterDemo();
    const other = new SessionController(f.storage, f.auth, sample);
    await other.start(); expect(other.snapshot()).toEqual({ kind: "active", mode: "demo", user: sample });
    expect(f.auth.signIn).not.toHaveBeenCalled();
  });
  it("restores the verified cloud account and handles expiry", async () => {
    f.storage.setItem(key, "supabase"); await f.session.start();
    expect(f.session.snapshot()).toEqual({ kind: "active", mode: "cloud", user: account });
    f.event(null); expect(f.session.snapshot().kind).toBe("signed-out");
    expect(f.unsubscribe).toHaveBeenCalledOnce();
  });
  it("uses only the signed-in cloud identity", async () => {
    await f.session.authenticate("alex@example.test", "pass");
    expect(f.session.snapshot()).toEqual({ kind: "active", mode: "cloud", user: account });
  });
  it.each([false, true])("surfaces rejected cloud credentials, signup=%s", async registration => {
    const method = registration ? f.auth.signUp : f.auth.signIn;
    method.mockRejectedValue(new Error("Rejected")); await f.session.authenticate("a", "b", registration ? "A" : undefined);
    expect(f.session.snapshot()).toEqual({ kind: "auth-error", message: "Rejected" });
    expect(f.storage.getItem(key)).toBe("supabase");
    expect(f.storage.getItem("smart-taskflow-demo-authenticated")).toBeNull();
  });
  it("requires email verification when signup returns no session", async () => {
    await f.session.authenticate("a", "b", "A"); expect(f.session.snapshot().kind).toBe("verify-email");
  });
  it("ignores both delayed restoration and obsolete auth callbacks after switching", async () => {
    f.storage.setItem(key, "supabase");
    let resolve!: (value: Account) => void;
    f.auth.restore.mockReturnValue(new Promise(done => { resolve = done; }));
    const pending = f.session.start(); f.session.enterDemo(); f.event(account); resolve(account); await pending;
    expect(f.session.snapshot()).toEqual({ kind: "active", mode: "demo", user: sample });
  });
  it("retains the selected mode after a network failure", async () => {
    f.storage.setItem(key, "supabase"); f.auth.restore.mockRejectedValue(new TypeError("Failed to fetch"));
    await f.session.start(); expect(f.session.snapshot().kind).toBe("unavailable");
    expect(f.storage.getItem(key)).toBe("supabase");
  });
  it("reports sign-out failure and retries only the selected session", async () => {
    await f.session.authenticate("a","b"); f.auth.signOut.mockRejectedValueOnce(new Error("Unavailable"));
    await f.session.signOut(); expect(f.session.snapshot()).toMatchObject({ kind:"active", mode:"cloud",message:"Unavailable" });
    await f.session.signOut(); expect(f.session.snapshot().kind).toBe("signed-out"); expect(f.storage.getItem(key)).toBeNull();
    f.session.enterDemo(); await f.session.signOut(); expect(f.auth.signOut).toHaveBeenCalledTimes(2);
  });
  it("clears a revoked cloud identity even if the browser refuses preference cleanup", async () => {
    await f.session.authenticate("a", "b");
    vi.spyOn(f.storage, "removeItem").mockImplementation(() => { throw new Error("Storage denied"); });
    await f.session.signOut();
    expect(f.session.snapshot()).toEqual({kind:"signed-out",message:"Storage denied"});
  });
});
