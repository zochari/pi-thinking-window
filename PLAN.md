# Plan: Make `thinking-window` an installable Pi extension

## 1. How Pi extensions are created & published

There is **no `pi` CLI scaffolder** (no `pi new`/`pi create`). But there is a
de-facto starter template repo:

- **[`S1M0N38/pi-package-template`](https://github.com/S1M0N38/pi-package-template)**
  — a minimal, MIT-licensed starter for pi packages. It ships the convention
  directories (`extensions/`, `skills/`, `prompts/`, `themes/`), a complete
  `package.json` with the `pi` manifest, `tsconfig.json`, `.gitignore`,
  `LICENSE`, `CHANGELOG.md`, and two GitHub Actions workflows (`ci.yml`
  typecheck/lint + `release.yml` release-please → npm publish). It uses the
  **current** `@earendil-works/pi-coding-agent` scope (matches installed 0.80.6),
  unlike older `@mariozechner/*` examples.

  ```bash
  git clone https://github.com/S1M0N38/pi-package-template.git my-pi-package
  cd my-pi-package && npm install   # dev deps for type-checking only
  pi -e .                            # test-load without installing
  npm publish                       # → pi install npm:<name>
  ```

Use that template as the **base**, then drop `thinking-window` in. (There is no
equivalent template inside the installed pi source itself — `examples/extensions/`
in the pi repo is example code, not a scaffold.)

### Distribution channels (users run one of these)

| Channel | Publish | Install |
|---|---|---|
| **npm** (recommended) | `npm publish --access public` | `pi install npm:pi-thinking-window` |
| **git** (free alt) | push repo + tag `v0.1.0` | `pi install git:github.com/<user>/pi-thinking-window@v0.1.0` |
| **local** (test) | — | `pi install ./` (adds path to settings, no copy) |

Core packages (`@earendil-works/pi-*`, `typebox`) go in `peerDependencies`
with `"*"` and are **never bundled** — Pi supplies them at runtime. No build
step (jiti loads `.ts` directly).

---

## 2. Current state of `thinking-window`

- Source: `/volume2/workspace/pi/extensions/thinking-window/` — 5 `.ts` files:
  `index.ts`, `config.ts`, `state.ts`, `thinking-window.ts`, `internal-patch.ts`.
- Currently loaded only via the local `pi-local-extensions` package (symlink
  `~/.pi/agent/local-extensions` → `/volume2/workspace/pi/extensions`, manifest
  glob `"./*/"`). Not standalone/installable.
- `/volume2/workspace/pi-thinking-window/` is an empty git repo — the target.

### Packaging-critical facts

1. **No build step.** ESM TypeScript, loaded by jiti. `.ts` import specifiers
   (`import "./internal-patch.ts"`) resolve fine (same pattern pi-autoname uses).
2. **Imports of bundled core packages** (must be `peerDependencies` `"*"`, not bundled):
   - `@earendil-works/pi-tui` — runtime in `thinking-window.ts` & `internal-patch.ts`.
   - `@earendil-works/pi-coding-agent` — type-only in `index.ts`; `internal-patch.ts`
     resolves its `dist/...` internals at runtime via `import.meta.resolve`.
   - `typebox` — **not used**; omit.
3. **`internal-patch.ts` monkey-patches `AssistantMessageComponent.prototype.updateContent`**
   from `dist/modes/interactive/components/assistant-message.js`. Pi-internal and
   **version-sensitive** (built against Pi 0.80.6). Already degrades gracefully to
   native rendering if internals drift. → Document tested Pi version in README.
4. **Config self-bootstrap** (`config.ts`) writes a `thinkingWindow` block into
   `~/.pi/agent/settings.json`. Works unchanged (global config, not project-local).

### ⚠️ Auto-discovery layout pitfall
The template's `pi.extensions: ["./extensions"]` auto-loads **every** top-level
`.ts` in `extensions/` AND every `extensions/*/index.ts`. So the helper modules
(`config.ts`, `state.ts`, …) must **not** sit as bare `.ts` files in
`extensions/`. Put them in a subdirectory: `extensions/thinking-window/{index.ts,
config.ts, state.ts, thinking-window.ts, internal-patch.ts}`. Then only
`extensions/thinking-window/index.ts` is discovered as the one extension entry.

---

## 3. Implementation steps (template-based)

### Step 1 — Seed the repo from the template
```bash
cd /volume2/workspace/pi-thinking-window
git remote add origin https://github.com/S1M0N38/pi-package-template.git   # fetch only
git fetch origin
git checkout origin/main -- .            # bring in template files
# OR: git clone into a temp dir and copy contents in. Then set your own remote.
```
Remove the sample content we won't use:
- `extensions/index.ts` (the sample extension) — delete.
- `skills/`, `prompts/`, `themes/` — delete (or keep empty; remove from manifest).
- Keep `LICENSE` (MIT), `tsconfig.json`, `.gitignore`, `.github/`, `README.md`,
  `CHANGELOG.md`.

### Step 2 — Add `thinking-window` source in the correct layout
```bash
mkdir -p extensions/thinking-window
cp /volume2/workspace/pi/extensions/thinking-window/*.ts extensions/thinking-window/
```
The flat `.ts` files keep their relative imports (`"./internal-patch.ts"`, etc.),
which resolve inside the subdirectory. `extensions/thinking-window/index.ts`
becomes the single discovered entry.

### Step 3 — Edit `package.json`
Start from the template's manifest and adjust:
```json
{
  "name": "pi-thinking-window",
  "version": "0.1.0",
  "description": "Render Pi's model thinking stream in a fixed-height sliding-window box (TUI).",
  "type": "module",
  "license": "MIT",
  "author": "<your-handle>",
  "keywords": ["pi-package", "pi", "thinking", "tui", "extension"],
  "repository": { "type": "git", "url": "git+https://github.com/<user>/pi-thinking-window.git" },
  "files": ["extensions", "README.md", "CHANGELOG.md", "LICENSE", "!.github"],
  "publishConfig": { "access": "public" },
  "pi": { "extensions": ["./extensions"] },
  "peerDependencies": {
    "@earendil-works/pi-coding-agent": "*",
    "@earendil-works/pi-tui": "*"
  },
  "devDependencies": {
    "@earendil-works/pi-coding-agent": "^0.80.6",
    "@earendil-works/pi-tui": "^0.80.6",
    "@biomejs/biome": "^2.4.14",
    "typescript": "^5.0.0"
  }
}
```
- `pi.extensions: ["./extensions"]` → loads `extensions/thinking-window/index.ts`.
- Trim `peerDependencies` to what we import (`pi-coding-agent`, `pi-tui`); drop
  unused `pi-ai`/`pi-agent-core`/`typebox` (template includes them by default).
- Bump `devDependencies` to `^0.80.6` so type-checking matches installed Pi.
- `files` includes `extensions` (the code) + docs; `!.github` keeps CI out of tarball.

### Step 4 — Local test (before publishing)
```bash
pi -e .                 # ephemeral load test
pi install ./           # full install (path added to settings.json)
```
Verify: `/thinking-window` shows status; `/thinking-window 20` resizes; `/thinking-window
toggle` flips it; loads clean; and on an incompatible Pi it degrades to native
rendering with a warning rather than crashing. Optionally `npm run typecheck`.

### Step 5 — Publish (pick a channel)
**Recommended — npm**, using the template's release flow:
- One-time: add `NPM_TOKEN` repo secret, enable Actions PR creation (see
  template README). Write conventional commits; release-please opens a Release
  PR → merge → auto-publishes to npm.
- Or manual: `npm login && npm publish --access public`.
- Users: `pi install npm:pi-thinking-window`. The `pi-package` keyword lists it
  on the [pi.dev gallery](https://pi.dev/packages).

**Alternative — git**: push repo, tag `v0.1.0`; users run
`pi install git:github.com/<user>/pi-thinking-window@v0.1.0`.

### Step 6 — Post-publish verification
From a clean env (after removing the local install): `pi install npm:pi-thinking-window`,
restart Pi, confirm the thinking box renders and `/thinking-window toggle` works.
Add a README compatibility note: tested on Pi 0.80.6; patches internals and may
need a refresh on major Pi upgrades.

---

## 4. Risks & open decisions

- **Internal-patch fragility (main risk).** Patches Pi's `AssistantMessageComponent`
  internals; a Pi upgrade can break rendering. Mitigation already in place
  (graceful fallback). Action: document tested Pi version; keep the load-time
  warning when the expected `dist` path is missing/changed.
- **Distribution channel & name.** npm (recommended; needs an npm account + free
  name or a scope like `@<you>/pi-thinking-window`) vs git (free, less discoverable).
  Only Step 5 differs.
- **Global vs project config.** `config.ts` writes global `~/.pi/agent/settings.json`.
  Fine and intentional (auto-materializes defaults); state it in the README.
- **Release automation.** The template's release-please flow is optional polish;
  `npm publish` by hand works too. Adopt the `.github/` workflows only if you want
  automated versioning + CI.

## 5. Suggested next action
Seed the repo from `S1M0N38/pi-package-template` (Step 1–2), adjust `package.json`
(Step 3), and run the local test (Step 4). Then confirm channel + name before
publishing (Step 5). I can scaffold the files now, or wait for your channel/name
choice.
