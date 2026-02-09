# WF1 Rollback Runbook

## Objective
Rollback from dedicated WF1 backend to N8N with config-only changes and no redeploy of business logic.

## Preconditions
- Widget and host already support provider selection (`n8n|dedicated`).
- N8N WF1 endpoint is healthy.
- Dedicated backend remains running for diagnostics.

## Immediate rollback (under 1 minute)
1. In widget/host env, set `VITE_CHAT_WF1_PROVIDER=n8n`.
2. Set `VITE_CHAT_WF1_CANARY_PERCENT=0`.
3. Keep `VITE_CHAT_WF1_SHADOW_MODE=true` only if you still want mirrored diagnostics; otherwise set `false`.
4. Rebuild/redeploy frontend static assets.

## Verification checklist
1. Send product query from guest user and confirm N8N response.
2. Send order query from guest user and confirm `requiresAuth=true` behavior remains.
3. Validate no 5xx spike in frontend monitoring.
4. Confirm dedicated service still receives no primary traffic.

## Canary rollout after incident
1. Start with `VITE_CHAT_WF1_PROVIDER=n8n` and `VITE_CHAT_WF1_CANARY_PERCENT=10`.
2. Observe error rate + latency for 30-60 min.
3. Move to 50 then 100 if stable.
4. Final state for full cutover: `VITE_CHAT_WF1_PROVIDER=dedicated`.

## Incident data to collect
1. Request IDs from dedicated service (`x-request-id`).
2. `audit_logs` rows by time window and status.
3. `external_events` duplicate/error records.
4. N8N execution logs for same conversation IDs.
