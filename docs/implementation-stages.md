# RAD Collaboration Hub — Implementation Stages

> **Version:** Draft 0.1  
> **Status:** Engineering Plan  
> **Base:** Existing `copilot-remote` fork (Express 5 + ws + ACP SDK + React/Vite)

---

## Current Baseline

The existing codebase already provides:

| Subsystem | Status | Notes |
|---|---|---|
| Express 5 REST API | ✅ Exists | Session CRUD, uploads |
| WebSocket streaming | ✅ Exists | PTY output, message protocol |
| GitHub Copilot CLI (ACP) | ✅ Exists | `acp-manager.ts` — first provider |
| Terminal rendering | ✅ Exists | xterm.js, node-pty |
| Session persistence | ✅ Exists | `events.jsonl` + in-memory |
| Token auth | ✅ Exists | `~/.copilot-remote/auth-token` |
| Swarm (P2P mesh) | ✅ Exists | Hyperswarm-based |
| React SPA | ✅ Exists | Vite, Primer React |
| Unit + E2E tests | ✅ Exists | Vitest + Playwright |

All stages below build on top of this foundation without breaking it.

---

## Package Conventions

### Backend additions

```
npm install --save <package>          # runtime
npm install --save-dev <package>      # tooling / types
```

### Frontend additions

```
npm install --save <package>          # runtime
```

All new backend packages go into `server/package.json`.  
All new frontend packages go into `web/package.json`.

---

# Stage 1 — Foundation Hardening

> Goal: stabilise the existing code, introduce shared types, add Zod validation, and wire up a proper config system before building anything new.

**Duration estimate:** 1–2 weeks

### Packages

| Package | Layer | Purpose |
|---|---|---|
| `zod` | server + web | Schema validation at API boundaries |
| `dotenv` | server | `.env` config loading |
| `pino` | server | Structured JSON logging (replaces `console.log`) |
| `pino-pretty` | server dev | Human-readable log output in development |
| `@types/node` | server dev | Already likely present — verify version |

### Tasks

#### 1.1 Shared config module

```
server/src/config.ts
```

Read all env vars through a single `config` object validated by Zod.  
No scattered `process.env.X` calls in business logic.

```ts
// server/src/config.ts
import { z } from 'zod'

const schema = z.object({
  PORT: z.coerce.number().default(3000),
  AUTH_TOKEN_PATH: z.string().default('~/.copilot-remote/auth-token'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().optional(),    // populated in Stage 2
  SESSION_SECRET: z.string().optional(),  // populated in Stage 2
})

export const config = schema.parse(process.env)
```

#### 1.2 Request validation middleware

Wrap existing REST routes with Zod parse at the handler boundary.  
Return `400` with structured error messages on validation failure.

#### 1.3 Structured logging

Replace all `console.log` / `console.error` with `pino` logger.  
Pass logger instance through managers via constructor injection.

#### 1.4 Error handling middleware

Add a global Express error handler that formats all uncaught route errors as:

```json
{ "error": "message", "code": "ERROR_CODE" }
```

#### 1.5 OpenAPI stub

Add `server/src/openapi.ts` that documents the existing endpoints.  
Use `zod-openapi` or hand-write the YAML.  
Expose `GET /api/openapi.json`.

---

# Stage 2 — Database & Persistence

> Goal: replace file-based session storage (`events.jsonl`) with PostgreSQL using Drizzle ORM. Keep SQLite for development.

**Duration estimate:** 2–3 weeks

### Packages

| Package | Layer | Purpose |
|---|---|---|
| `drizzle-orm` | server | ORM — schema, queries, migrations |
| `drizzle-kit` | server dev | Migration generation + push CLI |
| `postgres` | server | PostgreSQL client (for production) |
| `better-sqlite3` | server | SQLite client (for development) |
| `@types/better-sqlite3` | server dev | TypeScript types |

### Schema

```
server/src/db/
  schema.ts        ← Drizzle table definitions
  index.ts         ← DB client singleton
  migrations/      ← Generated migration files
```

#### Core tables

