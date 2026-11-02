# Run Week

A frontend-first web app displaying sample running programs, built with Next.js
App Router, React, TypeScript, Tailwind CSS, and ESLint.

## Getting started

Use Node.js 24 LTS and npm. From this directory:

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000).
On Windows, use `npm.cmd` if PowerShell blocks `npm.ps1`.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Generate route types and check TypeScript |
| `npm run build` | Create the production build |
| `npm start` | Serve the production build |

## Structure

```text
.github/
  agents/                 Project-specific coding and review agents
src/
  app/                    Routes, root layout, metadata, global styles
  features/
    running-programs/
      components/         Running-program UI
      types.ts            Domain types independent of React
      sample-program.ts   Explicitly labeled demo data
public/                   Static assets
```

The home page renders a responsive sample training week. There is no program
editor, authentication, database, or persistence yet. The sample is illustrative,
not personalized training advice. System fonts keep builds independent of
external font services.

## Architecture

Keep program-specific UI and logic in `src/features/running-programs`. Add shared
UI components when another feature needs them. Keep route composition in
`src/app`, introducing client components when interactivity is needed.

The current page passes typed sample data to the program preview. If data access
is added, keep credentials and other secrets on the server.

## Custom agents

The [`.github/agents`](.github/agents) directory contains project-specific
agents: the **Next.js Developer** implements changes, the **QA Engineer**
verifies acceptance criteria, the **Code Reviewer** reviews them, and the
**Feature Coordinator** orchestrates larger tasks.
