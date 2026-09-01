# Hosted Deployment Setup

Production uses Vercel's stable project URL while the custom domain is being
configured:

```txt
https://flutte-web.vercel.app
```

The intended custom domain is `https://blabla.seryozha.world`.

## Vercel

Create the Vercel project from the repository root. Do not set `apps/web` as the
Root Directory: the build also needs `packages/backend`.

Use the root `vercel.json`:

- install: `bun install --frozen-lockfile`
- build: the `buildCommand` in `vercel.json`
- output: `apps/web/dist`

The build deploys Convex, injects its deployment-specific URL into Vite, and
then publishes the SPA. Set one secret in each Vercel environment:

```txt
Production: CONVEX_DEPLOY_KEY=<production deploy key>
Preview:    CONVEX_DEPLOY_KEY=<project preview deploy key>
```

Do not set static `VITE_CONVEX_URL` or `VITE_CONVEX_SITE_URL` values in Vercel.
The build selects the matching production or branch-scoped preview deployment.

Add the custom domain:

```txt
blabla.seryozha.world
```

## Gandi DNS

Create this DNS record:

```txt
Type: CNAME
Name: blabla
Value: d84a471e3b5855b6.vercel-dns-017.com.
```

Wait until Vercel verifies the domain and provisions HTTPS.

## Convex Runtime Environment

Better Auth runs inside Convex, so its variables belong on Convex deployments,
not in Vercel. Production needs:

```bash
cd packages/backend
bunx convex env set --prod SITE_URL https://flutte-web.vercel.app
bunx convex env set --prod BETTER_AUTH_URL https://polite-fish-670.convex.site
bunx convex env set --prod TRUSTED_ORIGINS \
  "https://flutte-web.vercel.app,https://blabla.seryozha.world"
bunx convex env set --prod BETTER_AUTH_SECRET
```

Use a strong environment-specific secret. When promoting an existing auth
database, retaining its secret avoids invalidating existing sessions.

New preview deployments inherit project defaults. Configure these once:

```txt
BETTER_AUTH_SECRET=<a preview-only secret>
SITE_URL=https://flutte-web.vercel.app
TRUSTED_ORIGINS=https://flutte-web.vercel.app,https://*.vercel.app
```

`BETTER_AUTH_URL` is optional. If absent, the backend uses Convex's own
deployment-specific `CONVEX_SITE_URL`, which is correct for previews. The
current email/password flow accepts Vercel preview origins; if redirect-based
auth is added later, previews need a deliberate callback URL strategy.

Verify:

```bash
bunx convex env list --prod --names-only
curl -sS https://polite-fish-670.convex.site/api/auth/ok
curl -sS -D - \
  -H "Origin: https://flutte-web.vercel.app" \
  https://polite-fish-670.convex.site/api/auth/get-session
```

The `get-session` response should include an `access-control-allow-origin`
header matching the request origin.

## Promote Dev Data to Production

Use one snapshot export and one atomic import. This retains document IDs and
references and avoids reading the catalog through application queries:

```bash
cd packages/backend
bunx convex export --include-file-storage --path /tmp/blabla-dev.zip
bunx convex export --prod --include-file-storage --path /tmp/blabla-prod-before.zip
bunx convex import --prod --replace-all --yes /tmp/blabla-dev.zip
```

Inspect production before `--replace-all` and retain the production export as a
rollback artifact. Convex environment variables and deployed functions are not
part of a snapshot and must be configured separately.

## Colleague Flow

1. Sign in as the owner.
2. Open a project.
3. Go to Settings -> Members.
4. Invite your colleague by email and choose a role.
5. Ask them to open `https://blabla.seryozha.world`.
6. They sign up with the same email.
7. The app activates pending invites after sign-in and the project appears in
   their Projects view.
