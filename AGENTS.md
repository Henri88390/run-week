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
- The running-program planner saves its profile and week history in browser
  localStorage. It has no server-side storage, account system, or backend.
  Generated weeks use disclosed heuristics, not personalized training advice.
- Do not add a backend, authentication, database, or server-side persistence
  without an explicit requirement.
- Use `npm run lint`, `npm run typecheck`, and `npm run build` for applicable
  checks. There is currently no test script or configured test framework.
