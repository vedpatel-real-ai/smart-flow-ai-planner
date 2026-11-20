import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { localCli } from "./local-cli.mjs";

const generated = execFileSync(localCli, ["gen","types","typescript","--local","--schema","public"], {encoding:"utf8"});
const committed = readFileSync("src/integrations/supabase/types.ts","utf8");
if (generated.trimEnd() !== committed.trimEnd()) {
  throw new Error("The checked-in TypeScript database types differ from the freshly migrated local schema.");
}
console.log("Generated public schema types match the checked-in file.");
