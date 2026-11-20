# Deploying a cloud workspace

1. Prepare a staging Supabase project or a restored copy. Check the applied migration versions and compare the actual schema, particularly on installations created from one of the original SQL files. Inspect the migration preflights and back up existing data. [Schema and upgrade paths](../architecture/DATA_MODEL.md)
2. Verify the full suite in a disposable environment. Rehearse the upgrade on staging and compare task, account, preference and event counts. Review every migration before approving changes to a hosted project. [Verification](../verification/TEST_VERIFICATION.md)
3. Configure Supabase Auth for the intended site URL and allowed redirect URLs. Choose the email confirmation and delivery settings appropriate to that environment.
4. For an approved target, deploy the reviewed migrations and the `task-priority` Edge Function through your normal Supabase release process. A project operator can use `supabase functions deploy task-priority --project-ref <approved-ref>`. The function needs the server-provided Supabase URL and public anon key. It forwards the user's bearer token to Auth and PostgREST.
5. Build the static frontend using `npm ci` and `npm run build`. Provide `VITE_SUPABASE_URL` and a publishable or legacy anon key at build time. Keep service-role keys and secret keys out of all Vite variables and client bundles.
6. Serve `dist/` over HTTPS and send application routes to `index.html`. A Netlify-compatible fallback is included in `public/_redirects`. Configure an equivalent fallback on other hosts.
7. Smoke-test signup, sign-in, one task mutation, score refresh, completion and sign-out using a dedicated staging account. Verify error behavior with the frontend still displaying the selected workspace. Keep deployment receipts tied to the revision actually deployed.

Hosted configuration, external email delivery and production migrations require independent deployment verification.
