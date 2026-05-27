# Agent Translation Guide

This app exposes a compact HTTP API for LLM agents working on translations.
Agents use project-scoped API tokens and can read/search/export strings or
propose edits as reviewable change sets. Agents cannot directly apply changes.

Use this document as the canonical workflow guide for translation agents.

Base path:

```text
/api/agent/v1
```

Authentication:

```text
Authorization: Bearer <project_api_token>
```

## Human Setup

1. Open the project in the web app.
2. Go to **Settings -> API tokens**.
3. Create a project-scoped token with the minimum scopes:
   - Translation agents: `read`, `search`, `propose`.
   - Release export automation: add `export`.
4. Copy the raw token immediately. The app stores only a hash and cannot show
   the raw value again.
5. Give agents the site base URL and token:

```text
https://<convex-site>.convex.site/api/agent/v1
Authorization: Bearer <project_api_token>
```

If token creation is blocked in development, fix the UI/auth route first and
then create the token through the app. Do not seed raw tokens directly in the
database: the API authenticates against the stored token hash and tokens are
intentionally one-time visible.

## Agent Workflow

1. Discover the project with `GET /projects/current`.
2. Search for strings with `GET /strings/search`, using `locale`, `screen`,
   `tag`, `status`, and `q` to keep the working set small.
3. Fetch exact context for the keys you plan to edit with `POST /context`.
   Include `includeHistory: true` for copy that may have review history.
4. When reviewing source copy, separate real language issues from app-context
   artifacts. Note any intentionally preserved casing, spacing, or punctuation
   in your report so later agents do not propose the same cosmetic changes.
5. Propose translation edits with `POST /change-sets`. Always send the
   `baseVersion` from search or context so reviewers can see conflicts if the
   live value changed.
6. Check review state with `GET /change-sets/:id` when you need to report back.
7. Export release files with `POST /export` only when the token has the
   `export` scope.

Do not invent locale codes, screens, tags, or keys. Read them from
`/projects/current` or `/strings/search`. If a target locale is missing, ask a
human to create it in the web app before proposing translations.

## Translation Rules

- Preserve ICU syntax, placeholder names, interpolation markers, whitespace that
  is semantically meaningful, and product terminology.
- Preserve casing, extra spaces around symbols, compact symbols, and similar
  punctuation when they may come from UI composition or app context. Do not
  normalize these as style edits unless the human explicitly asks for UI-copy
  formatting cleanup.
- Treat the source locale as the source of truth. Only edit source strings when
  the human explicitly asks for source-copy changes.
- Use `status=missing`, `status=stale`, or `status=needs_review` to prioritize
  work. Avoid touching already translated strings unless the task asks for
  polish or consistency.
- Keep proposals reviewable. Prefer focused change sets by locale, screen, tag,
  or feature area instead of one large mixed batch.
- Use `POST /strings/tags` for organization work. It creates a reviewable
  metadata change set and does not mutate live string tags directly.
- Never claim changes are live after creating a change set. Humans must approve
  and apply the review in the web app.

## Scopes

- `read`: project metadata, context, and change-set status.
- `search`: string search.
- `propose`: translation and tag change-set creation.
- `export`: JSON or ARB export.

Create tokens in the web app under project settings. Pick the minimum scopes the
integration needs.

## Endpoints

### `GET /projects/current`

Returns compact project metadata: project id, name, source locale, locales,
screens, and tags.

### `GET /strings/search`

Query params:

- `q`
- `locale`
- `screen`
- `tag`
- `status`
- `limit`

Returns compact rows with key, source value, target value, locale, status, and
version.

Each row includes the string's own `screen` slug and full `tags` list. When no
target value exists for the requested locale, `target` is empty, `status` is
`missing`, and `version` is `0`.

### `POST /context`

Body:

```json
{
  "keys": ["checkout.payButton"],
  "locales": ["hy"],
  "includeHistory": true
}
```

Returns requested fields and optional recent history.

### `POST /change-sets`

Body:

```json
{
  "title": "Improve checkout Armenian copy",
  "description": "Agent-proposed copy edits",
  "items": [
    {
      "key": "checkout.payButton",
      "locale": "hy",
      "baseVersion": 4,
      "nextValue": "Վճարել հիմա"
    }
  ]
}
```

Creates an open review. Humans approve and apply changes in the web app.

`baseVersion` is optional for backwards compatibility, but agents should include
it whenever possible. If the live value version differs from `baseVersion`, the
item is created as conflicted instead of pending.

The request fails if the title is blank, no items are provided, or any key or
locale is unknown or archived. Items whose `nextValue` already matches the live
value are omitted as no-ops; if every item is a no-op, the request fails instead
of creating an empty review.

Response:

```json
{
  "changeSetId": "k...",
  "status": "open",
  "itemsProposed": 1,
  "itemsConflicted": 0,
  "itemsRejected": 0,
  "itemsAccepted": 1,
  "reviewUrl": "/projects/j.../reviews/k..."
}
```

`itemsAccepted` is kept for older integrations. Prefer `itemsProposed`,
`itemsConflicted`, and `itemsRejected` for new clients.

### `POST /strings/tags`

Creates an open review that adds one or more tags to a selected batch of
strings. Tags may already exist or be new. The agent does not mutate live string
metadata directly.

Body:

```json
{
  "title": "Tag checkout strings",
  "description": "Group checkout strings for review",
  "selection": {
    "type": "keys",
    "keys": ["checkout.payButton", "checkout.cancelButton"]
  },
  "tagSlugs": ["checkout", "button"]
}
```

Selections: `all`, `keys`, `tag`, `screen`.

The request fails if the selection matches no active strings or if every
selected string already has the requested tags.

### `GET /change-sets/:id`

Returns compact review state and item statuses.

### `POST /export`

Body:

```json
{
  "format": "arb",
  "locale": "hy",
  "selection": {
    "type": "tag",
    "tag": "checkout"
  }
}
```

Formats: `json`, `arb`.

Selections: `all`, `keys`, `tag`, `screen`.
