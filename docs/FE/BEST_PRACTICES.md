# EntelequIA Chatbot Widget FE -- Best Practices Guide

> **Audience**: AI assistants (Cursor, Copilot) and human developers working on this codebase.
> **Last updated**: 2026-02-10
> **Stack**: React 19 + TypeScript 5.9 + Tailwind CSS v4 + Zustand + Vite 7

---

## Table of Contents

1. [Architecture Principles](#1-architecture-principles)
2. [React Best Practices](#2-react-best-practices)
3. [TypeScript Best Practices](#3-typescript-best-practices)
4. [Tailwind + shadcn/ui Best Practices](#4-tailwind--shadcnui-best-practices)
5. [State Management (Zustand)](#5-state-management-zustand)
6. [API & Service Layer](#6-api--service-layer)
7. [Security & Privacy](#7-security--privacy)
8. [Testing](#8-testing)
9. [Accessibility (a11y)](#9-accessibility-a11y)
10. [Performance](#10-performance)
11. [Embedding & Host Integration](#11-embedding--host-integration)
12. [CI/CD & Quality Gates](#12-cicd--quality-gates)
13. [Clean Code (Robert C. Martin)](#13-clean-code-robert-c-martin)
14. [DRY Without Over-Abstraction](#14-dry-without-over-abstraction)
15. [Cross-Repo Contract Alignment](#15-cross-repo-contract-alignment)
16. [Git & Commit Conventions](#16-git--commit-conventions)

---

## 1. Architecture Principles

### Folder Structure

```
src/
  components/          # UI components (presentational + containers)
    __tests__/         # Component tests
    ui/                # shadcn/ui primitives (Button, Card, Input, etc.)
  hooks/               # Custom React hooks
    __tests__/         # Hook tests
  services/            # API clients, config, types, host bridge
    __tests__/         # Service tests
    auth/              # Token management
    chat/              # Chat-specific service functions
    schemas/           # Zod runtime validation schemas
  lib/                 # Shared utilities and constants
    utils/
    constants/
  utils/               # Domain-agnostic utilities (logger, sanitize)
    __tests__/
  types/               # Shared TypeScript type re-exports
  docs/                # Documentation
```

### Rules

- **One responsibility per file.** A hook file should contain one hook. A component file should contain one component.
- **Co-locate tests** with their source: `__tests__/` directory adjacent to the module.
- **No god utils.** `lib/utils/` is for Tailwind's `cn()` only. Domain utils go in `utils/`.
- **Services are the only layer that talks to the network.** Components and hooks never call `fetch` directly.
- **Types live close to their consumers.** Service types in `services/types.ts`. Component prop types inline in the component file.

---

## 2. React Best Practices

### Component Design

```tsx
// GOOD: Small, focused component with clear props
interface MessageBubbleProps {
  content: string;
  variant: 'user' | 'bot' | 'error';
}

function MessageBubble({ content, variant }: MessageBubbleProps) {
  return (
    <div className={cn('rounded-lg px-4 py-3', variantStyles[variant])}>
      {content}
    </div>
  );
}
```

- **Prefer function components** over class components (except ErrorBoundary).
- **Composition over inheritance.** Use children, render props, or hook extraction.
- **Keep components under 100 lines.** Extract sub-components or hooks when exceeding.
- **Use `data-slot` attributes** on shadcn/ui primitives for CSS targeting and testing.

### Hooks

- **Custom hooks must start with `use`** and be in `hooks/`.
- **Declare all dependencies** in `useEffect` / `useCallback` / `useMemo` dependency arrays. Never suppress the linter.
- **Side effects in `useEffect` only.** Never in render body or event handlers that modify external state synchronously.
- **Return stable references.** Use `useCallback` for functions passed to child components.
- **useRef for mutable values** that shouldn't trigger re-renders (e.g., rate-limit timestamps).

### State Updates

- **Never mutate state directly.** Always use the setter function or Zustand's `set()`.
- **Batch related state updates** in a single `set()` call in Zustand.
- **Use functional updates** when the new state depends on the previous state:

```tsx
// GOOD
set((state) => ({ messages: [...state.messages, newMessage] }));

// BAD - might use stale state
set({ messages: [...messages, newMessage] });
```

---

## 3. TypeScript Best Practices

### Strictness

- **`strict: true` is non-negotiable.** It is already enabled in `tsconfig.json`.
- **Never use `any`.** Use `unknown` and narrow with type guards.
- **Never use `as unknown as T`** in production code (test files are acceptable).
- **Prefer `readonly` properties** on DTOs and payloads to prevent accidental mutation:

```tsx
interface ChatRequestPayload {
  readonly source: ChannelSource;
  readonly userId: string;
  readonly text: string;
}
```

### Type Guards

```tsx
// GOOD: Discriminated union with type guard
function isSuccessResponse(r: BotResponse): r is BotResponse & { ok: true } {
  return r.ok === true;
}
```

### Runtime Validation

- **All external inputs must be validated at runtime**, not just type-asserted.
- **Use zod schemas** for BE responses. Schemas live in `services/schemas/`.
- **Graceful degradation:** If validation fails, log a warning and fall back to raw data (don't crash).

```tsx
const parsed = webhookResponseSchema.safeParse(raw);
if (!parsed.success) {
  logger.warn('Schema mismatch', { error: parsed.error.message });
  return raw; // graceful fallback
}
return parsed.data;
```

### Error Handling

- **Use typed error classes** (`APIError`) rather than generic `Error`.
- **Handle errors at the hook level**, not in components. Components receive error states, not raw errors.
- **Always include context** in error logs (requestId, userId, conversationId).

---

## 4. Tailwind + shadcn/ui Best Practices

### Configuration

- **Single source of truth: `index.css`**. Tailwind v4 uses CSS-based config (`@theme inline`).
- **Do NOT create a `tailwind.config.js`** -- it was the v3 approach and causes config drift.
- **Brand colors** are defined as CSS variables (`--brand-50` through `--brand-900`) and mapped to Tailwind via `--color-brand-*`.

### Class Composition

```tsx
// GOOD: Use cn() for conditional/merging classes
import { cn } from '@/lib/utils/utils';

<div className={cn('rounded-lg px-4', isUser && 'bg-chat-user', !isUser && 'bg-chat-bot')} />

// BAD: String concatenation with template literals for complex conditions
<div className={`rounded-lg px-4 ${isUser ? 'bg-chat-user' : 'bg-chat-bot'}`} />
```

- **Use `cn()` (clsx + tailwind-merge)** for all conditional classes.
- **Avoid className soup**: If a component has more than 5-6 utility classes, extract them into a `const` or use `cva()` variants.

### shadcn/ui Components

- **Always use `data-slot` attributes** on primitives for identification.
- **Use `forwardRef`** on all primitive components (Button, Card, Input) so parents can attach refs.
- **Extend with `cva` variants**, not by adding one-off classes:

```tsx
// GOOD: Brand variant in button.tsx
const buttonVariants = cva('...base...', {
  variants: {
    variant: {
      brand: 'bg-brand-500 text-white hover:bg-brand-600',
    },
  },
});

// BAD: Inline override
<Button className="bg-brand-500 text-white hover:bg-brand-600" />;
```

### Dark Mode

- Dark mode variables are defined in `.dark` selector in `index.css`.
- When adding new colors, always define both light and dark variants.

---

## 5. State Management (Zustand)

### Store Structure

- **One store per domain.** Currently `useChatStore` handles all chat state.
- **Persist selectively** using `partialize`. Persist `userId`, `conversationId`, and `messages`. Do NOT persist `isLoading` or `error`.
- **Prune persisted data** with TTL. Messages older than 24h are discarded on hydration.

### Selectors

```tsx
// GOOD: Select only what you need (prevents unnecessary re-renders)
const isLoading = useChatStore((state) => state.isLoading);

// BAD: Destructure the whole store
const { isLoading, messages, isOpen, ... } = useChatStore();
```

### ID Generation

- **Always use `generateMessageId()`** from `useChatStore` for message IDs.
- **Never use `Date.now().toString()`** -- collision risk on rapid interactions.
- Under the hood, `generateMessageId()` uses `crypto.randomUUID()` with fallback.

---

## 6. API & Service Layer

### Service Architecture

```
services/
  config.ts        # Runtime config (env vars + host bridge)
  http.ts          # HTTP clients (httpClient, webhookClient)
  types.ts         # TypeScript interfaces (contracts)
  schemas/         # Zod runtime validation
  chat/            # Chat domain services
  auth/            # Token management
  hostBridge.ts    # Host bridge resolution
  hostContext.ts   # User context resolution
```

### Rules

- **`webhookClient` is the primary HTTP function** for chat messages. It sends to the Chatbot BE, handles timeouts, and CORS detection.
- **Always pass `requestId`** for correlation:

```tsx
const response = await sendMessage(payload, { requestId });
```

- **Never call `fetch` directly** outside of `http.ts`.
- **Validate all BE responses** with zod schemas before consuming.
- **Handle all error branches**: CORS, timeout, requiresAuth, generic failure.

### Correlation IDs

- Generate `requestId` at the hook level (`useChat`).
- Pass it through `sendMessage` -> `webhookClient` -> `x-request-id` HTTP header.
- Log it on both success and error paths.
- The BE's `request-id.middleware.ts` reads this header for end-to-end tracing.

### Authorization

- Access tokens are sent in both the `Authorization: Bearer` header AND the request body.
- Body inclusion is for backward compatibility with the current BE `ExtractVariablesGuard`.
- TODO: Once BE migrates to header-based auth, remove token from body.

---

## 7. Security & Privacy

### Input Sanitization

1. **User input**: Validated with `isValidInput()` and sanitized with `sanitizeInput()` before sending to BE.
2. **Bot HTML responses**: Sanitized with `sanitizeHtml()` (DOMPurify) before rendering via `dangerouslySetInnerHTML`.
3. **User messages in UI**: React's JSX escaping handles this automatically. Do NOT call `escapeHtml()` on text rendered as JSX children -- it causes double-encoding.

### XSS Prevention

- DOMPurify whitelist: `b, i, em, strong, a, br, p, ul, ol, li` tags only.
- Forbidden tags: `script, style, iframe, form, input`.
- Forbidden attributes: `onerror, onload, onclick, onmouseover`.
- No `data:` attributes allowed.

### postMessage Security

- **NEVER use `'*'` as targetOrigin** when sending postMessage to parent.
- Always resolve the host origin from `apiConfig.entelequiaWebUrl` or `document.referrer`.
- If origin cannot be determined, DO NOT send the message.

### Token Handling

- Access tokens are never logged in full. Log `hasToken: !!token` instead.
- Tokens are stored in localStorage by the host app (not the widget).
- The widget reads tokens via the host bridge or legacy localStorage keys.

### Content Security Policy

- CSP is defined in `index.html` as a meta tag.
- `connect-src` allows `'self'`, `https:`, and `localhost` for dev.
- Review CSP before production deployment.

### Privacy (GDPR-like)

- User IDs and conversation IDs are persisted in localStorage.
- Messages are persisted with a 24-hour TTL and auto-pruned.
- The BE schema includes GDPR purge queries (90-day retention).
- Never log message content. Log metadata only (conversationId, hasToken, intent).

---

## 8. Testing

### Test Structure

```
src/
  components/__tests__/    # Component tests (React Testing Library)
  hooks/__tests__/         # Hook tests (direct Zustand store testing)
  services/__tests__/      # Service tests (unit + schema validation)
  utils/__tests__/         # Utility tests
```

### Rules

- **Every new module must have tests.** Target 60%+ coverage.
- **Test behavior, not implementation.** Don't test internal state; test observable outputs.
- **Use `vitest` + `@testing-library/react`** for component tests.
- **Use `vitest` directly** for pure function tests (sanitize, schemas, etc.).
- **Mock at the boundary**, not at every function call. Mock `fetch`, not internal services.

### Naming

```tsx
describe('ModuleName', () => {
  describe('functionName', () => {
    it('does X when Y', () => { ... });
    it('rejects Z input', () => { ... });
  });
});
```

### Running Tests

```bash
npm run test          # Watch mode
npm run test -- --run # CI mode (single run)
npm run test:coverage # With coverage report
```

---

## 9. Accessibility (a11y)

### WCAG 2.1 AA Requirements

- **Chat panel**: `role="dialog"` + `aria-modal="true"` + `aria-label`.
- **Message list**: `role="log"` + `aria-live="polite"` so screen readers announce new messages.
- **Close button**: `aria-label="Cerrar chat"`.
- **Open button**: `aria-label="Abrir chat de soporte"`.
- **Send button**: `aria-label="Enviar mensaje"`.
- **Focus trap**: Tab cycles within the dialog when open. Escape closes.
- **Focus management**: Focus moves to close button when dialog opens.

### Keyboard Navigation

- `Tab`: Move focus between interactive elements within the chat panel.
- `Shift+Tab`: Move focus backward.
- `Escape`: Close the chat panel.
- `Enter`: Submit the message form.

### Reduced Motion

- Respect `prefers-reduced-motion` for animations (typing indicator, transitions).
- Tailwind's `motion-reduce:` variant should be used where applicable.

---

## 10. Performance

### Bundle Optimization

- **Manual chunks**: `vendor` (react, react-dom) and `state` (zustand) are separate chunks.
- **Tree shaking**: Import specific icons from `lucide-react`, not the entire library.
- **Lazy loading**: For future features (file attachments, rich media), use `React.lazy()`.

### Message List Performance

- For conversations with 50+ messages, consider adding `@tanstack/react-virtual` for windowed rendering.
- Currently, all messages render in the DOM. Monitor performance for long sessions.

### Re-render Discipline

- Use Zustand selectors to subscribe to specific state slices.
- Memoize expensive computations with `useMemo`.
- Avoid creating new objects/arrays in render that would break shallow comparison.

---

## 11. Embedding & Host Integration

### Iframe Architecture

The widget runs inside an iframe embedded by the host Entelequia FE. This provides:

- **CSS isolation**: Tailwind v4 classes don't leak into Bootstrap host.
- **JS isolation**: React 19 (widget) doesn't conflict with React 18 (host).
- **Security boundary**: Same-origin or cross-origin iframe with controlled communication.

### Host Bridge Pattern

```
Host FE                          Widget FE (iframe)
┌─────────────────────┐          ┌─────────────────────┐
│ installChatbotHost  │          │ resolveHostBridge()  │
│ Bridge()            │◄────────►│                      │
│                     │  window. │ setHostContextProv.. │
│ getUserContext()    │  Entele..│ getHostUserContext()  │
│ getWf1Config()     │  ChatBot │ apiConfig resolution  │
│ onAuthRequired()   │  Host    │ notifyAuthRequired()  │
└─────────────────────┘          └─────────────────────┘
```

- The host installs `window.EntelequiaChatbotHost` before the iframe loads.
- The widget reads it from `window` (self) or `window.parent` (cross-origin fallback).
- The host can override `webhookUrl` via `getWf1Config()`.
- Host overrides take precedence over env vars.

### postMessage Events

- `entelequia:chat-widget-state` -- widget -> host: `{ isOpen: boolean }`.
- Host uses this to resize the iframe wrapper.
- Always validate event source and origin on both sides.

---

## 12. CI/CD & Quality Gates

### Pipeline (`.github/workflows/ci-widget.yml`)

1. **Type check** (`tsc --noEmit`) -- catches type errors.
2. **Lint** (`eslint --max-warnings 0`) -- enforces code quality.
3. **Format check** (`prettier --check .`) -- enforces consistent formatting.
4. **Unit tests** (`vitest --run --coverage`) -- validates behavior.
5. **Build** (`vite build`) -- ensures the bundle compiles.
6. **Bundle size report** -- tracks bundle growth.
7. **Dependency audit** -- flags known vulnerabilities.

### Rules

- **PRs must pass all quality gates** before merge.
- **No `--max-warnings 10`.** Use `--max-warnings 0` in CI. Fix warnings, don't accumulate them.
- **Pin Node.js to v20** in CI. Use `.nvmrc` for local development consistency.
- **Use `npm ci`** (not `npm install`) in CI for deterministic builds.
- **Cache `npm`** via `actions/setup-node`'s `cache` option.

---

## 13. Clean Code (Robert C. Martin)

### Naming

- **Functions describe actions**: `sendMessage`, `resolveHostBridge`, `buildWebhookHeaders`.
- **Booleans read as questions**: `isLoading`, `isOpen`, `hasToken`.
- **Constants are UPPER_CASE**: `CHAT_WIDGET_STATE_EVENT`, `MAX_PERSISTED_MESSAGES`.
- **Components are PascalCase**: `ChatWindow`, `MessageInput`.
- **Hooks start with `use`**: `useChat`, `useChatStore`.

### Functions

- **Do one thing.** A function should have one reason to change.
- **Max 3 parameters.** Use an options object for more:

```tsx
// GOOD
function sendMessage(payload: SendMessagePayload, options?: SendOptions);

// BAD
function sendMessage(
  text,
  userId,
  conversationId,
  accessToken,
  currency,
  locale
);
```

- **No side effects in getters.** `getHostUserContext()` should never mutate state.
- **Return early for guard clauses.** Don't nest deeply:

```tsx
// GOOD
if (!input) return null;
if (input.length > MAX) return null;
return sanitize(input);

// BAD
if (input) {
  if (input.length <= MAX) {
    return sanitize(input);
  }
}
return null;
```

### Comments

- **Code should be self-documenting.** Use comments to explain "why", not "what".
- **JSDoc for public APIs** (exported functions, hooks, components).
- **TODO comments** must include a Jira/GitHub issue reference: `// TODO(#123): migrate to header auth`.

---

## 14. DRY Without Over-Abstraction

### When to Extract

- **Extract when you see 3+ copies** of the same pattern.
- **Extract into the closest scope.** Don't put a chat-specific helper into `lib/utils/`.
- **Name the abstraction after what it does**, not where it came from.

### When NOT to Extract

- **Don't create "god utils"** with 30 unrelated functions.
- **Don't abstract for hypothetical future use.** Wait for the third use case.
- **Don't wrap standard APIs** unless adding real value (error handling, logging, types).

### Current Extractions

| Pattern               | Location                 | Notes                                           |
| --------------------- | ------------------------ | ----------------------------------------------- |
| `cn()` class merger   | `lib/utils/utils.ts`     | Wraps clsx + tailwind-merge                     |
| `generateMessageId()` | `hooks/useChatStore.ts`  | Unique IDs with crypto.randomUUID()             |
| `sanitizeHtml()`      | `utils/sanitize.ts`      | DOMPurify wrapper with strict whitelist         |
| `webhookClient()`     | `services/http.ts`       | Provider routing + CORS + timeout + correlation |
| `resolveHostBridge()` | `services/hostBridge.ts` | Window bridge resolution                        |

---

## 15. Cross-Repo Contract Alignment

### FE <-> BE Contracts

| FE Type              | BE Type            | File                                                  |
| -------------------- | ------------------ | ----------------------------------------------------- |
| `ChatRequestPayload` | `ChatRequestDto`   | `services/types.ts` <-> `wf1/dto/chat-request.dto.ts` |
| `ChatResponse`       | `Wf1Response`      | `services/types.ts` <-> `wf1/domain/wf1-response.ts`  |
| `HostUserContext`    | (host bridge only) | `services/types.ts` <-> `host-context.js`             |

### Rules

- **Types must match field-for-field.** When the BE adds a field, the FE type and zod schema must be updated.
- **Zod schemas are the runtime safety net.** If types drift, `safeParse` catches it and logs a warning.
- **Auth contract**: The widget sends `x-webhook-secret` header. The BE validates it via `SignatureGuard`.
- **Error contract**: The BE returns `{ ok: false, message, requiresAuth? }`. The FE maps this to UI states in `useChat`.

### Versioning

- No formal API versioning exists yet. BE changes must be backward-compatible.

---

## 16. Git & Commit Conventions

### Branch Naming

```
feature/widget-streaming-support
fix/postmessage-security
refactor/remove-dead-types
docs/best-practices-guide
```

### Commit Messages

```
feat(widget): add zod runtime validation for BE responses
fix(security): restrict postMessage targetOrigin to known host
refactor(types): remove unused ProductResponse and OrderResponse
test(sanitize): add comprehensive XSS pattern coverage
docs: add FE best practices guide
ci: add widget FE quality pipeline
```

- Use [Conventional Commits](https://www.conventionalcommits.org/).
- Scope is the affected area: `widget`, `security`, `types`, `ci`, etc.
- Keep the subject under 72 characters.
- Reference issues when applicable: `fix(security): restrict targetOrigin (#42)`.

---

## Quick Reference Card

| Topic        | Rule                                                   |
| ------------ | ------------------------------------------------------ |
| IDs          | `crypto.randomUUID()` via `generateMessageId()`        |
| State        | Zustand with `persist` middleware                      |
| Types        | `strict: true`, no `any`, `readonly` on DTOs           |
| Validation   | Zod schemas for all BE responses                       |
| Sanitization | `sanitizeHtml()` for bot HTML, React JSX for user text |
| postMessage  | Never `'*'`; always verified origin                    |
| Tests        | Vitest + Testing Library; 60%+ coverage target         |
| CI           | Type-check -> Lint -> Format -> Test -> Build          |
| a11y         | `role="dialog"`, `aria-live="polite"`, focus trap      |
| Logging      | Never log message content or full tokens               |
