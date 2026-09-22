# Beads - AI-Native Issue Tracking

Welcome to Beads! This repository uses **Beads** for issue tracking - a modern, AI-native tool designed to live directly in your codebase alongside your code.

## What is Beads?

Beads is issue tracking that lives in your repo, making it perfect for AI coding agents and developers who want their issues close to their code. No web UI required - everything works through the CLI and integrates seamlessly with git.

**Learn more:** [github.com/steveyegge/beads](https://github.com/steveyegge/beads)

## BEADS authority (read this first)

> Read the repo's local beads guide before backend-specific sync/storage commands.
>
> Check the backend/location first: bd where --json
>
> If the repo already has a custom BEADS setup, do not use metaswarm's stock BEADS templates, config, or assumptions as a replacement; follow the repo-local/custom setup.

The commands and storage conventions below (e.g. `.beads/issues.jsonl`, `bd dolt pull`/`bd dolt push`, auto-sync-with-commits) are **examples only**, not defaults. A repo may be legacy JSONL, Dolt-backed, or use a repo-specific shared `BEADS_DIR` workflow — confirm with `bd where --json` and the repo-local guide before running any backend-specific operation.

## Quick Start

### Essential Commands

```bash
# Create new issues
bd create "Add user authentication"

# View all issues
bd list

# View issue details
bd show <issue-id>

# Claim and close work
bd update <issue-id> --claim
bd close <issue-id> --reason "Completed"

# If this repo configures a shared Dolt remote:
bd dolt pull
bd dolt push
```

### Working with Issues

Issues in Beads are:

- **Git-native**: Stored in `.beads/issues.jsonl` and synced like code
- **AI-friendly**: CLI-first design works perfectly with AI coding agents
- **Branch-aware**: Issues can follow your branch workflow
- **Always in sync**: Auto-syncs with your commits

## Why Beads?

**AI-Native Design**

- Built specifically for AI-assisted development workflows
- CLI-first interface works seamlessly with AI coding agents
- No context switching to web UIs

**Developer Focused**

- Issues live in your repo, right next to your code
- Works offline; use `bd dolt push` only when a shared remote is configured and your Beads state changed
- Fast, lightweight, and stays out of your way

**Git Integration**

- Automatic sync with git commits
- Branch-aware issue tracking
- Intelligent JSONL merge resolution

## Get Started with Beads

### Install the standalone beads plugin (recommended)

```bash
# Install from the Claude Code marketplace
/plugin install beads    # from steveyegge/beads marketplace
```

The beads plugin (v0.63.3+) automatically handles context priming on SessionStart and PreCompact, provides `bd compact` for semantic summarization, `bd decision` for architectural decision tracking, and ships a `@task-agent` that autonomously finds and completes ready tasks.

### Or install the CLI directly

```bash
curl -sSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh | bash

# Initialize in your repo
bd init

# Create your first issue
bd create "Try out Beads"
```

## Learn More

- **Documentation**: [github.com/steveyegge/beads/docs](https://github.com/steveyegge/beads/tree/main/docs)
- **Marketplace Plugin**: [steveyegge/beads](https://github.com/steveyegge/beads)
- **Quick Start Guide**: Run `bd quickstart`
- **Examples**: [github.com/steveyegge/beads/examples](https://github.com/steveyegge/beads/tree/main/examples)

---

_Beads: Issue tracking that moves at the speed of thought_
