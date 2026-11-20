# Demo Workspace Guide

Smart Flow provides an instant, zero-configuration Demo Mode that lets visitors explore a realistic, populated productivity workspace directly in the browser without creating an account or providing Supabase credentials.

This guide details the synthetic fixture architecture, persistence model, concurrency safeguards, error recovery, and verification guarantees.

---

## 1. Overview and Design Principles

Demo Mode is designed to showcase the full capabilities of Smart Flow immediately upon first visit:
- **Instant Productivity Context**: Visitors open a mature workspace with several weeks of realistic activity, including prioritized tasks, scheduled calendar sessions, and multi-week completion analytics.
- **Genuine Synthetic Application Data**: All metrics, charts, and recommendations are dynamically computed from underlying task and event records. There are no hardcoded visual statistics.
- **Full Interactivity**: Visitors can create, edit, drag-and-drop schedule, complete, and delete tasks. Any action dynamically updates the dashboard overview, daily planner, and analytics reports.
- **Complete Cloud Isolation**: Demo Mode executes entirely inside the browser. It never connects to Supabase, issues network requests to cloud databases, or affects cloud user data.

---

## 2. Synthetic Dataset Architecture

All Demo records are produced atomically by a single deterministic generator: `createDemoWorkspace(anchor: Date = new Date())` in `src/demo/fixtures.ts`.

### Workspace Composition

| Component | Count | Description |
|---|---|---|
| **Total Tasks** | 48 | Complete dataset representing an active professional workspace. |
| **Open Tasks** | 28 | Active tasks partitioned across today, overdue, upcoming, and backlog. |
| **Completed Tasks** | 20 | Historical tasks with matched completion events spanning the past 14 days. |
| **Categories** | 6 | Engineering, Product, Design, Operations, Personal, Learning (each with custom hex colors). |
| **Due Today** | 4 | Scheduled in working hours today (09:00, 11:30, 14:00, 16:00) with various priorities. |
| **Overdue** | 2 | Open tasks whose deadlines passed yesterday, scheduled in past working hours. |
| **Upcoming** | 16 | Distributed across future days (+1 to +10 days) with scheduled calendar blocks. |
| **Backlog (Unscheduled)**| 3 | Unscheduled open tasks ready for drag-and-drop placement in the daily planner. |
| **Recurring Series** | 1 | Weekly engineering architecture sync (4 occurrences: 1 completed, 3 scheduled). |
| **Completion Events** | 20 | 1:1 mapped to completed tasks with realistic measured durations (15–90 min). |
| **User Preferences** | 1 | Configured with `working_hours_start: 9`, `working_hours_end: 18`, `daily_task_target: 5`, and recommendations enabled. |

### Time-Aware Clock Adaptability

The generator anchors all timestamps relative to a single instant (`anchorNow`):
- **No Future Completions**: All completion events and task completion timestamps are strictly $\le$ `anchorNow`.
- **Anchor Normalization**: Calendar days are calculated using midnight boundaries of the anchor date in the browser's current local timezone.
- **Night and Weekend Resilience**: If the visitor opens Demo Mode outside standard working hours (e.g., late at night or on a weekend), tasks due today remain bound to the anchor date's calendar hours, preventing negative duration offsets or invalid date clamps.
- **Interval Separation**: Scheduled working intervals are disjoint and non-overlapping.

### Streak and Completion Invariants

`src/domain/metrics.ts` computes an active daily streak by stepping backward day-by-day from today. The fixture generates a continuous 5-day active streak ending today, with completion events distributed across Monday through Sunday so that weekly analytics bar charts show realistic daily progress.

---

## 3. Storage and Concurrency Model

### Storage Key and Schema Versioning

Demo Mode persists state in browser `localStorage` under the key:
```
smart_flow_demo_v2
```

