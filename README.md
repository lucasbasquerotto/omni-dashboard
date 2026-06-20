# Omni-Dashboard

SPA dashboard for OmniAgent — a real-time operational dashboard providing system monitoring, thread/message inspection, kanban task management, schedule management, prompt preview, wiki search, and settings management.

Built with **Vite + TypeScript** frontend and **Express** backend, sharing a **PostgreSQL** database with OmniAgent.

---

## Pages

### Overview (`/`)
4-row dashboard page with:

- **Row 1 — KPI Cards**: Threads Today, Avg Response Time, Token Consumption, Active Channels. Each card shows a vs-yesterday trend indicator.
- **Row 2 — SVG Charts**: Bar chart (7-day hourly thread count), donut chart (status distribution), line chart (14-day token trend). All rendered as pure SVG — no Chart.js used for these.
- **Row 3 — Tables**: Recent Activity (last 10 threads with preview/time/tokens) and Channel Health (threads today, avg duration, success rate, last activity).
- **Row 4 — Bottom Bar**: Top Tools Used (7-day tool call counts) and Kanban Snapshot (column counts overview).

### Threads (`/threads`)
Paginated thread list with filter controls:

- Filter by **Status** (completed, failed, processing, pending, etc.)
- Filter by **Cause** (user, cron, kanban, etc.)
- Filter by **Thread ID** (free-text input, uses LIKE search)
- Thread rows are real `<a>` elements (not `<tr>` with JS click handlers) for middle-click support.
- Each row shows: ID, status badge, cause badge, channel, created time, message count, content preview, duration, token count.

### Messages (`/messages`)
Detailed message viewer with extensive filtering:

- Filters: Channel, Thread ID, Role (user/agent/system/tool), Type (multi-select toggle buttons for prompt/response/reasoning/tool/tool_output/iteration/delegate_result/skill), Subtype (free-text), Provider, Model, Seq-0 only checkbox.
- URL search param sync — filters persist in the URL.
- Per-message display: color-coded role badges, timing and token display, expandable content with 3-line truncation.
- Color-coded type and status badges.
- Custom enhanced `<select>` dropdowns for theme consistency.
- Pagination with both top and bottom nav bars.

### Kanban (`/kanban`)
Kanban board with drag-and-drop cards across 7 columns:

- **Columns**: Backlog (neutral), Todo (purple), Ready (warning/amber), In Progress (cyan), Review (blue), Done (emerald/success), Blocked (rose/error).
- **Create Task Modal**: Title, Body, Priority (Low/Med/High/Critical), Status, Channel select (populated from DB), Profile select.
- **Task Detail View** (`/kanban/:id`): Full task info with Edit modal, Archive/Unarchive toggle, Delete action, Move to status dropdown.
- **Drag & Drop**: Desktop only (native HTML5 drag). Cards are `draggable`, columns are drop targets with position-aware insertion via drop Y-coordinate.
- **Archive Toggle**: Show/hide archived tasks.
- Module-level `_dropdownListenerAttached` flag to prevent accumulated listeners on re-render.

### Schedule (`/schedule`)
Cron job list with mode indicators:

- Shows all cron jobs from the `cron_jobs` table.
- Each row: name, schedule/cron expression, mode (agentic/direct), enabled/disabled status, prompt preview, skills, last run / next run.
- **Detail View** (`/schedule/:id`): Full job detail with mode selector toggle, active/inactive switch, channel_id field.
- JSONB fields (skills, context_from, enabled_toolsets) parsed via `parseJsonArray` helper.

### Prompt (`/prompt`)
Prompt preview tool for testing assembled system prompts:

- Channel selector (populated from API), prompt textarea, optional planning step toggle.
- Posts to `/api/prompt-preview/:channelName` which proxies to OmniAgent HTTP API.
- Shows assembled system prompt + messages response.

### Wiki Search (`/wiki`)
Wiki file explorer and search interface:

- **File Tree** (left panel): Tree-view of `/opt/data` filesystem. Directories are expandable/collapsible with lazy-loaded children. Root shows top-level directories only (files filtered out).
- **File Viewer** (right panel): Markdown rendering with `marked` + `marked-highlight` + `highlight.js`. Syntax highlighting for code blocks. Copy-button on each code block. YAML frontmatter stripped before rendering. Tables wrapped in scrollable containers.
- **Search**: Debounced (300ms) search against Qdrant vector DB (`wiki` collection). Scrolls all points and performs case-insensitive substring matching on title and path. Results sorted by relevance score.
- **File Upload**: Drag-drop overlay with confirmation modal. Checks for existing files before upload. Uploads to `/tmp/data/user/uploads/`.
- **File Delete**: Confirmation modal before deletion.
- Explorer collapse/expand toggle persisted in localStorage.

### Settings / Environment (`/settings`)
Environment variable editor:

- Settings fetched from OmniAgent API (`GET /api/settings`), organized by category.
- Per-row **Confirm/Cancel** buttons appear on change detection.
- **Read-only** values shown with lock icon and muted styling.
- **Secret** fields with eye toggle to show/hide password values.
- Field types: number, boolean, select, text, textarea, secret.
- Settings tabs for: Environment, Profiles, Channels, Platforms.

### Settings / Profiles (`/profiles`)
Profiles list with:

- Provider, model, base_url, max_tokens, temperature, tools (JSONB).
- Read-only default-channels display (channels using this profile).

### Settings / Channels (`/channels`)
Channels list with:

- Platform, resource_identifier, open/closed status badge, current profile/provider/model, readonly flag.

### Settings / Platforms (`/platforms`)
Platforms grouped by name:

- Active/inactive status (determined by whether any channel is not closed).
- Resource identifiers linked to channels.
- **Subscription Management**: Add/remove which channels a platform listens to via `channel_subscriptions` table.
- Subscribe: POST to `/api/platforms/:platform/subscribe` with `subscriber_resource` and `channel_id`.
- Unsubscribe: DELETE to `/api/platforms/:platform/subscribe/:subId`.

---

## Architecture

### Frontend
- **Vite + TypeScript SPA** with hashless router.
- `data-route` attributes on `<a>` elements for SPA navigation.
- Router at `src/lib/router.ts` maps routes to page renderer functions.
- Pages are pure TypeScript modules that render into `#main-content` via `innerHTML`.
- All styles in `src/style.css` (dark SaaS theme with CSS custom properties).
- Chart.js used for some charts; SVG-rendered charts in Overview are pure SVG.
- Global file drag-drop in `src/index.ts`.

### Backend
- **Express server** (compiled from TypeScript via `tsc`).
- Routes proxy to OmniAgent API or query shared PostgreSQL directly.
- All API routes under `/api/` prefix.
- SPA fallback: Express serves `index.html` for any non-API, non-file route.
- Static assets in `/assets/` cached for 365 days with `immutable: true`.
- `index.html` served with `Cache-Control: no-store`.
- Docker gateway used to reach sibling containers (`omniagent-omniagent-1:8080`, `qdrant:6333`).

### Docker
- **Multi-stage build**: Stage 1 builds frontend (Vite) + compiles backend (tsc). Stage 2 is a minimal `node:22-alpine` image.
- Frontend output: `./dist/`. Backend output: `./server-dist/`.
- Volume-mounted `./dist:/app/dist:ro` for instant frontend updates without Docker rebuild.
- Served by Node on port 3001 (container) mapped externally.
- Includes `sqlite` for agent_interactions queries.

### Database
- **PostgreSQL** (shared with OmniAgent).
- Connected via `pg` driver with `rowMode: 'array'` for performance.
- `queryDb` helper with automatic retry (3 attempts, exponential backoff) and named-field conversion from array rows.
- Tables accessed: `threads`, `messages`, `channels`, `profiles`, `kanban_tasks`, `cron_jobs`, `channel_subscriptions`.

---

## Directory Structure