```ts
// server/src/db/schema.ts  (sketch)

export const users = pgTable('users', {
  id:         uuid().primaryKey().defaultRandom(),
  email:      text().notNull().unique(),
  name:       text().notNull(),
  createdAt:  timestamp().defaultNow(),
})

export const workspaces = pgTable('workspaces', {
  id:         uuid().primaryKey().defaultRandom(),
  name:       text().notNull(),
  ownerId:    uuid().references(() => users.id),
  createdAt:  timestamp().defaultNow(),
})

export const sessions = pgTable('sessions', {
  id:         uuid().primaryKey().defaultRandom(),
  workspaceId: uuid().references(() => workspaces.id),
  ownerId:    uuid().references(() => users.id),
  provider:   text().notNull().default('copilot'),
  status:     text().notNull().default('created'),
  cwd:        text(),
  createdAt:  timestamp().defaultNow(),
  updatedAt:  timestamp().defaultNow(),
})

export const messages = pgTable('messages', {
  id:         uuid().primaryKey().defaultRandom(),
  sessionId:  uuid().references(() => sessions.id),
  role:       text().notNull(),  // 'user' | 'assistant' | 'tool'
  content:    text().notNull(),
  createdAt:  timestamp().defaultNow(),
})
```

### Tasks

#### 2.1 DB client

```ts
// server/src/db/index.ts
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { config } from '../config'

const client = postgres(config.DATABASE_URL!)
export const db = drizzle(client)
```

For development, use SQLite variant:

```ts
import { drizzle } from 'drizzle-orm/better-sqlite3'
import Database from 'better-sqlite3'
```

Switch via `DATABASE_URL` — if starts with `file:` → SQLite, otherwise → PostgreSQL.

#### 2.2 Migrate session-store

Keep `session-store.ts` as an interface.  
Swap the in-memory + `events.jsonl` implementation for a DB-backed one.  
Existing `SessionStore` consumers (managers, routes) unchanged.

#### 2.3 drizzle-kit config

```ts
// drizzle.config.ts  (server root)
export default {
  schema: './src/db/schema.ts',
  out:    './src/db/migrations',
  driver: 'pg',                // or 'better-sqlite'
}
```

Run migrations with: `npx drizzle-kit push` (dev) / `npx drizzle-kit migrate` (prod).

---

# Stage 3 — Authentication

> Goal: replace the single shared file-based token with real user accounts.
> Platform auth is independent of any AI provider. Copilot CLI authenticates itself — the platform never touches that token.

**Duration estimate:** 2 weeks

### Important separation

```
Platform auth                         Copilot CLI auth
─────────────────────────────         ──────────────────────────────────
Who can log in to the hub?            Is the copilot binary authenticated?
Local accounts / LDAP                 Handled entirely by `copilot auth login`
Managed by us                         Stored in ~/.config/github-copilot/
JWT cookie on every API request       Read by the CLI subprocess at spawn time
```

The platform never reads, proxies, or stores the Copilot CLI token.  
If the CLI binary is not authenticated, `AcpManager` will fail to start — that is a provider health issue, not a platform auth issue.

### Packages

| Package | Layer | Purpose |
|---|---|---|
| `argon2` | server | Password hashing (local accounts) |
| `jose` | server | JWT sign / verify (stateless sessions) |
| `ldapts` | server | LDAP bind + search (optional, loaded only if configured) |

No auth framework. Three small focused packages, each doing one thing.

### Auth strategy interface

One tiny interface so LDAP and local accounts are interchangeable and new providers (SAML, OAuth) can be added later without changing anything else.

```ts
// server/src/auth/types.ts
export interface AuthStrategy {
  /** Returns a user record or null if credentials are wrong */
  authenticate(credentials: { username: string; password: string }): Promise<AuthUser | null>
}

export interface AuthUser {
  id:    string
  email: string
  name:  string
}
```

### Local strategy

```ts
// server/src/auth/local-strategy.ts
import argon2 from 'argon2'
import { db } from '../db'
import { users } from '../db/schema'
import type { AuthStrategy } from './types'

export class LocalStrategy implements AuthStrategy {
  async authenticate({ username, password }) {
    const user = await db.query.users.findFirst(
      { where: (u, { eq }) => eq(u.email, username) }
    )
    if (!user?.passwordHash) return null
    const ok = await argon2.verify(user.passwordHash, password)
    return ok ? { id: user.id, email: user.email, name: user.name } : null
  }
}
```

### LDAP strategy (optional)

Only instantiated when `LDAP_URL` is present in config.

