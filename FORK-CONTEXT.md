# FORK-CONTEXT — read this first

**You are in the source tree of a personal *fork* of metaswarm.** This repo *is* the
metaswarm plugin; you are here to **develop the plugin**, not to use it to build an app.
If a doc in this repo reads like "how to build features with metaswarm" (TDD, coverage
gates, `npm test`, a product tech stack), that is **adopter-facing** content describing
what the plugin gives *other* projects — it does not describe how to change the plugin
itself. This file exists to prevent that confusion and to surface the context that a
session rooted here will **not** load automatically.

---

## 60-second mental model

- **What this is:** a vendor-branch fork of `dsifry/metaswarm`. Upstream code sits under
  the fork; every local customization is a **git commit on branch `custom`**. That is the
  whole point of the fork — `claude plugin update` can no longer silently clobber changes,
  because the changes *are* the served source.
- **origin** → `Tabberwocky/metaswarm` · **upstream** → `dsifry/metaswarm` · based on tag
  `v0.12.0` · working branch **`custom`** · clone at `~/Coding/metaswarm-fork`.
- **How it reaches Claude:** a **local-directory marketplace** `metaswarm-fork-marketplace`
  (registered in `~/.claude/plugins/known_marketplaces.json`, `source.source = "directory"`,
  `source.path = "~/Coding/metaswarm-fork"`). Same pattern as the beads plugin fork
  (`~/Coding/beads-plugin-source`).
- **The one gotcha that bites everyone:** a directory-source install still copies into a
  **version-keyed cache**. `claude plugin update` is a **no-op if the version string is
  unchanged**, so the served copy goes stale. Any change to served plugin content
  (skills/commands/rubrics/agents/templates) **must bump `0.12.0-fork.N` across all 5
  version files** and run the refresh sequence. Full rules live in `CUSTOMIZATIONS.md`
  § "Version & Refresh Discipline" — do not re-derive them, follow them.

## Which doc is authoritative for what

| Doc | Owns |
|---|---|
| **FORK-CONTEXT.md** (this file) | First-read orientation; the config-side context that won't auto-load |
| **CUSTOMIZATIONS.md** | The canonical catalog of every divergence from upstream + the version/refresh/sync/upstream-merge discipline. **The source of truth.** |
| **CLAUDE.md** | Working rules for a session in this repo (adopter-pipeline content is labeled as reference) |
| `CONTRIBUTING.md` | How to test the plugin locally after a change |

When CUSTOMIZATIONS.md and any other doc disagree about a customization or the refresh
procedure, **CUSTOMIZATIONS.md wins** — update the other doc.

## Config-side context that a session here does NOT auto-load

A Claude Code session rooted in `~/Coding/metaswarm-fork` loads the **global**
`~/.claude/CLAUDE.md` and the user-level skills — but it gets its **own project-memory
namespace** (`~/.claude/projects/-Users-ericdavis-Coding-metaswarm-fork/`). So the richest
"why + how" notes, which live under a *different* project's memory, are **invisible here
unless you open them explicitly**:

- **`~/.claude/projects/-Users-ericdavis--claude/memory/reference_metaswarm_fork_marketplace.md`**
  — the definitive record of the fork mechanism, the version-bump refresh discipline, the
  `sync-resources.js` behavior, the upstream-sync procedure, and the **Codex bridge coupling**
  (`~/.codex/metaswarm-bridge/sync.sh` must be re-run after every version bump; known gap:
  the D calibration rubric doesn't flow through to the Codex materialization).
- **`~/.claude/plugin-patches.md`** § `## metaswarm` — *historical only.* These 16 patches
  were the fork's genesis; each is now a commit on `custom` and is catalogued in
  CUSTOMIZATIONS.md. It is marked **SUPERSEDED** — read it for the original rationale of a
  given customization, but **never re-apply it to a plugin cache.**
- **`fork-update-check` skill** (`~/.claude/skills/fork-update-check/`) — the automation for
  syncing upstream. Run `node ~/.claude/skills/fork-update-check/check.mjs metaswarm` to
  classify what upstream changed vs. what you customized. Config for this fork lives in that
  skill's `forks.json` (version files, pre-commit check, post-refresh commands).
- **`~/.claude/plugins/known_marketplaces.json`** — the marketplace registration that wires
  this directory in as the served source.

If you need the full "why we forked" narrative and don't have it in context, read the
memory file above first, then `CUSTOMIZATIONS.md`.

## Before you change anything

1. **Is it served plugin content** (`skills/`, `commands/`, `rubrics/`, `agents/`,
   `templates/`, `knowledge/`, `hooks/`, `bin/`, `scripts/`, `cli/`, `lib/`)? Then the
   version-bump + `sync-resources` + refresh sequence in CUSTOMIZATIONS.md applies. **Edit
   the canonical source, never a generated co-located copy** — `sync-resources.js` will
   overwrite hand-edits to generated targets.
2. **Is it a root doc** (`CLAUDE.md`, `FORK-CONTEXT.md`, `README.md`, `CUSTOMIZATIONS.md`)?
   These are **not** in `package.json` `files` and are **not** `sync-resources` targets, so
   they don't touch the served cache — no version bump needed. Still run
   `node lib/sync-resources.js --check` afterward to confirm nothing drifted.
3. **Adding a new customization?** Add its entry to CUSTOMIZATIONS.md § "Customizations"
   (commit, files, rationale, upstreamable?) as part of the same change-set.
4. **Verifying a change:** there is no `npm test` in this repo. Verification is
   `node lib/sync-resources.js --check`, the `/status` diagnostic, and the local
   plugin-testing steps in `CONTRIBUTING.md` § "Testing the Plugin".
5. **Git:** commit to `custom`. **Do not push** without explicit authorization — pushing
   updates what every workspace pulls.
