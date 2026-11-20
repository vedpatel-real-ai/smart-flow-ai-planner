# Ranking and recommendations

The task list orders open work using four attributes supplied with each task. The calculation uses a single clock reading for the whole refresh. A higher number moves a task up the list. It has no probability interpretation.

| Input | Contribution |
| --- | --- |
| Priority | Low 2, Medium 4, High 6, Critical 8 |
| Time remaining until the deadline | Under 24 hours including overdue adds 3, under 72 hours adds 2, under 168 hours adds 1 |
| Age since creation | More than 168 hours adds 0.5 |
| Estimated duration | A positive estimate of up to 30 minutes adds 0.3 |

All other contributions are zero. The pure function uses elapsed UTC time, so crossing midnight while travelling has no special effect. A missing priority uses Medium. Missing dates or durations contribute zero for their respective terms. For a critical task created eight days ago, due in twelve hours and estimated at 20 minutes, the score is **8 + 3 + 0.5 + 0.3 = 11.8**. A deadline exactly 24 hours away contributes 2. Ties use task ID to keep ordering stable.

## When ranking changes

Creating a task or a batch of occurrences refreshes the ranking. An edit containing priority, duration or deadline fields requests another refresh in Cloud Mode. Demo recalculates on each task edit inside the browser-store transaction. Completion takes the task out of the open set and clears its score. **Refresh ranking** updates time-sensitive scores after a workspace has been idle. Existing scores remain visible between refreshes.

In Cloud Mode the browser invokes the `task-priority` Edge Function. It verifies the session with Auth and forwards the same bearer token and public project key on its PostgREST requests. It scans open tasks by ID in bounded pages and sends changed scores to PostgreSQL in one transaction. Every update must match the caller, task ID and original modification time. A concurrent edit rolls that scoring transaction back. The client retries a stale calculation once and serializes requests from the same workspace instance. The UI reads the stored values again after the operation.

Saving the task and refreshing its rank are separate cloud operations. If scoring fails after the write commits, the form closes and explains that the task was saved. Use **Refresh ranking** to retry. Demo computes the same formula before its single browser-storage write. Each mode maintains its own data.

## Why an overview tip appears

Overview suggestions count overdue open tasks, critical open tasks, open tasks without a planned start and today's planned workload above the configured daily limit. Each tip states the condition or count observed. The suggestions switch controls these messages. Changing that preference leaves task ranking independent of the switch. The daily planner link opens the planning screen.

The rules use no external model, training history, personal productivity prediction or calibrated confidence score. The fixed weights are a product choice. Large accounts currently require a scan of all open tasks for a full cloud refresh. The handler avoids writing unchanged scores. Persistent network failures leave the last successfully stored scores in place.

See the [shared formula](../../supabase/functions/_shared/scoring.ts), [HTTP handler](../../supabase/functions/task-priority/handler.ts), [suggestion rules](../../src/domain/metrics.ts), [handler regression tests](../../supabase/functions/task-priority/handler_test.ts) and [local Supabase integration tests](../../tests/integration/cloud.test.ts).