```ts
// server/src/auth/ldap-strategy.ts
import { Client } from 'ldapts'
import type { AuthStrategy } from './types'

export class LdapStrategy implements AuthStrategy {
  private client: Client

  constructor(private cfg: LdapConfig) {
    this.client = new Client({ url: cfg.url, tlsOptions: cfg.tls })
  }

  async authenticate({ username, password }) {
    const dn = this.cfg.bindDn.replace('{username}', username)
    try {
      await this.client.bind(dn, password)
      const { searchEntries } = await this.client.search(this.cfg.baseDn, {
        filter: `(uid=${username})`,
        attributes: ['cn', 'mail'],
      })
      const entry = searchEntries[0]
      if (!entry) return null
      return { id: dn, email: String(entry.mail), name: String(entry.cn) }
    } catch {
      return null
    } finally {
      await this.client.unbind()
    }
  }
}
```

### Strategy selector

```ts
// server/src/auth/index.ts
import { config } from '../config'
import { LocalStrategy } from './local-strategy'
import { LdapStrategy }  from './ldap-strategy'
import type { AuthStrategy } from './types'

export function buildAuthStrategy(): AuthStrategy {
  if (config.LDAP_URL) {
    return new LdapStrategy({
      url:    config.LDAP_URL,
      bindDn: config.LDAP_BIND_DN!,
      baseDn: config.LDAP_BASE_DN!,
      tls:    config.LDAP_TLS ? { rejectUnauthorized: true } : undefined,
    })
  }
  return new LocalStrategy()
}

export { type AuthStrategy, type AuthUser } from './types'
```

Bootstrapped once in `index.ts`:

```ts
const authStrategy = buildAuthStrategy()
```

### JWT sessions

```ts
// server/src/auth/jwt.ts
import { SignJWT, jwtVerify } from 'jose'
import { config } from '../config'

const secret = new TextEncoder().encode(config.SESSION_SECRET)

export async function signToken(user: AuthUser): Promise<string> {
  return new SignJWT({ sub: user.id, email: user.email, name: user.name })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('8h')
    .sign(secret)
}

export async function verifyToken(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret)
    return { id: payload.sub!, email: payload.email as string, name: payload.name as string }
  } catch {
    return null
  }
}
```

### Login endpoint

```ts
// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = loginSchema.parse(req.body)
  const user = await authStrategy.authenticate({ username, password })
  if (!user) return res.status(401).json({ error: 'Invalid credentials' })
  const token = await signToken(user)
  res.cookie('token', token, { httpOnly: true, sameSite: 'strict', secure: config.NODE_ENV === 'production' })
  res.json({ user })
})

// POST /api/auth/logout
router.post('/logout', (_req, res) => {
  res.clearCookie('token').json({ ok: true })
})
```

### Auth middleware

```ts
// server/src/auth/middleware.ts
export async function requireAuth(req, res, next) {
  const token = req.cookies?.token
  const user  = token ? await verifyToken(token) : null
  if (!user) return res.status(401).json({ error: 'Unauthorized' })
  req.user = user
  next()
}
```

### New env vars

```bash
SESSION_SECRET=<64-byte-random-hex>

# LDAP — all optional, omit for local auth
LDAP_URL=ldap://ldap.example.com:389
LDAP_BIND_DN=uid={username},ou=people,dc=example,dc=com
LDAP_BASE_DN=ou=people,dc=example,dc=com
LDAP_TLS=true
```

### Tasks

#### 3.1 Replace file-token middleware

Keep `swarm-keys.ts` token check on swarm/tunnel routes.  
Replace main API auth middleware with `requireAuth` (JWT cookie).

#### 3.2 Attach user to request

```ts
declare global {
  namespace Express {
    interface Request { user?: AuthUser }
  }
}
```

#### 3.3 Frontend auth client

Simple `fetch` wrapper — no auth client library needed.

```ts
// web/src/lib/auth.ts
export const login  = (u: string, p: string) =>
  fetch('/api/auth/login',  { method: 'POST', credentials: 'include', body: JSON.stringify({ username: u, password: p }), headers: { 'Content-Type': 'application/json' } })

export const logout = () =>
  fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })

export const me = () =>
  fetch('/api/auth/me', { credentials: 'include' }).then(r => r.ok ? r.json() : null)
```

#### 3.4 Protected routes

Wrap the React app with a `<AuthGuard>` component.  
Unauthenticated users see `/login`.

---

# Stage 4 — Workspace & User Management

> Goal: implement the workspace model so sessions belong to workspaces and workspaces belong to users.  
> User accounts are local-first. If LDAP is configured, users can be provisioned on first successful LDAP login (just-in-time provisioning) — no manual import required.

