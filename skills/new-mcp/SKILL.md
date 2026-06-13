---
name: new-mcp
description: Scaffold a new MCP server project under mcps/ — interview-driven, supports TypeScript and Python, simple tool servers and API wrappers. Writes project files, installs dependencies, builds, and registers in ~/.claude.json. Use when the user types /new-mcp or asks to create / scaffold / add an MCP server. Mode A only — never auto-fire.
---

# new-mcp

Scaffold MCP (Model Context Protocol) server projects end-to-end. Two flavors: **simple tool server** (direct computation, no external dependencies) and **API wrapper** (wraps an external REST API with auth, rate limiting, error handling). Both TypeScript and Python supported.

## When to run

- User types `/new-mcp` (explicit trigger).
- User says "scaffold an MCP server," "create a new MCP," "add an MCP tool server."
- Do **not** auto-fire. Mode A only — every run goes through the interview.

## Inputs

1. **Triggering message.** Anything after `/new-mcp` is hint text — biases language/flavor selection but never skips the interview.
2. **Existing mcps tree.** `mcps/` in the repo root — used for collision check.
3. **`~/.claude.json`.** Read for the merge contract when registering the MCP server.

## Procedure

### 1. Language choice

Prompt:

```
Which language?
  1. TypeScript (Node.js)
  2. Python
```

Wait for the user's choice. Determines the template set and downstream commands.

### 2. Flavor selection

Prompt:

```
What kind of MCP server?
  1. Simple tool server — direct computation, no external API calls
  2. API wrapper — wraps an external REST API with auth and error handling
```

Wait for the user's choice. Determines template variant and whether step 7 runs.

### 3. Server name

Prompt:

```
What should the server be called? (lowercase-with-dashes, e.g. weather-lookup, jira-bridge)
```

Validate: lowercase letters, digits, hyphens only. No leading/trailing hyphen, no double hyphens. Reject otherwise with the rule restated.

### 4. Collision check

Check `mcps/<name>/` directory. If it exists:

```
Server '<name>' already exists at mcps/<name>/.
  (o)verwrite — delete existing directory, scaffold fresh
  (r)ename    — pick a new server name
  (a)bort     — exit without changes
Choice?
```

- **overwrite**: warn that existing files will be replaced. Proceed.
- **rename**: loop back to step 3.
- **abort**: stop cleanly. No writes.

### 5. Server description

Prompt:

```
One-sentence description of what this server does:
```

Used in `package.json` / `pyproject.toml` `description` and the MCP server `name` metadata. Reject empty input.

### 6. Tool definitions

Prompt:

```
Define the tools this server will expose (1–5 tools).

For each tool, provide:
  - Name (snake_case, e.g. get_weather)
  - Description (one sentence)
  - Parameters (name:type pairs, e.g. location:string, count:number, verbose:boolean)
    Mark required params with !, e.g. location:string!

Tool 1:
```

Collect 1–5 tools. For each, validate:
- Name is snake_case (lowercase + underscores).
- At least one parameter (can be empty for no-param tools — confirm explicitly).
- Supported types: `string`, `number`, `boolean`. Reject others with a note.

After each tool, ask *"Add another? (y/N)"*. Stop at 5 or on N.

### 7. API wrapper specifics (API flavor only)

Skip entirely for simple flavor. For API wrapper:

Prompt (one question at a time):

1. **Base URL** — `What's the API base URL? (e.g. https://api.weather.gov)` — Validate URL format.
2. **Auth method** — `How does the API authenticate?`
   - `1. None`
   - `2. API key in header (e.g. X-Api-Key: <key>)`
   - `3. Bearer token (Authorization: Bearer <token>)`
   - `4. Custom header (you specify name + value source)`
3. **Auth env var** (if auth ≠ none) — `Environment variable name for the API key/token? (e.g. WEATHER_API_KEY)` — Validate UPPER_SNAKE_CASE.
4. **Rate limit** — `Max requests per second? (default: 10)` — Accept number or Enter for default.

### 8. Registration scope

Prompt:

```
Where should this MCP server be registered?
  1. User scope (available in all projects) — recommended
  2. Local scope (current project only)
```

Default: user scope.

### 9. Confirmation preview

Show the user:

```
About to scaffold:
  Language:     <TypeScript|Python>
  Flavor:       <simple|api-wrapper>
  Name:         <name>
  Description:  <description>
  Tools:        <tool1>, <tool2>, ...

Files to create:
  mcps/<name>/src/<entry-file>
  mcps/<name>/package.json (or requirements.txt)
  mcps/<name>/tsconfig.json (TypeScript only)

Registration:
  Scope: <user|local>
  Config: ~/.claude.json

Post-scaffold:
  <npm install && npm run build | pip install -r requirements.txt>

Proceed? (y/N)
```

