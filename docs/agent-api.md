# Agent Translation Guide

This app exposes a compact HTTP API for LLM agents working on translations.
Agents use project-scoped API tokens to discover the accepted Catalog Workspace,
submit immutable translation candidates, and leave the final value change to a
human review. The older change-set endpoints remain available for compatibility
but are not the current-value write path.

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
   - The legacy `export` scope is reserved and must not be used for release
     output.
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

## Preferred Agent Workflow

1. Discover the project with `GET /projects/current`.
2. Search the accepted Catalog Workspace with `GET /workspace/search`, using
   `q`, `localeCode`, and `limit` to keep the working set small.
   To audit imported baseline state, read the conservative human-confirmation
   plan with `GET /workspace/ordinary-confirmations`; this endpoint never
   confirms values itself.
3. Fetch exact target facts and the concurrency basis with
   `POST /workspace/context`.
4. Create or resume one logical proposal with `POST /translation-proposals`.
5. Submit 1–16 non-empty candidate values at a time to
   `POST /translation-proposals/:id/candidate-revisions`. Include the exact
   `basis` returned by Workspace discovery and use a new `clientRevisionKey`
   for every correction.
6. Open the proposal in the human Proposals workbench. Accepting an exact
   candidate, accepting edited text, rejecting it, or recording an Intentional
   Blank leaves immutable review evidence; only an editor acceptance changes
   the Catalog Workspace.
7. Report a value as **proposed** until the human review succeeds. The API
   never claims that an agent submission is live.

The authenticated production Proposals workbench is available at
`/projects/:projectId/proposals`. The throwaway comparison remains available
at `/proposals/prototype` when we want to evaluate interaction alternatives.

### Legacy compatibility workflow

The following endpoints are retained for historic integrations only. New
agents should use the preferred workflow above:

1. Search with `GET /strings/search`.
2. Fetch legacy context with `POST /context`.
3. Create a legacy review with `POST /change-sets`.
4. Check legacy state with `GET /change-sets/:id`.

That path writes the pre-Catalog-Workspace corpus and must not be used to claim
that a value is current in the Strings editor.

For either workflow, separate real language issues from app-context artifacts.
Note any intentionally preserved casing, spacing, or punctuation in your report
so later agents do not propose the same cosmetic changes. Release files are not
available through the legacy Agent API export; they will come from the Catalog
Workspace Release Bundle workflow.

### Portuguese Locale Proposal

An agent can prepare, but cannot activate or deliver, the first configured new
Locale: Portuguese. The same Locale Proposal seam is intended for future
Locales. This workflow needs only `read` and `propose` scopes. It never creates
an active Locale Binding, writes to Git, opens a pull request, or changes the
working catalog.

1. Start or resume with `POST /locale-proposals/pt`.
2. Read the exact Source Snapshot template with
   `GET /locale-proposals/pt/template?proposalId=...&cursor=...&limit=...`.
   Keep the returned `sourceFingerprint` alongside each translation.
3. For machine-authored candidates, create an Agent Translation Proposal whose
   target is `{ "kind": "localeProposal", "localeProposalId": "..." }`, then
   submit candidate revisions with the source basis returned by the template.
   A candidate changes nothing until a human reviews it in the Proposals
   workbench.
4. For direct preparation, submit at most 16 values at a time to
   `POST /locale-proposals/pt/values`. Direct agent values remain awaiting
   review; an empty value is allowed only with `intentionalBlankReason` and
   still needs a human decision.
5. Inspect submitted values and Intentional Blank provenance through
   `GET /locale-proposals/pt/values?proposalId=...&cursor=...&limit=...`.
6. Review the values in `/projects/:projectId/locale-proposals/pt` or the
   generic Proposals workbench. Only human-applied values can finalize.
7. Call `POST /locale-proposals/pt/finalize`. A rejected finalization records
   its bounded diagnostics on the proposal; read them with
   `GET /locale-proposals/pt?proposalId=...` after correcting the values.
8. Read the immutable delivery artifact from
   `GET /locale-proposals/pt/artifact?proposalId=...`.

The proposal is pinned to the accepted Baseline Snapshot. If Git advances,
staging and finalization return `STALE_SOURCE`; start a fresh proposal for the
new baseline. A ready artifact is review-ready evidence for the later local
Repository Adapter, not proof that Brickit has accepted it.

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

### `GET /workspace/search`

Searches the accepted Catalog Workspace rather than the legacy translation
tables. Query params are `q`, `localeCode`, and `limit` (maximum 50). Each
result includes the message id, source facts, current target value, and the
target `basis` needed by a candidate revision.

### `GET /workspace/ordinary-confirmations`

Returns the `ordinary-v1` batch-confirmation preview for the accepted Baseline.
Use the opaque string `cursor` returned by the previous page and `limit
(maximum 100)` to page through eligible values; omit `cursor` or send an empty
cursor for the first page. A cursor can resume inside a key with multiple target
Locales, so clients must pass it through unchanged. The summary separates
empty, source-identical, repeated, locally modified, stale, already confirmed,
and pending-Source-Proposal values. This is a read-only audit seam: an
authenticated editor must run confirmation from the Strings UI.

