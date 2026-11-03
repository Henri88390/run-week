<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Run Week project

- This is a frontend-first web app using Next.js 16 App Router, React 19,
  TypeScript, Tailwind CSS 4, and ESLint. It is not a React Native app.
- Keep route composition in `src/app` and feature UI and logic in
  `src/features/<feature>`. Use the `@/*` alias for imports from `src`.
- Prefer Server Components; add Client Components only for interactivity or
  browser APIs. Follow the installed Next.js documentation under
  `node_modules/next/dist/docs/` before changing framework APIs.
- Optional user accounts use Auth.js v5 (`src/features/account`,
  `src/app/api/auth`) with email codes (Resend) and Google sign-in, stored in
  PostgreSQL through Prisma 7 (`prisma/schema.prisma`, client generated to
  `src/generated/prisma`). Signed out, the planner is saved in browser
  localStorage; signed in, it is saved in the account (`src/app/api/planner`).
  Everything except Garmin works signed out.
- The Garmin Connect integration (`src/app/api/garmin`, `src/features/garmin`)
  requires an account. Encrypted OAuth tokens and sent-workout records are
  stored with the account in the database.
  Generated weeks use disclosed heuristics, not personalized training advice.
- Do not add other server code, server-side persistence or data stored with the
  account without an explicit requirement. Schema changes need a Prisma
  migration (`npm run db:migrate`).
- Use `npm run lint`, `npm run typecheck`, and `npm run build` for applicable
  checks. `node scripts/verify-garmin.mjs` and
  `node scripts/verify-garmin-rate-limit.mjs` check the Garmin routes with
  mocks. There is no configured test framework.

## Next.js and React

- Use the installed framework's stable APIs and documentation, not patterns
  from older Next.js releases. Do not upgrade dependencies or introduce
  experimental features unless required by the task.
- Keep Server Components as the default. Place `"use client"` at the smallest
  interactive boundary; keep secrets, Node.js modules, and server-only
  dependencies outside its transitive imports. Mark sensitive server modules
  with `import "server-only"`.
- Pass only React-serializable values across server/client boundaries. Share
  pure types and domain logic through environment-independent modules.
- Await asynchronous request APIs, including `cookies()`, `headers()`,
  route `params`, and page `searchParams`, following their installed types.
- This project enables Cache Components. Use `use cache` and `cacheLife` only
  for deliberately reusable data; put request-time UI behind meaningful
  `Suspense` boundaries. Do not introduce incompatible `dynamic`, `revalidate`,
  or `fetchCache` route exports or disable validation to hide rendering errors.
- Never put OAuth credentials, session state, or user-specific Garmin responses
  in shared caches. Set appropriate no-store response headers for sensitive
  endpoints; client fetch options alone do not control intermediary caching.
- Fetch server data directly from server modules, not through the app's own
  HTTP endpoints. Parallelize independent I/O and avoid request waterfalls.
- Keep Route Handlers thin: validate input, enforce authorization, call feature
  logic, and return explicit HTTP statuses. Treat Server Actions, if explicitly
  required, as public endpoints with the same checks.
- Use effects only to synchronize with external systems, not to compute
  derived state or handle user actions. Clean up timers, listeners, and pending
  requests; prevent stale asynchronous results from overwriting newer state.
- Keep initial server and client renders consistent. Access localStorage and
  other browser APIs after hydration or in event handlers, not during server
  rendering. Do not hide hydration defects with suppression flags.
- Use semantic HTML, accessible names, keyboard interaction, and visible focus
  states. Use Next.js navigation and image primitives where appropriate.
  Add memoization or lazy loading only for a demonstrated performance need.

## TypeScript and Node.js

- Preserve strict type checking. Model valid states with explicit types and
  discriminated unions; use `import type` for type-only dependencies.
- Treat request bodies, external API responses, environment variables, and
  stored JSON as untrusted. Parse them as `unknown` and validate with existing
  Zod schemas or type guards before use; TypeScript assertions are not validation.
- Do not introduce `any`, double assertions, unchecked non-null assertions,
  `@ts-ignore`, or lint/type-check bypasses to silence defects. Narrow values
  and handle missing cases explicitly.
- Prefer existing feature helpers and platform APIs over new dependencies.
  Use `node:` imports for Node.js built-ins and asynchronous I/O in request
  paths; do not rely on Edge support for Node-specific libraries.
- Validate required server configuration before use. Keep credentials out of
  `NEXT_PUBLIC_*`, client props, URLs, logs, and error responses.
- Use bounded timeouts for outbound requests, check HTTP status, and validate
  response shape. Retry only when safe; never automatically repeat a workout
  upload or other mutation without an idempotency strategy.
- Preserve OAuth state/PKCE, explicit consent, encrypted HttpOnly cookies, and
  same-origin mutation checks. Use cryptographic randomness and established
  crypto APIs; never invent credential storage or encryption schemes.
- Catch errors at meaningful boundaries. Return localized, actionable user
  feedback and sanitized server diagnostics; do not swallow errors or return
  success-shaped fallback data.

## Change verification

- Keep changes scoped, preserve existing behavior, and update directly related
  documentation. Add visible UI strings to every supported locale.
- Run the smallest relevant lint/type checks and behavioral checks. Run the
  production build for framework, rendering, routing, or server-boundary changes.
  Never disable checks to make a change pass.
- Verify changed UI in the browser, including mobile layout and keyboard use;
  verify failure paths for network and storage changes. Use mocks for Garmin
  checks rather than real authorization or uploads without explicit approval.
- Do not add a test framework solely for a small change. Report checks actually
  run and any unverified behavior; documentation-only edits need no build.
