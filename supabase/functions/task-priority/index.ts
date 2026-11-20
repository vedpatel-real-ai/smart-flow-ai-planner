import { scoringHandler } from "./handler.ts";

Deno.serve(scoringHandler({
  url: Deno.env.get("SUPABASE_URL") ?? "",
  publicKey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
}));
