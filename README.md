# blabla

This project was created with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack), a modern TypeScript stack that combines React, TanStack Router, Convex, and more.

## Features

- **TypeScript** - For type safety and improved developer experience
- **TanStack Router** - File-based routing with full type safety
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **Shared UI package** - shadcn/ui primitives live in `packages/ui`
- **Convex** - Reactive backend-as-a-service platform
- **Authentication** - Better-Auth
- **Biome** - Linting and formatting
- **Turborepo** - Optimized monorepo build system

## Getting Started

First, install the dependencies:

```bash
bun install
```

## Convex Setup

This project uses Convex as a backend. You'll need to set up Convex before running the app:

```bash
bun run dev:setup
```

Follow the prompts to create a new Convex project and connect it to your application.

Copy environment variables from `packages/backend/.env.local` to `apps/*/.env`.

Then, run the development server:

```bash
bun run dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser to see the web application.
Your app will connect to the Convex cloud backend automatically.

## MVP workflow

The product path is intentionally small:

1. Open the project's **Sync** page and add the source and target catalog
   bindings once.
2. Open **Settings → API tokens**, create the workspace connection, and run
   the one-time setup command it gives you.
3. In the Brickit checkout, update the project's integration branch (`develop`
   for the current Brickit repository) with the team's normal fast-forward
   pull, then run `blabla sync` whenever the source commit changes.
4. Use **Strings** for manual edits and **Translation tasks** to prepare a
   locale or hand a bounded translation task to an agent.
5. Review the proposed values in the task before any delivery action.
6. When a Portuguese proposal is ready, run `blabla deliver-portuguese` from
   that same integration-branch checkout. The adapter creates a local review
   branch and prints the exact push and pull-request commands; it never runs
   them for you.

The setup page is the workflow surface. Project ids, Convex URLs, token scopes,
snapshot ids, and proposal ids are implementation details unless you open an
advanced/API view.

An unpublished local checkout needs no CLI installation. The web app shows
repository-local commands in development:

```bash
bun run blabla -- login --server https://<deployment>.convex.site --token ...
git -C /path/to/brickit-flutter fetch origin develop
git -C /path/to/brickit-flutter switch develop
git -C /path/to/brickit-flutter pull --ff-only origin develop
# run the following from this Blabla repository root
bun run blabla -- sync --checkout /path/to/brickit-flutter
bun run blabla -- deliver-portuguese --proposal <proposal-id> --checkout /path/to/brickit-flutter
```

Run them from this repository root. A production build shows the equivalent
installed-binary commands (`blabla login`, `blabla sync`, and
`blabla deliver-portuguese`) instead.

## Development Authentication

This project uses Better Auth through the Convex HTTP site URL. In development,
use the normal email/password sign-up flow instead of adding an anonymous login
button. Anonymous auth is useful for real guest-mode product requirements, but it
adds a Better Auth plugin, schema changes, and account-linking behavior. For this
app, project ownership and audit data should be tied to a real user account even
in local development.

To sign in locally:

1. Start the backend and web app with `bun run dev`.
2. Open [http://localhost:3001](http://localhost:3001).
3. Use the sign-up form once with any valid dev email and an 8+ character
   password, for example `dev@example.test` and `password123`.
4. Use the sign-in form with the same credentials on later runs.

The dev auth origin must match the Vite dev server origin exactly:

- `apps/web/vite.config.ts` runs Vite on `http://localhost:3001`.
- `packages/backend/convex/auth.ts` uses `SITE_URL` as the canonical app URL and
  `TRUSTED_ORIGINS` for extra browser origins.
- Local development must be included in `TRUSTED_ORIGINS` when `SITE_URL` points
  at the hosted preview.

Local files such as `packages/backend/.env.local` document the values, but Convex
functions read runtime environment variables from the Convex deployment. After
creating or switching a dev deployment, set the auth env on that deployment:

```bash
cd packages/backend
bunx convex env set SITE_URL https://blabla.seryozha.world
bunx convex env set TRUSTED_ORIGINS "https://blabla.seryozha.world,http://localhost:3001"
BUILT_CONVEX_SITE_URL="$(grep '^CONVEX_SITE_URL=' .env.local | cut -d= -f2-)"
bunx convex env set BETTER_AUTH_URL "$BUILT_CONVEX_SITE_URL"
bunx convex env set BETTER_AUTH_SECRET "$(openssl rand -base64 32)"
```

Keep `apps/web/.env` pointed at the same Convex deployment:

```bash
VITE_CONVEX_URL=https://<deployment>.convex.cloud
VITE_CONVEX_SITE_URL=https://<deployment>.convex.site
```

If login fails after setup, first verify that the browser origin is
listed in `TRUSTED_ORIGINS`, `VITE_CONVEX_SITE_URL` points to the active
deployment's `.convex.site` URL, and the Convex deployment env contains
`BETTER_AUTH_URL` with the same Convex site URL.

## Hosted Preview

The shareable preview is planned for
[`https://blabla.seryozha.world`](https://blabla.seryozha.world), deployed on
Vercel with DNS managed in Gandi. The repo includes `vercel.json` for the Vite
SPA build.

Vercel environment variables:

```bash
VITE_CONVEX_URL=https://pleasant-cow-99.convex.cloud
VITE_CONVEX_SITE_URL=https://pleasant-cow-99.convex.site
```

See [docs/hosted-auth-setup.md](docs/hosted-auth-setup.md) for the Vercel,
Gandi, and Convex runtime steps.

To share a project with a colleague:

1. Sign in as the project owner.
2. Open Settings -> Members.
3. Invite the colleague by email and assign a role.
4. Ask them to sign up with the same email at the hosted preview.
5. Pending invites are accepted automatically after sign-in.

## UI Customization

React web apps in this stack share shadcn/ui primitives through `packages/ui`.

- Change design tokens and global styles in `packages/ui/src/styles/globals.css`
- Update shared primitives in `packages/ui/src/components/*`
- Adjust shadcn aliases or style config in `packages/ui/components.json` and `apps/web/components.json`

### Add more shared components

Run this from the project root to add more primitives to the shared UI package:

```bash
npx shadcn@latest add accordion dialog popover sheet table -c packages/ui
```

Import shared components like this:

```tsx
import { Button } from "@blabla/ui/components/button";
```

### Add app-specific blocks

If you want to add app-specific blocks instead of shared primitives, run the shadcn CLI from `apps/web`.

## Git Hooks and Formatting

- Format and lint fix: `bun run check`

## Project Structure

```
blabla/
├── apps/
│   ├── web/         # Frontend application (React + TanStack Router)
├── packages/
│   ├── ui/          # Shared shadcn/ui components and styles
│   ├── backend/     # Convex backend functions and schema
```

## Available Scripts

- `bun run dev`: Start all applications in development mode
- `bun run build`: Build all applications
- `bun run dev:web`: Start only the web application
- `bun run dev:setup`: Setup and configure your Convex project
- `bun run check-types`: Check TypeScript types across all apps
- `bun run check`: Run Biome formatting and linting
