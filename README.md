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
- `packages/backend/convex/auth.ts` trusts `process.env.SITE_URL`.
- The Convex deployment env must therefore contain `SITE_URL=http://localhost:3001`.

Local files such as `packages/backend/.env.local` document the values, but Convex
functions read runtime environment variables from the Convex deployment. After
creating or switching a dev deployment, set the auth env on that deployment:

```bash
cd packages/backend
bunx convex env set SITE_URL http://localhost:3001
bunx convex env set BETTER_AUTH_SECRET "$(openssl rand -base64 32)"
```

Keep `apps/web/.env` pointed at the same Convex deployment:

```bash
VITE_CONVEX_URL=https://<deployment>.convex.cloud
VITE_CONVEX_SITE_URL=https://<deployment>.convex.site
```

If login fails after setup, first verify that the browser origin is
`http://localhost:3001`, `VITE_CONVEX_SITE_URL` points to the active deployment's
`.convex.site` URL, and the Convex deployment env contains `SITE_URL` with the
same local origin.

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
