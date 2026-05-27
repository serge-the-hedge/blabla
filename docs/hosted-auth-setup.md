# Hosted Auth Setup

This repo now assumes the shareable preview lives at:

```txt
https://blabla.seryozha.world
```

The code changes are in the repo. The steps below must be done in Vercel, Gandi,
and Convex.

## Vercel

Create a Vercel project from the repo root.

Use the root `vercel.json`:

- install: `bun install --frozen-lockfile`
- build: `bun run build`
- output: `apps/web/dist`

Set these Vercel environment variables:

```bash
VITE_CONVEX_URL=https://pleasant-cow-99.convex.cloud
VITE_CONVEX_SITE_URL=https://pleasant-cow-99.convex.site
```

Add the custom domain:

```txt
blabla.seryozha.world
```

## Gandi DNS

Create this DNS record:

```txt
Type: CNAME
Name: blabla
Value: cname.vercel-dns.com
```

Wait until Vercel verifies the domain and provisions HTTPS.

## Convex Runtime Env

Run this from the backend package:

```bash
cd packages/backend
bunx convex env set SITE_URL https://blabla.seryozha.world
bunx convex env set BETTER_AUTH_URL https://pleasant-cow-99.convex.site
bunx convex env set TRUSTED_ORIGINS "https://blabla.seryozha.world,http://localhost:3001"
```

Do not rotate `BETTER_AUTH_SECRET` unless you want to invalidate existing
sessions.

Verify:

```bash
bunx convex env list
curl -sS https://pleasant-cow-99.convex.site/api/auth/ok
curl -sS -D - \
  -H "Origin: https://blabla.seryozha.world" \
  https://pleasant-cow-99.convex.site/api/auth/get-session
curl -sS -D - \
  -H "Origin: http://localhost:3001" \
  https://pleasant-cow-99.convex.site/api/auth/get-session
```

Both `get-session` checks should include an
`access-control-allow-origin` header matching the request origin.

## Colleague Flow

1. Sign in as the owner.
2. Open a project.
3. Go to Settings -> Members.
4. Invite your colleague by email and choose a role.
5. Ask them to open `https://blabla.seryozha.world`.
6. They sign up with the same email.
7. The app activates pending invites after sign-in and the project appears in
   their Projects view.
