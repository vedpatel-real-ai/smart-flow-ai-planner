import { scoreTask, type ScoringInput } from "../_shared/scoring.ts";

interface Config {
  url: string;
  publicKey: string;
}
interface RankedRow extends ScoringInput {
  id: string;
  updated_at: string;
  ai_priority_score: number | null;
}
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function respond(status: number, body: Record<string, unknown>, headers?: Record<string, string>) {
  return Response.json(body, { status, headers: { ...cors, "Cache-Control": "no-store", ...headers } });
}
function isRankedRow(value: unknown): value is RankedRow {
  if (typeof value !== "object" || value === null) return false;
  return "id" in value && typeof value.id === "string" && "updated_at" in value &&
    typeof value.updated_at === "string" &&
    "priority_level" in value &&
    (value.priority_level === null || typeof value.priority_level === "string") &&
    "due_date" in value && (value.due_date === null || typeof value.due_date === "string") &&
    "created_at" in value && typeof value.created_at === "string" &&
    "estimated_duration" in value &&
    (value.estimated_duration === null || typeof value.estimated_duration === "number") &&
    "ai_priority_score" in value &&
    (value.ai_priority_score === null || typeof value.ai_priority_score === "number");
}

export function scoringHandler(config: Config, transport: typeof fetch = fetch, clock = Date.now) {
  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return respond(405, { error: "Use POST." }, { Allow: "POST, OPTIONS" });
    const auth = request.headers.get("Authorization") ?? "";
    if (!/^Bearer [^\s,]+$/i.test(auth)) return respond(401, { error: "A bearer token is required." });
    if (!config.url || !config.publicKey) return respond(503, { error: "Scoring is unavailable." });
    let stage = "request";
    try {
      const text = await request.text();
      if (text.trim()) {
        let parameters;
        try {
          parameters = JSON.parse(text);
        } catch {
          return respond(400, { error: "Expected an empty JSON object." });
        }
        if (
          parameters === null || typeof parameters !== "object" || Array.isArray(parameters) ||
          Object.keys(parameters).length
        ) {
          return respond(400, { error: "Expected an empty JSON object." });
        }
      }
      const headers = { Authorization: auth, apikey: config.publicKey, "Content-Type": "application/json" };
      stage = "auth";
      const who = await transport(new URL("/auth/v1/user", config.url), { headers });
      if (!who.ok) {
        if (who.status >= 500) console.error("Scoring Auth request failed", { status: who.status });
        return who.status === 401 || who.status === 403
          ? respond(401, { error: "The session is invalid or expired." })
          : respond(503, { error: "Authentication is unavailable." });
      }
      const identity = await who.json();
      if (typeof identity?.id !== "string" || !identity.id) {
        return respond(502, { error: "Invalid authentication response." });
      }
      const url = new URL("/rest/v1/tasks", config.url);
      url.search = new URLSearchParams({
        select: "id,priority_level,due_date,created_at,estimated_duration,updated_at,ai_priority_score",
        user_id: "eq." + identity.id,
        status: "neq.Completed",
        order: "id.asc",
        limit: "250",
      }).toString();
      const scores: { id: string; updated_at: string; score: number }[] = [];
      const now = clock();
      let inspected = 0;
      let cursor = "";
      stage = "read";
      while (true) {
        const page = await transport(url, { headers });
        if (!page.ok) {
          console.error("Scoring task read failed", { status: page.status });
          return respond(503, { error: "Could not read tasks for scoring." });
        }
        const rows: unknown = await page.json();
        if (!Array.isArray(rows) || !rows.every(isRankedRow)) {
          return respond(502, { error: "Invalid task data." });
        }
        if (!rows.length) break;
        inspected += rows.length;
        for (const row of rows) {
          if (row.id <= cursor) return respond(502, { error: "Invalid task order." });
          cursor = row.id;
          const score = scoreTask(row, now);
          if (score !== row.ai_priority_score) scores.push({ id: row.id, updated_at: row.updated_at, score });
        }
        url.searchParams.set("id", "gt." + cursor);
      }
      if (scores.length) {
        stage = "persist";
        const saved = await transport(new URL("/rest/v1/rpc/persist_task_scores", config.url), {
          method: "POST",
          headers,
          body: JSON.stringify({ p_scores: scores }),
        });
        if (!saved.ok) {
          const error = await saved.json().catch(() => null);
          if (error?.code === "40001") {
            return respond(409, { error: "Tasks changed during scoring. Refresh ranking." });
          }
          console.error("Scoring transaction failed", { status: saved.status });
          return respond(503, { error: "Could not save the ranking." });
        }
        if (await saved.json() !== scores.length) {
          return respond(502, { error: "Score updates could not be confirmed." });
        }
      }
      return respond(200, { inspected, updated: scores.length });
    } catch {
      console.error("Scoring service request failed", { stage });
      return respond(503, { error: "Scoring is unavailable." });
    }
  };
}
