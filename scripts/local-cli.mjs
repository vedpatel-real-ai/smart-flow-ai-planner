import { existsSync } from "node:fs";
import { resolve } from "node:path";

const macBinary = resolve("node_modules/@supabase/cli-darwin-arm64/bin/supabase-go");
export const localCli = process.env.SUPABASE_CLI ?? (
  process.platform === "darwin" && process.arch === "arm64" && existsSync(macBinary)
    ? macBinary : resolve("node_modules/.bin/supabase")
);
