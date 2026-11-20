# Technical FAQ

## Project and architecture

**1. What problem does Smart Flow solve?** A list tells you what exists. The ranking helps you choose what deserves attention, the planner reserves time to do it, and completion history shows what was finished. A task can have a deadline long before you decide when to work on it. [Overview](architecture/OVERVIEW.md)

**2. How is the application organized?** The React workspace calls a typed planner service. The current identity selects a local browser adapter or authenticated Supabase adapter. Both return tasks, categories, preferences and completion events in the same snapshot shape. [Service contract](../src/providers/contract.ts)

**3. Why React and TypeScript?** React lets the task editor, planner and reports share one workspace snapshot while managing their own interaction state. TypeScript describes the operations each adapter must implement and the fields a consumer can read. Runtime validation also checks data crossing the storage boundary. [Workspace provider](../src/providers/DataProvider.tsx) · [Contract](../src/providers/contract.ts)

**4. What happens when I create a task?** The form validates its fields, converts local time to an instant and assigns stable IDs to the requested rows. The adapter writes the batch, refreshes scores and reloads the workspace. A failed task write keeps the form available. If only scoring fails after a save, the interface reports the saved task and the separate ranking problem. [Editor](../src/components/TaskDialog.tsx) · [Write feedback](../src/components/usePlannerAction.ts)

## Ranking and recommendations

**5. How does task prioritization work?** The score starts at twice the priority weight, then adds deadline urgency and small bonuses for age and a short estimated duration. A new Critical task with no deadline and a 20-minute estimate scores 8.3. [Scorer](../supabase/functions/_shared/scoring.ts)

**6. Does the app use machine learning?** The scorer and suggestion rules are deterministic. The same inputs at the same time produce the same score. The project has no trained model, training dataset or calibrated confidence estimate. [Ranking design](architecture/RECOMMENDATIONS.md)

**7. Which inputs influence ranking?** Priority, deadline, creation time and estimated duration affect the score. Missing deadlines and durations add no corresponding bonus. A category or tag helps organize a task without changing its score. [Scoring inputs](../supabase/functions/_shared/scoring.ts)

**8. When are scores recalculated?** Task creation and edits trigger a refresh. **Refresh ranking** updates time-dependent scores as work ages or deadlines approach. The displayed score is persisted and can age between refreshes. Completed work leaves the open-task ranking. [Adapters](../src/providers)

**9. How are recommendations different from ranking?** A score orders tasks. A recommendation explains an observed condition, such as having more tasks scheduled today than the daily target. Turning off suggestions removes these messages. [Rules](../src/domain/metrics.ts)

## Backend and security

**10. Why are there two backend modes?** Demo lets someone try the planner with an instant, realistic sample workspace (48 tasks across 6 categories, multi-week completion history, 5-day active streak, scheduled calendar blocks) and no account. Cloud uses authenticated, account-scoped storage that can be accessed from another browser. [Demo workspace guide](guides/DEMO_WORKSPACE.md) · [Workspace selection](../src/pages/Auth.tsx)

**11. What happens during a cloud outage?** The failing operation reports an error or a retry action. The workspace retains its cloud identity. A timeout can leave a write’s outcome uncertain. Retrying an unchanged creation in the same open form reuses the original IDs. [Session lifecycle](../src/auth/session.ts) · [Data model](architecture/DATA_MODEL.md)

**12. Does Demo automatically synchronize with Supabase?** No. Demo reads and writes a JSON value in the current browser profile under `smart_flow_demo_v2`. Selecting Cloud loads the signed-in account’s database records. There is no queue or data transfer between the two. [Service selection](../src/providers/service.ts)

**13. How does Demo Mode coordinate concurrent tab writes?** On secure contexts (HTTPS and localhost), Demo coordinates writes using the Web Locks API (`navigator.locks.request`). Reads and writes acquire an exclusive lock, guaranteeing atomic updates across multiple tabs. In insecure contexts where Web Locks are unavailable, the adapter falls back to an in-memory queue that serializes writes within that single tab and logs a diagnostic warning noting that cross-tab synchronization cannot be guaranteed. [Demo workspace guide](guides/DEMO_WORKSPACE.md)

**14. What happens if Demo Mode hits an unhandled rendering error?** An isolated React Error Boundary catches unhandled exceptions. In Demo Mode, the error view offers actions to reload the page, export the saved local state as a downloadable JSON backup (`smart_flow_demo_backup.json`), or reset the workspace with an explicit confirmation dialog. Stored data is never silently deleted. [Demo workspace guide](guides/DEMO_WORKSPACE.md)

