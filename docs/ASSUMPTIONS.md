# Assumptions

## 2026-02-09

1. **Service location override**: I implemented the dedicated WF1 backend in `/Users/user/Workspace/chatbot-EntelequIA-BE` because the latest execution request explicitly set this path as the new chatbot backend repository location. The older path `/Users/user/Workspace/chatbot-EntelequIA/chatbot-wf1-service` is treated as superseded for this run.
2. **Node runtime**: Local environment currently reports Node `v23.5.0`; the service is written to be compatible with Node 20 LTS and this remains the target runtime for deployment.
3. **Audit table**: The reusable schema file includes `users`, `conversations`, `messages`, `external_events`, and `outbox_messages` but no explicit `audit` table. I add and use an `audit_logs` table in this service migrations for required request auditability.