- **Schema Stability**: Storage version 2 is preserved. No unnecessary storage schema bumps occur.
- **Safe Parsing**: Reading storage is wrapped in structured try/catch handling with fallback re-seeding to prevent blank-screen unhandled exceptions if the stored JSON becomes corrupted.
- **Data Preservation**: Returning visitors retain their modified tasks, schedules, and preferences across browser refreshes and restarts. Fresh browser profiles automatically seed with the rich 48-task dataset.

### Web Locks and Cross-Tab Safety

To prevent race conditions during concurrent task operations across multiple open browser tabs:
1. **Secure Contexts (HTTPS / localhost)**:
   The adapter uses the Web Locks API (`navigator.locks.request("smart_flow_demo_v2_lock", ...)`). Reads and writes are atomic and serialized across tabs.
2. **Insecure Context Fallback**:
   If Web Locks are unsupported (e.g., plain HTTP over non-localhost LAN IPs), the adapter falls back to an in-memory queue.
   > [!WARNING]
   > The fallback queue serializes writes within a single browser tab, but cannot coordinate across independent tabs. A diagnostic warning is logged to the console:
   > `[DemoProvider] Web Locks API is unavailable in this environment. Falling back to single-tab queued writes; cross-tab synchronization is not guaranteed.`

---

## 4. Error Recovery and Troubleshooting

The workspace is wrapped in a dedicated React `ErrorBoundary` (`src/components/ErrorBoundary.tsx`):

- **Cloud Mode Handling**: Unhandled rendering exceptions display a clean error alert with a standard "Reload page" action.
- **Demo Mode Handling**: Unhandled exceptions offer three safe recovery options:
  1. **Reload page**: Re-attempts rendering the current state.
  2. **Export saved data**: Downloads the existing `localStorage` data as a JSON file (`smart_flow_demo_backup.json`) so user work is never lost.
  3. **Reset demo workspace**: Displays an explicit confirmation dialog before clearing local storage and re-seeding fresh sample data.
- **No Silent Data Deletion**: Corrupted data is never deleted automatically without explicit user confirmation.

---

## 5. Verification and Automated Testing

The Demo Mode implementation is protected by comprehensive unit and end-to-end browser tests:

### Unit Tests (`tests/unit/demo-seed.test.ts`)
- **Atomic Workspace Generation**: Verifies 48 tasks, 20 completions, 6 categories, and user preferences.
- **Relational Integrity**: 1:1 foreign key relationships between completion events and completed tasks; category IDs strictly match defined category sets.
- **Clock Guarantees**: Completed timestamps never exceed `anchorNow`.
- **Interval Validity**: Start intervals are strictly positive (`start < end`) and do not overlap.
- **Metric Calculations**: Assertions confirm that `metrics()`, `recommendations()`, and daily planner backlogs calculate expected results without runtime errors.
- **Edge-Case Clock Invariance**: Validates generation at 00:00 (midnight), 23:59 (late night), and on Saturdays/Sundays across multiple timezones.

### Browser Tests (`tests/browser/demo-journey.spec.ts`)
- **Dashboard Overview**: Verifies dynamic metric cards (Due Today, Completed Today, Open Tasks, Completion Rate).
- **Daily Planner**: Validates scheduled working blocks and unscheduled backlog placement.
- **Task Management**: Validates search, category filtering, priority tagging, and task creation.
- **Interactive State Updates**: Completing an open task immediately updates dashboard completion counts, completion rate, and analytics history.
- **Persistence Across Reloads**: Verifies changes persist after a full page reload without resetting.
- **Controlled Workspace Reset**: Validates the Reset Demo dialog and confirms clean re-seeding.
- **Responsive Viewports**: Verifies layout integrity across desktop (1280px), tablet (768px), and mobile (390px).

---

## 6. Cloud Mode Isolation Guarantee

The Demo Mode implementation preserves all Cloud Mode contracts:
- Supabase authentication routines and session listeners remain untouched.
- Cloud persistence via PostgREST and Edge Function `task-priority` remain unchanged.
- PostgreSQL migrations, Row-Level Security (RLS) policies, and database triggers are unmodified.
- No shared presentation components introduce regressions into Cloud views.