**15. How does authentication work?** Cloud sign-in uses Supabase Auth. When restoring a saved cloud session, the adapter checks the user with Auth. A signup requiring email verification leaves the workspace closed until sign-in. Demo entry selects a local sample identity and requires no password. [Auth integration](../src/integrations/supabase/client.ts)

**16. What does row-level security do?** PostgreSQL uses the authenticated subject to filter accessible rows and constrain writes. For example, listing tasks while signed in as one user returns that user’s tasks. The same policies apply behind the scoring function because it forwards the caller’s token. [Database tests](../tests/database/planning.test.mjs)

**17. How are cross-user relationships protected?** Owner-qualified foreign keys bind related records to the same user. A task may refer to one of its owner’s categories, and a history event belongs to the owner of the referenced task. The database enforces these invariants for API requests. [Model](architecture/DATA_MODEL.md) · [Authenticated API tests](../tests/integration/ownership.test.ts)

**18. What does the Edge Function do?** It validates the method, request body and bearer token, asks Auth for the user, pages through open tasks under that identity and calculates scores at one clock instant. A database operation verifies the target versions and the handler checks the affected count before reporting success. [Handler](../supabase/functions/task-priority/handler.ts)

## Scheduling and reliability

**19. What does dragging a task change?** Dropping it on a working-hour row saves a planned start on the selected day. The date/time dialog can make the same change with minute precision or return the task to the backlog. The task retains its deadline. [Planner controls](../src/components/TimeBlocks.tsx)

**20. How are scheduling conflicts prevented?** Open tasks reserve start-inclusive, end-exclusive intervals. The estimate determines the length, with a 30-minute default. A database exclusion constraint arbitrates concurrent cloud placements. Demo checks the locked store before committing. [Scheduling](architecture/SCHEDULING.md)

**21. How does recurrence work?** The editor generates 1–30 occurrences from a calendar anchor. Every other week uses a weekly interval of two. Month-end recurrence clamps dates to the last day and returns to the anchor in longer months. Each saved occurrence has its own task ID and shares a series ID. [Series operations and DST rules](architecture/SCHEDULING.md)

**22. What if I complete a task twice?** Completing it moves the task and writes its one history event together. Repeated and concurrent requests observe the completed state. Deleting the task also deletes that event. The database tests inject a history failure and check that the entire transition rolls back. [Transaction tests](../tests/database/planning.test.mjs)

**23. How are timezones handled?** Timestamps represent instants. The editor and reports use the browser’s current timezone for wall times and calendar days. An unchanged edit preserves the original instant, including seconds and the offset of a repeated DST hour. [Calendar helpers](../src/domain/calendar.ts)

## Analytics and quality

**24. What do the analytics measure?** Completion rate is completed current tasks divided by all current tasks. Weekly counts use completion events from Monday through Sunday. The streak counts consecutive local dates with at least one event, ending today or yesterday. Average duration uses valid measurements only. Older deleted tasks no longer contribute. [Metrics](../src/domain/metrics.ts)

**25. How does the app avoid misleading productivity statistics?** It uses task rows and recorded events for measurements, labels the cohort, and displays an empty state when measurements are unavailable. Advice describes its triggering condition. There is no inferred focus time or claimed improvement percentage. [Analytics view](../src/components/Analytics.tsx)

**26. How is the app tested?** Fixed-clock tests cover rules and calendars. Native PostgreSQL tests run original migration fixtures, owner constraints and concurrent writes. Integration tests use real local Auth, PostgREST and Edge. Chromium drives the actual UI, including persistence across browser processes. [Test suites](../tests)

**27. How do I independently verify the evidence?** Select a workflow run for the revision you want. Compare its checkout SHA to the artifact manifest, verify the checksums and inspect individual JUnit reports. Pull-request runs can test a synthetic merge commit. The guide explains how to repeat the checks locally. [Verification](verification/TEST_VERIFICATION.md)

**28. What limitations matter in practice?** Demo shares a browser profile, cloud writes need a connection, and local wall time follows the device. Series cadence and count are set on creation. The workspace loads paginated results into memory. Real-device usability and hosted deployment require their own checks. [Scheduling policy](architecture/SCHEDULING.md) · [Deployment](guides/DEPLOYMENT.md)

**29. What trade-offs shaped the implementation?** Bounded, materialized occurrences make individual edits and conflict checks visible in the database. Atomic writes and stable IDs add some schema complexity but make retries meaningful. A shared pure score keeps local and cloud ranking explainable. [Data model](architecture/DATA_MODEL.md) · [Scorer](architecture/RECOMMENDATIONS.md)

**30. What are reasonable future improvements?** Account-wide timezone display, changing an existing series cadence, automation with a reviewed placement preview, and large-workspace benchmarks could extend the current planner. These require product decisions and additional verification. [Current scheduling contract](architecture/SCHEDULING.md)