**Duration estimate:** 2 weeks

### Packages

| Package | Layer | Purpose |
|---|---|---|
| `nanoid` | server | Short human-readable IDs for workspace slugs |
| `@tanstack/react-query` | web | Server state, caching, mutations |
| `react-router-dom` v7 | web | Client-side routing |
| `zustand` | web | Lightweight UI state |

### User model

```ts
// server/src/db/schema.ts  (users table)
export const users = pgTable('users', {
  id:           uuid().primaryKey().defaultRandom(),
  email:        text().notNull().unique(),
  name:         text().notNull(),
  passwordHash: text(),             // null for LDAP-provisioned accounts
  source:       text().notNull().default('local'),  // 'local' | 'ldap'
  createdAt:    timestamp().defaultNow(),
  lastLoginAt:  timestamp(),
})
```

`passwordHash` is `null` for LDAP users — they never log in with a local password.  
The `source` field is informational only; auth strategy selection is determined by config, not per-user.

### LDAP just-in-time provisioning

After a successful LDAP bind, upsert the user row:

```ts
// server/src/auth/ldap-strategy.ts  (inside authenticate())
const existing = await db.query.users.findFirst(
  { where: (u, { eq }) => eq(u.email, entry.mail) }
)
if (!existing) {
  await db.insert(users).values({ email: entry.mail, name: entry.cn, source: 'ldap' })
}
```

No admin action needed. Users appear in the database the first time they log in.

### New REST endpoints

```
# Users (admin only for list/delete, self for profile)
GET    /api/users                  list all users (admin)
GET    /api/users/me               current user profile
PATCH  /api/users/me               update name / password (local only)
DELETE /api/users/:id              delete user (admin)

# Workspaces
GET    /api/workspaces             list user's workspaces
POST   /api/workspaces             create workspace
GET    /api/workspaces/:id         get workspace
PATCH  /api/workspaces/:id         update workspace
DELETE /api/workspaces/:id         delete workspace

# Members
GET    /api/workspaces/:id/members
POST   /api/workspaces/:id/members    add member by email
DELETE /api/workspaces/:id/members/:userId
```

### Frontend routing

```
/                             → redirect to /workspaces
/login                        → login page
/workspaces                   → workspace list
/workspaces/:id               → workspace home
/workspaces/:id/sessions      → session list (current App.tsx content)
/workspaces/:id/sessions/:sid → session detail
/settings                     → user profile / password change
```

### Workspace service

Keep it a plain class with no framework magic:

```ts
// server/src/workspace-manager.ts
export class WorkspaceManager {
  async list(userId: string)  { /* db query */ }
  async create(userId: string, name: string) { /* insert + add owner member */ }
  async get(id: string, userId: string)  { /* check membership */ }
  async update(id: string, userId: string, patch: Partial<Workspace>) { /* owner/admin only */ }
  async delete(id: string, userId: string)  { /* owner only */ }
  async addMember(workspaceId: string, email: string, role: string)  { /* lookup user by email */ }
  async removeMember(workspaceId: string, userId: string)  { /* not last owner */ }
}
```

Injected into route handlers — no global singleton.

### Tasks

#### 4.1 Session scoping

All session routes require a `workspaceId`.  
`session-manager.ts` gains a workspace filter.

#### 4.2 React Router wiring

Wrap `App.tsx` with `<BrowserRouter>`.  
Move session list + session detail into routed pages.

#### 4.3 TanStack Query

Replace direct `fetch` calls in `lib/api.ts` with query/mutation hooks.  
Automatic background refetch, optimistic updates for session status.

#### 4.4 Password change (local accounts only)

`PATCH /api/users/me` accepts `{ currentPassword, newPassword }`.  
Rejects the request with `403` if `user.source === 'ldap'`.

---

# Stage 5 — Provider Abstraction

> Goal: wrap the existing `AcpManager` (Copilot CLI) behind a provider interface so other providers can be added without touching business logic.

**Duration estimate:** 2 weeks

### No new runtime packages required

The abstraction is pure TypeScript.

### Provider interface

