import { execFileSync, spawnSync } from "node:child_process";
import { localCli } from "./local-cli.mjs";

// Forward only public connection information to the test process.
const status = JSON.parse(execFileSync(localCli, ["status", "-o", "json"], { encoding:"utf8" }));
const url = new URL(status.API_URL);
if (url.hostname !== "127.0.0.1" || url.port !== "57421") throw new Error("Expected the local smart-flow-verify stack on port 57421.");
if (!status.ANON_KEY) throw new Error("Local stack is missing its public client key.");
const [command, ...args] = process.argv.slice(2);
if (!command) throw new Error("Provide the test command to run.");
const run = spawnSync(command, args, { stdio:"inherit", env: { ...process.env,
  SMART_FLOW_TEST_URL:url.origin, SMART_FLOW_TEST_ANON_KEY:status.ANON_KEY } });
if (run.error) throw run.error;
process.exitCode = run.status ?? 1;
