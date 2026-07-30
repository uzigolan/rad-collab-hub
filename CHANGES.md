# Changes from Upstream

## Origin & Credits

RAD Collaboration Hub is based on **[copilot-remote](https://github.com/kubestellar/copilot-remote)** by the [KubeStellar](https://github.com/kubestellar) community.

> The original project provides a brilliant foundation: a PWA for remotely controlling GitHub Copilot CLI and Claude Code sessions over WebSocket, with ACP streaming, tiled xterm.js terminals, a todo queue dispatcher, and swarm P2P sharing.

**Original repository:** https://github.com/kubestellar/copilot-remote  
**License:** Apache 2.0 (unchanged — see [LICENSE](LICENSE))  
**Upstream tracking branch:** `upstream/main`

---

## Why a Rename Instead of a Fork

This repository was not created as a GitHub fork because the project direction diverges significantly from the original scope. `copilot-remote` is a single-user local tool; `rad-collab-hub` is being built into a multi-user collaborative platform with authentication, workspaces, and multi-provider support. Maintaining a GitHub fork relationship would imply intent to contribute changes back upstream, which is not appropriate for this level of architectural divergence.

The upstream remote is preserved (`git remote add upstream https://github.com/kubestellar/copilot-remote.git`) to allow cherry-picking bug fixes and improvements from the original project.

---

## Changes Made in This Repository

### Documentation added

| File | Description |
|---|---|
| `docs/architecture.md` | Vision and architecture document for the RAD Collaboration Hub platform |
| `docs/implementation-stages.md` | 10-stage implementation plan with package choices, code sketches, and design rationale |
| `CHANGES.md` | This file |

---

### Bug fixes for Windows compatibility

#### `server/package.json` — removed macOS-only `postinstall` script

**Original:**
```json
"postinstall": "chmod +x ../node_modules/node-pty/prebuilds/darwin-*/spawn-helper 2>/dev/null || true"
```

**Changed to:** removed entirely.

The `chmod` command and `|| true` shell syntax are bash-only and fail on Windows with `npm error 'true' is not recognized`. The script only sets execute permissions on a macOS spawn-helper binary — it has no effect or purpose on Windows.

---

#### `server/src/acp-manager.ts` — Windows HOME path + `--no-skills` flag

**Original:**
```ts
const proc = spawn(copilotPath, ['--acp', '--allow-all'], {
  cwd: process.env.HOME || '/',
  ...
})
```

**Changed to:**
```ts
const loadSkills = process.env.COPILOT_LOAD_SKILLS === 'true'
const acpArgs = loadSkills
  ? ['--acp', '--allow-all']
  : ['--acp', '--allow-all', '--no-skills']

const proc = spawn(copilotPath, acpArgs, {
  cwd: process.env.HOME || process.env.USERPROFILE || '/',
  ...
})
```

Two fixes:
1. `process.env.HOME` is undefined on Windows — added `process.env.USERPROFILE` fallback so the working directory resolves correctly.
2. Added `--no-skills` by default. Skills stored in `~/.copilot/skills/` (e.g. domain-specific RAD network device skills) are loaded automatically by the ACP server and can instruct Copilot to look for MCP tools that are not connected, causing degraded partial responses. `--no-skills` restores Copilot's default behaviour. Set `COPILOT_LOAD_SKILLS=true` in the environment to re-enable skills when the relevant MCP servers are running.

---

#### `server/src/session-manager.ts` — Windows HOME path + `--no-skills` flag

Same two fixes as `acp-manager.ts` applied to the session spawn path.

---

### Feature: markdown table rendering in chat

#### `web/src/components/MessageBubble.tsx` — `remark-gfm` plugin + table CSS

**Original:** `ReactMarkdown` rendered basic markdown only. Tables from AI responses appeared as a single line of pipe-separated raw text.

**Changed:**
- Added `remark-gfm` plugin (`react-markdown`'s GitHub Flavored Markdown extension) to parse tables, strikethrough, and task lists.
- Added table CSS rules to the `sx` prop: `border-collapse`, `th`/`td` borders, header background, alternating row colour.

```tsx
// Before
<ReactMarkdown>{message.content}</ReactMarkdown>

// After
import remarkGfm from 'remark-gfm'
<ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
```

#### `web/package.json` — new dependency

```json
"remark-gfm": "^4.x"
```

---

## Upstream Sync

To pull fixes from the original `copilot-remote` repo into this project:

```bash
git fetch upstream
git merge upstream/main --no-ff -m "chore: merge upstream copilot-remote fixes"
```

Conflicts (if any) will be in the files listed above — resolve by keeping the changes documented here.