```ts
// server/src/providers/types.ts

export interface ProviderSession {
  id: string
  send(message: string): Promise<void>
  cancel(): Promise<void>
  on(event: 'stream', cb: (chunk: string) => void): void
  on(event: 'turn_complete', cb: (msg: AssistantMessage) => void): void
  on(event: 'error', cb: (err: Error) => void): void
}

export interface Provider {
  readonly id: string        // 'copilot' | 'claude' | 'ollama' ...
  readonly name: string
  isAvailable(): Promise<boolean>
  createSession(opts: CreateSessionOptions): Promise<ProviderSession>
  healthCheck(): Promise<HealthResult>
}
```

### File layout

```
server/src/providers/
  types.ts             ← interface definitions above
  registry.ts          ← ProviderRegistry class
  copilot/
    index.ts           ← wraps existing AcpManager
  claude/
    index.ts           ← stub (Stage 8)
  ollama/
    index.ts           ← stub (Stage 9)
```

### Tasks

#### 5.1 Copilot provider wrapper

The Copilot CLI manages its own authentication entirely. The platform only checks whether the binary is available and authenticated — it never reads or stores the token.

```ts
// server/src/providers/copilot/index.ts
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { AcpManager } from '../../acp-manager'
import type { Provider, ProviderSession } from '../types'

const exec = promisify(execFile)

export class CopilotProvider implements Provider {
  readonly id = 'copilot'
  readonly name = 'GitHub Copilot CLI'

  async isAvailable(): Promise<boolean> {
    try {
      // `copilot auth status` exits 0 when authenticated, non-zero otherwise
      await exec('copilot', ['auth', 'status'])
      return true
    } catch {
      return false
    }
  }

  async createSession(opts) {
    const mgr = new AcpManager(opts)
    return new CopilotSession(mgr)   // thin adapter — AcpManager unchanged
  }

  async healthCheck() {
    const available = await this.isAvailable()
    return {
      ok:      available,
      message: available ? 'copilot CLI authenticated' : 'copilot CLI not found or not authenticated — run: copilot auth login',
    }
  }
}
```

If `healthCheck()` returns `ok: false`, the provider is shown as unavailable in the UI with a clear message. The platform user's own login session is completely unaffected.

`AcpManager` is unchanged. The wrapper is a thin adapter.

#### 5.2 Provider registry

```ts
// server/src/providers/registry.ts
export class ProviderRegistry {
  private providers = new Map<string, Provider>()

  register(p: Provider) { this.providers.set(p.id, p) }

  get(id: string): Provider {
    const p = this.providers.get(id)
    if (!p) throw new Error(`Unknown provider: ${id}`)
    return p
  }

  list() { return [...this.providers.values()] }
}
```

Bootstrap in `index.ts`:

```ts
const registry = new ProviderRegistry()
registry.register(new CopilotProvider())
```

#### 5.3 Session manager update

`SessionManager` receives a `ProviderRegistry` and looks up the provider by `session.provider` string.  
No direct `AcpManager` instantiation in `session-manager.ts`.

#### 5.4 Provider API endpoints

```
GET  /api/providers              list registered providers + availability
GET  /api/providers/:id/health   health check for a specific provider
```

---

# Stage 6 — Real-time Collaboration

> Goal: multiple users can observe the same session in real time.

**Duration estimate:** 3 weeks

### Packages

| Package | Layer | Purpose |
|---|---|---|
| `socket.io` | server + web | Replace raw `ws` for rooms, namespaces, auto-reconnect |
| `socket.io-client` | web | Frontend counterpart |

> Alternatively keep `ws` and build room logic manually — Socket.io is heavier but saves significant implementation time for multi-room use cases.

### Protocol change

Current WebSocket protocol is point-to-point (one client, one session).  
New protocol: one session = one room, multiple subscribers.

```
// Client → Server
{ type: 'join',  sessionId: string }
{ type: 'leave', sessionId: string }
{ type: 'input', sessionId: string, data: string }

// Server → Client (broadcast to room)
{ type: 'stream',         sessionId, chunk }
{ type: 'turn_complete',  sessionId, message }
{ type: 'status',         sessionId, status }
{ type: 'presence',       sessionId, participants: User[] }
```

### Presence tracking

```ts
// server/src/collaboration/presence.ts
export class PresenceManager {
  private rooms = new Map<string, Set<string>>()  // sessionId → Set<userId>

  join(sessionId: string, userId: string) { ... }
  leave(sessionId: string, userId: string) { ... }
  list(sessionId: string): string[] { ... }
}
```

Presence updates broadcast to all room members on join/leave.

### Tasks

#### 6.1 Migrate WebSocket server to Socket.io

