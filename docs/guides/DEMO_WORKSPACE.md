# Demo and Cloud workspaces

**Explore Demo** opens a populated planner on this browser profile. Signing in to Cloud opens the same Overview, Task Manager, Daily Planner and Analytics using the signed-in account’s Supabase records. A new Cloud account starts with zero tasks. Use **Create your first task** on Overview, then choose a planned start in the editor or schedule the task in Daily Planner.

[Demo overview](../images/overview.png) · [New Cloud account](../images/cloud-empty.png) · [Populated Cloud overview](../images/cloud-overview.png) · [Cloud analytics](../images/cloud-analytics.png)

## Fresh Demo sample

The browser calls `createDemoWorkspace(anchor)` when it first opens an empty store or after a confirmed reset. Every date, score and relationship in the sample uses that one instant. Reopening a saved workspace restores its dates and history. Tasks can therefore become overdue while the browser is closed.

| Records at creation | Count |
|---|---:|
| Tasks | 48 |
| Completed tasks and corresponding completion events | 20 each |
| Open tasks | 28 |
| Open overdue deadlines | 2 |
| Open deadlines today | 0–4 |
| Open deadlines after today | 19–23 |
| Unscheduled open tasks, all without deadlines | 3 |
| Open scheduled sessions, including four on the anchor day | 25 |
| Weekly architecture sync occurrences, included above | 5 (2 completed, 3 open) |

The six categories are Product, Engineering, Design, Research, Meetings and Operations. The preferred workday is 09:00–17:00, the daily task limit is eight and suggestions start enabled. Two completed series occurrences retain their historical planned starts, giving 27 tasks with a planned start in all.

The four anchor-day sessions start at 09:30, 11:00, 14:00 and 16:00. Their deadlines fall after the session or at its end. When an anchor-relative deadline would cross midnight, it moves to 09:00 the next day. Sessions and deadlines are independent. The next architecture sync falls on the next weekday and repeats at the same local time each week.

Before 10:00 all 20 completion events are historical. At 10:00 one event belongs to this morning, and from 11:00 two do. Each completed task has one event. The initial completion rate is 20/48, displayed as 41.7%.

## How the shared views calculate values

Both providers return tasks, categories, preferences and completion events to the same React components. The overview counts open deadlines on the local date. Weekly bars count events by their local completion date from Monday through Sunday. Streaks count consecutive active days ending today or yesterday. The completion rate uses current task status. An empty task set has no rate. Average duration uses only events with a recorded duration.

Priority combines the priority level, deadline urgency, age and estimated duration. Open tasks appear in descending saved score order. Recommendations use workload conditions and the saved suggestion preference. [Ranking details](../architecture/RECOMMENDATIONS.md)

## Saving and recovery

Demo stores version 2 JSON under `smart-taskflow-demo-store`. Every read–modify–write operation takes an exclusive Web Lock with that same name. Other tabs refresh when storage changes. A browser without Web Locks shows a recovery message. Use a supported browser on HTTPS or localhost for editing.

**Export saved data** downloads the current raw store, including malformed data. **Reset demo** asks before replacing the store with a newly dated sample. Cancelling keeps the original. A failed write shows an error. A valid existing version 2 store retains its customizations, and older unversioned stores follow the existing compatibility migration.

Cloud uses the authenticated provider, its own persistence and database ownership checks. Switching modes or signing out does not transfer records. Demo backup and reset controls appear only in the local workspace.

## Reproducing verification

Run `npm test` for fixture counts, relationships, intervals, timezone boundaries, storage behavior and domain rules. The Playwright suite exercises actual browser storage and a disposable Supabase account. Its shared-view checks cover keyboard scheduling, task and event persistence, empty and populated Cloud views, mode switches, four viewport sizes and automated accessibility scans. The screenshot tests use a fresh browser profile. Set `CAPTURE_README_IMAGES=1` for the browser run to update the guide images. [Commands and prerequisites](../verification/TEST_VERIFICATION.md)