```
repo/
├── index.html                     # Entry HTML with sidebar + mobile nav
├── package.json                   # Dependencies and scripts
├── tsconfig.json                  # Frontend TypeScript config (ESNext modules, bundler resolution)
├── tsconfig.server.json           # Server TypeScript config (NodeNext modules, output to server-dist/)
├── vite.config.ts                 # Vite config with @/ path alias
├── Dockerfile                     # Multi-stage Docker build
├── public/                        # Static assets (favicon, etc.)
├── src/
│   ├── index.ts                   # Entry point: SPA router, sidebar toggle, global drag-drop, upload modal, toast system
│   ├── style.css                  # All styles (dark SaaS theme, ~4200 lines)
│   ├── lib/
│   │   ├── router.ts              # SPA routing — maps route names to page renderers
│   │   └── api.ts                 # API client + all TypeScript type definitions
│   └── pages/
│       ├── overview.ts            # Overview dashboard (4-row layout, SVG charts, formatTimeAgo, escapeHtml)
│       ├── threads.ts             # Threads list (filter by status/cause/ID, real <a> rows, pagination)
│       ├── messages.ts            # Message viewer (8 filters, URL sync, custom selects, expandable content)
│       ├── kanban.ts              # Kanban board (7 columns, drag-drop, create/edit/detail modals, archive)
│       ├── schedule.ts            # Schedule page (cron job list + detail view)
│       ├── prompt.ts              # Prompt preview tool
│       ├── wiki.ts                # Wiki explorer (file tree, markdown viewer, search, upload/delete)
│       ├── settings.ts            # Settings editor (env vars, per-row confirm/cancel, secret toggle)
│       ├── profiles.ts            # Profiles tab
│       ├── channels.ts            # Channels tab
│       └── platforms.ts           # Platforms tab with subscription management
└── server/
    ├── index.ts                   # Express setup, static file serving, SPA fallback
    ├── db.ts                      # PostgreSQL connection pool + queryDb helper with retry
    └── routes/
        ├── health.ts              # Health check endpoint (status, version, uptime)
        ├── overview.ts            # Dashboard data (multi-CTE query) + recent threads list
        ├── threads.ts             # Thread list with pagination + filters endpoint
        ├── messages.ts            # Message events + filters (channels, roles, types, providers, models)
        ├── kanban.ts              # Kanban CRUD (board, tasks CRUD, status/position updates)
        ├── schedule.ts            # Cron job list + detail
        ├── settings.ts            # Settings proxy to OmniAgent API
        ├── channels.ts            # Channels list from DB
        ├── profiles.ts            # Profiles list from DB
        ├── platforms.ts           # Platforms + subscription management from DB
        ├── wiki-search.ts         # Wiki search via Qdrant vector DB
        ├── uploads.ts             # File upload/delete/check with multer
        └── fs.ts                  # Filesystem browse/read/download
```

---

## Development

### Commands

| Command | Description |
|---------|-------------|
| `npm run dev:frontend` | Vite dev server |
| `npm run dev:server` | Watch-mode server via `tsx watch` |
| `npm run build:frontend` | Vite production build → `./dist/` |
| `npm run build:server` | tsc compile → `./server-dist/` |
| `npm run build` | Both frontend + server |
| `npm run test` | Run all tests (`node --test`) |
| `npm run lint` | ESLint check |
| `npm run format` | Prettier formatting |
| `npm run format:check` | Check formatting |

### Workflow

- **Frontend-only changes**: Run `npm run build:frontend` — no Docker rebuild needed. The compose file mounts `./dist:/app/dist:ro`, so changes are instantly reflected.
- **Server changes**: Run `npm run build:server` + `docker compose up -d --build dashboard`.
- **Combined changes**: `npm run build` + `docker compose up -d --build dashboard`.
- Always use the combined `docker compose up -d --build` (not separate build + recreate).
- Never use `--no-cache` unless the `dist/` directory is empty.

### Tests
- Test files in `tests/` directory.
- Run with `npm run test` or `npm run test:unit`.
- Uses Node.js built-in test runner.

---

## Environment / Configuration