Existing `ws` server in `index.ts` → replaced with `socket.io` server.  
Existing message protocol mapped to Socket.io events.  
E2E tests updated (Playwright supports Socket.io via raw WS).

#### 6.2 Session rooms

On `join`, socket is added to room `session:<id>`.  
Provider stream events emit to the room, not a single socket.

#### 6.3 Viewer mode

Viewers can join but cannot send `input`.  
Enforce via role check: only session owner or workspace developer can write.

#### 6.4 Frontend presence indicator

Small avatar stack in session header showing active participants.

---

# Stage 7 — RBAC & Permissions

> Goal: enforce roles across workspaces and sessions.

**Duration estimate:** 1–2 weeks

### Packages

| Package | Layer | Purpose |
|---|---|---|
| `casl` | server + web | Attribute-based access control |

### Roles

| Role | Scope | Permissions |
|---|---|---|
| `admin` | platform | everything |
| `workspace_admin` | workspace | manage members, sessions, settings |
| `developer` | workspace | create sessions, send prompts |
| `viewer` | workspace | read sessions, observe live |
| `guest` | session | observe one specific session |

### CASL setup

```ts
// server/src/permissions/ability.ts
import { AbilityBuilder, createMongoAbility } from '@casl/ability'

export function buildAbility(user: User, membership: WorkspaceMember) {
  const { can, cannot, build } = new AbilityBuilder(createMongoAbility)

  if (user.platformRole === 'admin') {
    can('manage', 'all')
  } else if (membership.role === 'workspace_admin') {
    can('manage', 'Workspace', { id: membership.workspaceId })
    can('manage', 'Session',   { workspaceId: membership.workspaceId })
  } else if (membership.role === 'developer') {
    can('read',   'Workspace', { id: membership.workspaceId })
    can('create', 'Session',   { workspaceId: membership.workspaceId })
    can('write',  'Session',   { ownerId: user.id })
  } else {
    can('read', 'Session', { workspaceId: membership.workspaceId })
  }

  return build()
}
```

Middleware: resolve ability for every authenticated request, attach to `req.ability`.

---

# Stage 8 — Claude Code Provider

> Goal: second provider implementation using the Claude Code CLI.

**Duration estimate:** 1–2 weeks

### Packages

| Package | Layer | Purpose |
|---|---|---|
| `execa` | server | Spawn CLI processes reliably (replaces raw `child_process`) |

### Implementation

```
server/src/providers/claude/
  index.ts        ← ClaudeProvider implements Provider
  session.ts      ← ClaudeSession wraps claude CLI subprocess
```

Claude Code CLI uses stdin/stdout streaming similar to Copilot ACP.  
Wrap with `execa` and adapt events to `ProviderSession`.

Register in `index.ts`:

```ts
if (await claudeProvider.isAvailable()) {
  registry.register(claudeProvider)
}
```

---

# Stage 9 — Self-Hosted Providers (Ollama / LM Studio)

> Goal: support local model inference without any cloud dependency.

**Duration estimate:** 2 weeks

### Packages

| Package | Layer | Purpose |
|---|---|---|
| `ollama` | server | Official Ollama JS client |
| `openai` | server | LM Studio exposes OpenAI-compatible API |

### Ollama provider

```ts
import { Ollama } from 'ollama'

export class OllamaProvider implements Provider {
  readonly id = 'ollama'
  private client = new Ollama({ host: config.OLLAMA_HOST })

  async createSession(opts) {
    return new OllamaSession(this.client, opts)
  }

  async isAvailable() {
    try { await this.client.list(); return true }
    catch { return false }
  }
}
```

### LM Studio provider

LM Studio runs a local OpenAI-compatible server on `http://localhost:1234`.

```ts
import OpenAI from 'openai'

export class LMStudioProvider implements Provider {
  readonly id = 'lmstudio'
  private client = new OpenAI({ baseURL: 'http://localhost:1234/v1', apiKey: 'lm-studio' })
  // ...
}
```

---

# Stage 10 — Administration Dashboard

> Goal: web UI for platform admins to manage users, sessions, providers, and audit logs.

**Duration estimate:** 3 weeks

### Packages

| Package | Layer | Purpose |
|---|---|---|
| `shadcn/ui` | web | Headless component library |
| `tailwindcss` | web | Utility CSS (replaces Primer CSS partially) |
| `recharts` | web | Charts for admin dashboard |
| `react-hook-form` | web | Form state management |

