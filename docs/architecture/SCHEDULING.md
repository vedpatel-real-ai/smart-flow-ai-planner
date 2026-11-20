# Scheduling and recurrence

A deadline answers “When is this due?” A planned start answers “When will I work on it?” Both are optional instants. Creating a deadline alone leaves the task in the global unscheduled backlog. Moving a task in the planner changes only its planned start. The task editor exposes both fields.

## Daily planner

Choose a date, then use **Schedule** or drag a task to a working-hour row. The dialog accepts off-hours placements and minute-level precision. **Return to backlog** clears the placement. The working-hours grid uses the workspace preference. The scheduled-work list includes every open interval touching the selected calendar day, including work crossing midnight. The deadlines list includes completed tasks due that day.

An open task reserves its estimated duration, or 30 minutes when the estimate is missing. Estimates can be 1–1,440 whole minutes. Intervals include the start and exclude the end. A 90-minute task at 09:00 permits another task at 10:30. Completion frees the interval. Demo validates changes against the locked local store. PostgreSQL validates them in the write transaction. Manual placements and recurring placements use the same boundaries. The planner shows conflicts and keeps the existing placement when a save fails.

Working hours guide placement without restricting it. Automatic placement is outside the current feature set. The planner offers persisted manual placements and a keyboard-accessible date/time dialog.

## Calendar policy

The editor, calendar, streaks and weekly chart use the browser's current time zone. Cloud timestamps use PostgreSQL `timestamptz`. Browser storage and requests use ISO 8601 instants. An HTML date input represents a local calendar day. Local midnight to the next local midnight can span 23 or 25 hours. The profile timezone field is reserved for future account-wide display settings.

The editor retains the original instant, including seconds and fractional seconds, when the displayed minute is unchanged. A newly entered local time in a DST gap is rejected. Newly entered repeated times use the earlier offset. Existing values retain their offset when saved unchanged.

## Recurring tasks

Select Daily, Weekly or Monthly, an interval of 1–365 and a total count of 1–30. Supply a deadline, a planned start, or both. The first occurrence is included in the count. Each populated timestamp is advanced independently from its original local date and time. January 31 produces February 28 (29 in a leap year), then March 31. Generated occurrences in a spring-forward gap move forward by the gap. Later occurrences resume their original wall time. Ambiguous generated times use the earlier offset.

The form creates stable task and series UUIDs when opened. The saved rows share a series ID and have distinct occurrence indices. A batch is written atomically. Retries from the same open form retain their identities. After an interrupted save and a browser restart, check the task list before opening a new form.

Edit the date or time of one occurrence, or update shared metadata across the entire series. Series-wide edits can change title, description, tags, category, priority and duration. The original recurrence cadence and count are fixed at creation. To replace the cadence, review existing placements and explicitly create and remove the relevant series. New occurrences cannot reserve times still occupied by the old ones. Deleting a single occurrence leaves its siblings intact. The delete dialog also offers deletion of the entire series. Older tasks without a reliable series ID remain independently editable.

[Calendar calculations](../../src/domain/calendar.ts) · [Planner controls](../../src/components/TimeBlocks.tsx) · [Task editor](../../src/components/TaskDialog.tsx) · [Calendar regressions](../../tests/unit/calendar.test.ts) · [Browser workflows](../../tests/browser/planner.spec.ts)
