# Local development

Install Node 24, npm, Git and Deno 2.9.6. Docker is needed for the Supabase integration suite. From the repository root:

```sh
npm ci
npm run dev
```

Open http://localhost:8080. A secure browser context (localhost or HTTPS) with Web Locks and localStorage supports Demo. Choose **Explore Demo**. Normal sign-out retains the tasks. Use **Reset demo** only when you intend to replace that origin’s sample workspace.

## Disposable cloud workspace

Start Docker, then run:

```sh
npx supabase start -x realtime,storage-api,imgproxy,studio,mailpit,logflare,vector,supavisor
```

The repository’s test project uses API port 57421 and database port 57422. To develop against that stack, copy `.env.example` to `.env.local`. Enter the local API URL and the **public** client key shown by the CLI. Restart Vite. Register a synthetic account in the cloud form. Local development disables email confirmations. Hosted Auth policy is configured independently.

The local stack serves the scoring function under `/functions/v1/task-priority`. Start the function watcher with `npx supabase functions serve task-priority` when you need to reload changes on a CLI configuration that does not serve them automatically. [Verification commands](../verification/TEST_VERIFICATION.md)

## Common failures

| Symptom | What to check |
|---|---|
| The entry screen explains that cloud configuration is missing | Set the Vite URL and public key, then restart the dev server. Static deployments require a rebuild. |
| Registration asks for email verification | Follow the Auth verification email, then sign in. A pending signup has no active workspace. |
| The workspace read fails | Keep the cloud identity selected. Check connectivity, applied migrations, Auth session and RLS. Retry the read after resolving the error. |
| A task saved with a ranking warning | Check the Edge function and its caller-scoped access. Use Refresh ranking after recovery. |
| A saved task disappears from the backlog | Check planned start and the selected planner day. Completing it also releases its reservation. |
| A migration reports conflicting existing records | Inspect the diagnostic in the migration on a staging copy, preserve a backup and resolve the ownership or history discrepancy. |
| An Apple Silicon CLI wrapper exits with SIGKILL | With the pinned npm package, its bundled `node_modules/@supabase/cli-darwin-arm64/bin/supabase-go` binary implements the same v2 subcommands. |

Stop the local project with `npx supabase stop`. Keep backups of any local workspace you intend to retain. [Deployment guide](DEPLOYMENT.md)