### Admin routes

```
/admin                    → dashboard (sessions/users/provider health)
/admin/users              → user management
/admin/sessions           → all sessions across workspaces
/admin/providers          → provider health + configuration
/admin/audit              → audit log viewer
/admin/settings           → platform configuration
```

### Backend

New router: `server/src/routes/admin.ts`  
All routes guarded by `admin` CASL ability check.

Audit log table:

```ts
export const auditEvents = pgTable('audit_events', {
  id:         uuid().primaryKey().defaultRandom(),
  userId:     uuid().references(() => users.id),
  action:     text().notNull(),    // 'session.create', 'user.delete', ...
  resource:   text().notNull(),
  resourceId: text(),
  metadata:   jsonb(),
  createdAt:  timestamp().defaultNow(),
})
```

---

# Dependency Graph

```
Stage 1  Foundation Hardening
    │
    ▼
Stage 2  Database & Persistence
    │
    ▼
Stage 3  Authentication
    │
    ▼
Stage 4  Workspace & User Management
    │
    ├──────────────────────┐
    ▼                      ▼
Stage 5                Stage 6
Provider Abstraction   Real-time Collaboration
    │                      │
    ├──────────────────────┤
    ▼                      ▼
Stage 7  RBAC & Permissions
    │
    ├──────────────────────┬────────────────────────┐
    ▼                      ▼                        ▼
Stage 8              Stage 9                  Stage 10
Claude Code        Self-hosted AI           Admin Dashboard
```

---

# Package Summary

## Server (`server/package.json`)

| Package | Stage | Category |
|---|---|---|
| `zod` | 1 | Validation |
| `pino` | 1 | Logging |
| `dotenv` | 1 | Config |
| `drizzle-orm` | 2 | ORM |
| `drizzle-kit` | 2 | Dev tooling |
| `postgres` | 2 | DB client (prod) |
| `better-sqlite3` | 2 | DB client (dev) |
| `argon2` | 3 | Password hashing (local accounts) |
| `jose` | 3 | JWT sign / verify |
| `ldapts` | 3 | LDAP client (optional) |
| `nanoid` | 4 | ID generation |
| `socket.io` | 6 | Real-time rooms |
| `@casl/ability` | 7 | Permissions |
| `execa` | 8 | Process spawning |
| `ollama` | 9 | Ollama client |
| `openai` | 9 | LM Studio / OpenAI client |

## Web (`web/package.json`)

| Package | Stage | Category |
|---|---|---|
| `zod` | 1 | Validation |
| `react-router-dom` | 4 | Routing |
| `@tanstack/react-query` | 4 | Server state |
| `zustand` | 4 | UI state |
| `socket.io-client` | 6 | Real-time |
| `@casl/ability` | 7 | Client-side permission checks |
| `tailwindcss` | 10 | Styling |
| `shadcn/ui` | 10 | Component library |
| `react-hook-form` | 10 | Forms |
| `recharts` | 10 | Charts |

---

# Environment Variables Reference

```bash
# Core
PORT=3000
NODE_ENV=development

# Database
DATABASE_URL=postgres://user:pass@localhost:5432/radcollab
# For dev: DATABASE_URL=file:./dev.db

# Platform auth
SESSION_SECRET=<64-byte-random-hex>      # required

# LDAP — all optional; omit entirely to use local accounts
LDAP_URL=ldap://ldap.example.com:389
LDAP_BIND_DN=uid={username},ou=people,dc=example,dc=com
LDAP_BASE_DN=ou=people,dc=example,dc=com
LDAP_TLS=true

# Providers (platform auth is unrelated to these)
# Copilot CLI: no env vars — auth is managed by `copilot auth login` on the host
OLLAMA_HOST=http://localhost:11434       # Stage 9
LMSTUDIO_HOST=http://localhost:1234      # Stage 9
```

---

# Copilot CLI Provider — Preserving What Exists

The existing `acp-manager.ts` is **not rewritten** at any stage.

It is wrapped in Stage 5 by `server/src/providers/copilot/index.ts`.

```
Existing code               New wrapper
────────────────            ─────────────────────────
AcpManager          →  adapted by  →  CopilotProvider
  spawns copilot CLI                   implements Provider
  emits stream events                  exposes ProviderSession
  handles turns                        used by ProviderRegistry
```

This means Copilot CLI support remains fully functional throughout all stages and is never at risk during provider abstraction work.
