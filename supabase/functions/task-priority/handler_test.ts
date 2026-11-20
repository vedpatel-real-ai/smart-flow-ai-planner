import { scoringHandler } from "./handler.ts";
import { scoreTask } from "../_shared/scoring.ts";

const now = Date.parse("2025-01-10T12:00:00Z");
const config = { url: "http://localhost", publicKey: "fixture-public" };
const caller = "Bearer fixture-session";
const row = {
  id: "1",
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
  priority_level: "Critical",
  due_date: "2025-01-10T16:00:00Z",
  estimated_duration: 30,
  ai_priority_score: 0,
};
function equal(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error("Expected " + JSON.stringify(b) + ", got " + JSON.stringify(a));
  }
}
function request(method = "POST", authorization: string | null = caller, body?: string) {
  return new Request("http://localhost/task-priority", {
    method,
    headers: authorization ? { Authorization: authorization } : {},
    body,
  });
}
const unexpected = () => {
  throw new Error("Unexpected downstream request");
};
for (
  const [method, auth, status] of [["OPTIONS", null, 204], ["GET", caller, 405], ["POST", null, 401], [
    "POST",
    "Basic x",
    401,
  ]] as const
) {
  Deno.test(method + " " + (auth ?? "without header") + " returns " + status, async () => {
    const res = await scoringHandler(config, unexpected)(request(method, auth));
    equal(res.status, status);
    if (status !== 204) equal(typeof (await res.json()).error, "string");
  });
}
for (const invalid of ["invalid", "null", "[]", '{"user_id":"other"}']) {
  Deno.test(
    "rejects request body " + invalid,
    async () =>
      equal((await scoringHandler(config, unexpected)(request("POST", caller, invalid))).status, 400),
  );
}
Deno.test("invalid or expired token", async () => {
  const res = await scoringHandler(config, () => Promise.resolve(new Response(null, { status: 401 })))(
    request(),
  );
  equal(res.status, 401);
});
Deno.test("unavailable identity service", async () => {
  const res = await scoringHandler(config, () => Promise.resolve(new Response(null, { status: 503 })))(
    request(),
  );
  equal(res.status, 503);
});

function fixture(mode: "empty" | "ok" | "failed-read" | "failed-write" | "stale" | "count" | "network") {
  const seen: string[] = [];
  const writes: unknown[] = [];
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    equal(headers.get("authorization"), caller);
    equal(headers.get("apikey"), config.publicKey);
    seen.push(url.pathname);
    if (url.pathname === "/auth/v1/user") return Response.json({ id: "owner-A" });
    if (mode === "network") throw new Error("private infrastructure details");
    if (url.pathname === "/rest/v1/tasks") {
      equal(url.searchParams.get("user_id"), "eq.owner-A");
      if (mode === "failed-read") return Response.json({ message: "private" }, { status: 500 });
      return Response.json(mode === "empty" || url.searchParams.has("id") ? [] : [row]);
    }
    equal(url.pathname, "/rest/v1/rpc/persist_task_scores");
    writes.push(JSON.parse(String(init?.body)));
    if (mode === "failed-write") return Response.json({ message: "private" }, { status: 500 });
    if (mode === "stale") return Response.json({ code: "40001" }, { status: 409 });
    return Response.json(mode === "count" ? 0 : 1);
  };
  return { handler: scoringHandler(config, transport, () => now), seen, writes };
}
for (
  const [mode, status] of [
    ["empty", 200],
    ["ok", 200],
    ["failed-read", 503],
    ["failed-write", 503],
    ["stale", 409],
    ["count", 502],
    ["network", 503],
  ] as const
) {
  Deno.test(mode + " score round trip", async () => {
    const { handler, writes } = fixture(mode);
    const res = await handler(request());
    equal(res.status, status);
    const body = await res.json();
    if (mode === "ok") {
      equal(body, { inspected: 1, updated: 1 });
      equal(writes, [{ p_scores: [{ id: "1", updated_at: row.updated_at, score: 11.8 }] }]);
    } else if (mode === "empty") {
      equal(body, { inspected: 0, updated: 0 });
      equal(writes, []);
    } else {
      equal(typeof body.error, "string");
      equal(JSON.stringify(body).includes("private"), false);
    }
  });
}
Deno.test("deadline and duration boundaries", () => {
  const day = 86400000;
  for (const [days, expect] of [[-1, 11.8], [0, 11.8], [1, 10.8], [3, 9.8], [7, 8.8]]) {
    equal(scoreTask({ ...row, due_date: new Date(now + days * day).toISOString() }, now), expect);
  }
  equal(scoreTask({ priority_level: "High", due_date: "invalid", estimated_duration: -1 }, now), 6);
  equal(scoreTask({ priority_level: "toString" }, now), 4);
  equal(scoreTask({ created_at: new Date(now - 7 * day).toISOString(), estimated_duration: 31 }, now), 4);
});
