# Localization MCP Server Contract

The first implementation ships HTTP endpoints. A future MCP server should be a
thin adapter over those endpoints so agents get the same semantics in every
environment.

## Tools

### `localization_project`

Maps to `GET /api/agent/v1/projects/current`.

Returns compact project metadata, including source locale, locales, screens, and
tags.

### `localization_search_strings`

Maps to `GET /api/agent/v1/strings/search`.

Inputs:

- `q`
- `locale`
- `screen`
- `tag`
- `status`
- `limit`

Returns compact string rows suitable for low-token agent browsing.

### `localization_get_context`

Maps to `POST /api/agent/v1/context`.

Inputs:

- `keys`
- `locales`
- `includeHistory`

Returns requested values, metadata, and optional recent field history.

### `localization_create_change_set`

Maps to `POST /api/agent/v1/change-sets`.

Creates a human-reviewable change set. This tool must not apply changes.

### `localization_get_change_set`

Maps to `GET /api/agent/v1/change-sets/:id`.

Returns review status, item statuses, and conflicts.

### `localization_export`

Maps to `POST /api/agent/v1/export`.

Exports JSON or Flutter ARB for `all`, `keys`, `tag`, or `screen` selection.

## Token Scope Mapping

- `read`: `localization_project`, `localization_get_context`,
  `localization_get_change_set`
- `search`: `localization_search_strings`
- `propose`: `localization_create_change_set`
- `export`: `localization_export`
