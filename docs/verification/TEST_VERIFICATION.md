# Test verification

Use the commit and run ID to identify a result. GitHub tests the checked-out merge revision on pull requests and the branch revision on pushes. The workflow records both the checkout SHA and available PR head SHA. A later documentation commit can refer to an earlier tested SHA without embedding a self-referential hash.

[Issue-by-issue acceptance and local evidence](ACCEPTANCE.md)

## Reproduce locally

Use Node 24, Deno 2.9.6, Python 3 and Docker. Use a full Git clone because database upgrade tests read both original SQL files from commit `fda439e2e94c502890c2600e14e7c927670fdc57`. Run the following from the repository root.

```sh
npm ci
npm run verify
node --test tests/database/planning.test.mjs
npx supabase start -x realtime,storage-api,imgproxy,studio,mailpit,logflare,vector,supavisor
node scripts/with-local-stack.mjs npm run test:integration
npx playwright install chromium
node scripts/with-local-stack.mjs npm run test:e2e
```

The native PostgreSQL suite creates a temporary database server and never connects to a supplied database. The integration and browser commands use the project-local Supabase stack on port 57421. The wrapper supplies only its public URL and anon key. The test accounts and tasks are synthetic. Do not point the suites at a hosted project. The CI fresh-reset command targets only its disposable local stack. Stop the stack when finished.

## What each suite proves

| Suite | Boundary and evidence |
|---|---|
| [Vitest unit and Demo contract](../../tests/unit) | Session transitions, store errors, scoring, recurrence, timezones, edit behavior, analytics and suggestions. |
| [Native PostgreSQL](../../tests/database/planning.test.mjs) | Fresh and populated historical installs, row policies under synthetic subjects, transaction rollback, concurrency and idempotency. |
| [Supabase integration](../../tests/integration) | Real signup, owner-scoped API requests, shared adapter contract and score persistence through the local Edge gateway. |
| [Deno HTTP](../../supabase/functions/task-priority/handler_test.ts) | Failure injection at Auth and REST boundaries with controlled transports. Full service integration runs separately. |
| [Playwright](../../tests/browser) | Real Chrome/Chromium, task lifecycle, local restart, cloud writes, interrupted requests, calendar interactions, layout and keyboard alternatives. |

The static checks independently run both TypeScript projects, ESLint, Vite and Deno. ESLint can report development Fast Refresh warnings where modules export components alongside hooks or component utilities. Vite can warn about a large generated chunk. Browser tests use desktop and emulated viewports. They do not measure physical touch or screen-reader behavior.

## Evidence and retention

[Verify Smart Flow workflow](../../.github/workflows/verify.yml) · [Run history and downloadable artifacts](https://github.com/vedpatel-real-ai/smart-flow-ai-planner/actions/workflows/verify.yml)

Each run attempts to upload its evidence even after a failure. The artifact includes `manifest.json`, per-gate exit codes and logs, separate JUnit reports, a readable summary, and `SHA256SUMS`. A failure before a suite begins leaves no result for that suite. Treat it as unexecuted. To check integrity, extract the artifact and run `shasum -a 256 -c SHA256SUMS` inside it. Detailed Actions artifacts expire after 30 days. Keep a release-linked copy if publishing a release. Versions and totals belong to the recorded checkout. The original audit’s 40 acceptance checks used a different methodology and are not included in these totals.
