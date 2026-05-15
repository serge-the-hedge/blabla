# Agent API

The localization app exposes a compact HTTP API for external agents. Agents use
project-scoped API tokens and can read/search/export strings or propose edits as
reviewable change sets. Agents cannot directly apply changes.

Base path:

```text
/api/agent/v1
```

Authentication:

```text
Authorization: Bearer <project_api_token>
```

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
