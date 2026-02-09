# AGENTS

Base guidance for AI agents working in this repository.

## Project focus

- Dedicated WF1 backend service (NestJS + TypeScript + PostgreSQL).
- Preserve endpoint contract parity and safe rollback behavior.

## Working priorities

1. Keep changes minimal, localized, and verifiable.
2. Preserve API contracts and idempotency/audit invariants.
3. Prefer existing architecture patterns (ports + adapters + use-cases).
4. Keep security-safe behavior (no secret leaks, safe error responses).

## Rules source

- Detailed policies are defined in `/.cursor/rules/*.mdc`.
- Governance and maintenance guidance: `/docs/cursor-rules-playbook.md`.

## Validation baseline

Run when relevant:

```bash
npm run build
npm run lint
npm test -- --runInBand
npm run test:e2e -- --runInBand
```

