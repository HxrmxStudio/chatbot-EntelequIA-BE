# WF1 Idempotency Guarantees

## Scope

This document defines idempotency behavior for message persistence and outbox generation in WF1.

## Guarantees

1. **External event idempotency (request level)**
   - `external_events(source, external_event_id)` is unique.
   - Duplicate requests for the same pair are short-circuited and do not create new processing side effects.

2. **Message dedupe**
   - `messages` uses a unique key per `(channel, external_event_id, sender)`.
   - For the same external event in the same channel, only one `user` row and one `bot` row are allowed.

3. **Outbox dedupe (WhatsApp only)**
   - Outbox rows are inserted only for `source=whatsapp`.
   - Unique dedupe key is `(message_id, channel, to_ref)` with predicate `message_id IS NOT NULL`.
   - Re-insertions of the same message key do not create duplicates.

4. **Web behavior**
   - `source=web` persists `messages` and `audit_logs`.
   - `source=web` does not enqueue `outbox_messages`.

## Validation Coverage

Integration tests:

1. `/Users/user/Workspace/chatbot-EntelequIA-BE/test/integration/wf1/repositories/pg-chat.repository.integration.spec.ts`
2. `/Users/user/Workspace/chatbot-EntelequIA-BE/test/integration/wf1/outbox-idempotency.integration.spec.ts`