If API wrapper, also show:
```
  API base:     <url>
  Auth:         <method> via $<ENV_VAR>
  Rate limit:   <n> req/s
```

On `n` → abort cleanly. On `y` → step 10.

### 10. Write artifacts

Generate files from templates with placeholder substitution. Template selection:

| Language | Flavor | Template dir |
|----------|--------|-------------|
| TypeScript | Simple | `templates/ts-simple/` |
| TypeScript | API | `templates/ts-api/` |
| Python | Simple | `templates/py-simple/` |
| Python | API | `templates/py-api/` |

Placeholders substituted:

| Placeholder | Source |
|-------------|--------|
| `__NAME__` | Server name from step 3 |
| `__DESCRIPTION__` | Description from step 5 |
| `__TOOL_REGISTRATIONS__` | Generated by `lib/tool-codegen.js` from step 6 answers |
| `__BASE_URL__` | API base URL from step 7 (API only) |
| `__AUTH_TYPE__` | Auth method from step 7 (API only) |
| `__AUTH_ENV_VAR__` | Env var name from step 7 (API only) |
| `__RATE_LIMIT__` | Rate limit from step 7 (API only) |

Write order:
1. Create `mcps/<name>/` directory.
2. Create `mcps/<name>/src/` directory.
3. Write entry file (`src/index.ts` or `src/server.py`).
4. Write config file (`package.json` or `requirements.txt`).
5. Write `tsconfig.json` (TypeScript only).

### 11. Build & install

Run the appropriate commands:

- **TypeScript:** `cd mcps/<name> && npm install && npm run build`
- **Python:** `cd mcps/<name> && python -m venv .venv && .venv/bin/pip install -r requirements.txt` (Unix) or `.venv\Scripts\pip install -r requirements.txt` (Windows)

Report output. On failure:

> Build failed. Artifacts are on disk at `mcps/<name>/`. Fix the issue and re-run the build manually. The skill does not auto-revert.

Do not abort registration — proceed to step 12 even on build failure (the user may fix and rebuild).

### 12. Register & verify

Register the MCP server. Prefer `claude mcp add` CLI:

**TypeScript:**
```bash
claude mcp add --transport stdio --scope <user|project> <name> -- node <absolute-path>/mcps/<name>/build/index.js
```

**Python:**
```bash
claude mcp add --transport stdio --scope <user|project> <name> -- <absolute-path>/mcps/<name>/.venv/bin/python <absolute-path>/mcps/<name>/src/server.py
```

If `claude mcp add` is unavailable, fall back to direct `~/.claude.json` merge via [`lib/claude-json-merge.js`](lib/claude-json-merge.js). Show the diff before writing.

Report success:

```
MCP server '<name>' scaffolded and registered.
  Project:      mcps/<name>/
  Entry:        <entry-file>
  Registration: ~/.claude.json (scope: <user|local>)

To verify, restart Claude Code and run /mcp to see the registered server.
```

Stop. Do not commit, do not invoke `/review`.

## Template structure

```
skills/new-mcp/templates/
├── ts-simple/
│   ├── src/index.ts.template
│   ├── package.json.template
│   └── tsconfig.json.template
├── ts-api/
│   ├── src/index.ts.template
│   ├── package.json.template
│   └── tsconfig.json.template
├── py-simple/
│   ├── src/server.py.template
│   └── requirements.txt.template
└── py-api/
    ├── src/server.py.template
    └── requirements.txt.template
```

## Shared utility libraries

### TypeScript (`mcps/lib/`)

Used by API-wrapper TypeScript servers. Provides:
- `createApiFetcher({ baseUrl, auth, rateLimit })` — typed fetch wrapper with auth header injection
- Token-bucket rate limiter
- `formatMcpError(err)` — error-to-MCP-response formatting

### Python (`mcps/lib-py/`)

Used by API-wrapper Python servers. Provides:
- `httpx`-based async fetcher with auth and rate limiting
- Error formatting utilities

## What this skill does NOT do

- **Does not edit existing MCP servers.** Modify files directly.
- **Does not unregister MCP servers.** Use `claude mcp remove <name>`.
- **Does not support HTTP/SSE transport.** stdio only in v1.
- **Does not auto-fire.** Mode A only.
- **Does not auto-revert on build failure.** Fail-noisy.
- **Does not commit.** The user decides when to commit.
- **Does not modify bootstrap.** MCPs are standalone projects, not synced subtrees.

## Relationship to other organs

- **prep (004)** — when designing a new MCP server, prep with `[mcp, web]` scope.
- **capture (011)** — surprises during scaffold (a template edge case, a registration failure) are capture candidates.
- **review (005)** — review can audit MCP server code against architectural rules.
- **architectural-rules tree (006)** — `universal/skill-auto-fire.md` applies: this skill fires via description on `/new-mcp`, no SessionStart hook.