The cursor is intentionally an opaque Catalog Order cursor rather than a
Convex document-pagination cursor. A candidate page is produced after
target-level revalidation and may resume inside a key with multiple target
Locales, which a document cursor cannot represent. The internal reads remain
bounded indexed ranges, and clients must not parse or manufacture the cursor.

### `POST /workspace/context`

Body:

```json
{
  "keys": ["checkout.payButton"],
  "locales": ["de"]
}
```

Returns exact source/target values and bounded ICU facts for the requested
pairs. The response's `basis` must be passed unchanged to
`POST /translation-proposals/:id/candidate-revisions`.

### `POST /translation-proposals`

Creates or resumes an idempotent agent proposal. The first slice supports
existing target values in the Catalog Workspace:

```json
{
  "clientProposalKey": "checkout-de-pass-1",
  "target": { "kind": "catalogWorkspace" }
}
```

Retries with the same token, key, and target return the same proposal. Reusing
the key for a different target returns `IDEMPOTENCY_KEY_REUSED`.

### `POST /translation-proposals/:id/candidate-revisions`

Body:

```json
{
  "items": [
    {
      "messageId": "checkout.payButton",
      "localeId": "k...",
      "value": "Jetzt bezahlen",
      "clientRevisionKey": "checkout-de-pass-1-r1",
      "expectedCandidateRevision": 0,
      "basis": {
        "projectionId": "k...",
        "snapshotId": "k...",
        "gitValueFingerprint": "sha256:...",
        "gitValueRevision": 0,
        "workspaceRevision": 0,
        "sourceFingerprint": "sha256:..."
      }
    }
  ]
}
```

Values are checked against the active Source Contract and exact basis. A stale
submission returns `STALE_BASIS` without writing evidence. Corrections append a
new immutable revision and name the current `expectedCandidateRevision`.

For a new Locale, first create or resume the configured Locale Proposal (for
the first slice, `POST /locale-proposals/pt`). Then create the same generic
proposal with a Locale target:

```json
{
  "clientProposalKey": "pt-checkout-pass-1",
  "target": {
    "kind": "localeProposal",
    "localeProposalId": "k..."
  }
}
```

Its candidate basis carries the pinned `localeProposalId`, `snapshotId`, and
source fingerprint instead of a mutable target Locale id. The candidate is
reviewed in the same Proposals workbench; accepting it updates the staged
Locale Proposal as a human-authored value, while rejecting it leaves no active
catalog change. The configured locale adapter is Portuguese today, but this
candidate/review contract is intentionally independent of that code.

### `GET /translation-proposals/:id`

Returns the proposal header for the token that created it.

### `GET /translation-proposals/:id/candidates`

Returns a bounded page of the proposal's current candidate revisions. Use
`limit` (maximum 16) and the returned `continueCursor` to continue.

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

### Portuguese Locale Proposal endpoints

All Portuguese proposal endpoints require both `read` and `propose`.

#### `POST /locale-proposals/pt`

Creates or resumes the proposal pinned to the current accepted Baseline
Snapshot. It returns its id, progress, delivery status, and any current
validation diagnostics. It does not create `pt` as an active project Locale.

#### `GET /locale-proposals/pt?proposalId=...`

Returns the durable proposal review summary, including bounded diagnostics from
the last failed finalization attempt.

#### `GET /locale-proposals/pt/template?proposalId=...&cursor=0&limit=16`

Returns up to 16 ordered source messages from immutable snapshot evidence. Each
message includes its id, source value, source fingerprint, opaque metadata JSON
when present, and whether a value has already been staged.

#### `POST /locale-proposals/pt/values`

Body:

```json
{
  "proposalId": "k...",
  "items": [
    {
      "messageId": "welcome",
      "value": "Boas-vindas, {name}!",
      "sourceFingerprint": "sha256-of-the-returned-source-value"
    }
  ]
}
```

Each request accepts 1–16 values. Unknown ids, duplicate ids, ordinary blanks,
outdated source fingerprints, invalid ICU, and incompatible placeholders are
rejected. For an Intentional Blank, send `"value": ""` plus a concise
`intentionalBlankReason`.

#### `GET /locale-proposals/pt/values?proposalId=...&cursor=0&limit=16`

Returns the submitted values for one bounded source-template page, including
their source fingerprints and any Intentional Blank reasons. Use it to resume
or review a draft without rebuilding an ARB document client-side.

#### `POST /locale-proposals/pt/finalize`

Body:

```json
{ "proposalId": "k..." }
```

Derives `intl_pt.arb` from the pinned Source Snapshot and all staged values. A
complete successful result becomes `ready` only after every agent-authored
value has been human-reviewed. A failed result exposes an actionable
diagnostic sample and persists it on the proposal.

#### `GET /locale-proposals/pt/artifact?proposalId=...`

Returns the immutable, hash-checked Portuguese delivery artifact. The artifact
contains the complete derived `intl_pt.arb`, source repository/commit/manifest
provenance, the project's integration branch, and the fixed `pt-BR` Runtime
Locale Mapping. The local Repository Adapter requires the checkout to be on
that branch and uses it as the pull-request base.

### `POST /export`

Retired. Returns `410 Gone`. The old endpoint synthesized output from the
pre-Catalog-Workspace model and is not a lossless Brickit release surface.
Release automation must wait for the immutable Release Bundle workflow.