The server reads the following environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PGHOST` | `postgres` | PostgreSQL host |
| `PGPORT` | `5432` | PostgreSQL port |
| `PGUSER` | `omniagent` | PostgreSQL user |
| `PGPASSWORD` | `omniagent` | PostgreSQL password |
| `PGDATABASE` | `omniagent` | PostgreSQL database name |
| `PORT` | `3001` | Server listen port |

The dashboard container connects to:
- **OmniAgent HTTP API** at `http://omniagent-omniagent-1:8080` (for settings and prompt-preview).
- **Qdrant** at `http://qdrant:6333` (for wiki search).
- Note: Dashboard cannot reach sibling containers via `localhost` — uses Docker internal networking.

### Caching

- Content-hashed JS/CSS files in `/assets/` are cached for **365 days** with `immutable: true`.
- `index.html` is served with `Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate`.
- After deploying frontend changes, users may need **Ctrl+Shift+R** (hard refresh) to bypass cached JS.
- If `index.html` loads stale JS references, the page shows blank white — meta tags + Cache-Control headers mitigate this.

---

## Dependencies

### Runtime

| Package | Purpose |
|---------|---------|
| `express` | HTTP server |
| `pg` | PostgreSQL driver |
| `multer` | File upload handling |
| `chart.js` | Chart rendering |
| `marked` | Markdown→HTML parsing |
| `marked-highlight` | Markdown code highlighting |
| `highlight.js` | Syntax highlighting |
| `shell-quote` | Shell command quoting |

### Dev

| Package | Purpose |
|---------|---------|
| `vite` | Frontend bundler |
| `typescript` | TypeScript compiler |
| `eslint` | Linting |
| `prettier` | Code formatting |
| `husky` | Git hooks |
| `@types/*` | TypeScript type definitions |

---

## API Endpoints

All endpoints are under `/api/`:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Server health check (status, version, uptime) |
| `/api/overview` | GET | Recent threads list (50 most recent) |
| `/api/overview/dashboard` | GET | Full dashboard data (KPIs, charts, tables, tools) |
| `/api/threads` | GET | Paginated threads with filters |
| `/api/threads/filters` | GET | Available status and cause values |
| `/api/messages/filters` | GET | Available filter values (channels, roles, types, etc.) |
| `/api/messages/events` | GET | Paginated messages with all filters |
| `/api/kanban/board` | GET | Kanban board (columns with tasks) |
| `/api/kanban/tasks` | POST | Create kanban task |
| `/api/kanban/tasks/:id` | GET | Task detail |
| `/api/kanban/tasks/:id` | PATCH | Update task fields |
| `/api/kanban/tasks/:id` | DELETE | Delete task |
| `/api/kanban/tasks/:id/status` | PATCH | Move task between columns |
| `/api/kanban/tasks/:id/position` | PATCH | Reorder task within/between columns |
| `/api/schedule` | GET | List cron jobs |
| `/api/schedule/:id` | GET | Cron job detail |
| `/api/settings` | GET | All env settings (proxied to OmniAgent) |
| `/api/settings` | PUT | Update settings (proxied to OmniAgent) |
| `/api/prompt-preview/:channelName` | POST | Preview assembled prompt (proxied to OmniAgent) |
| `/api/channels` | GET | List all channels |
| `/api/profiles` | GET | List all profiles |
| `/api/platforms` | GET | List all platforms with subscriptions |
| `/api/platforms/:platform/subscribe` | POST | Add channel subscription |
| `/api/platforms/:platform/subscribe/:subId` | DELETE | Remove channel subscription |
| `/api/wiki-search` | POST | Search wiki via Qdrant |
| `/api/uploads` | POST | Upload files |
| `/api/uploads/list` | GET | List uploaded files |
| `/api/uploads/check` | POST | Check if files exist |
| `/api/uploads/:file` | DELETE | Delete uploaded file |
| `/api/fs/list` | GET | List directory contents |
| `/api/fs/read` | GET | Read file content |
| `/api/fs/download` | GET | Download file |
