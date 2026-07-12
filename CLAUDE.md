# Project Instructions

> **⚠️ This repo IS the metaswarm plugin source — a personal fork, not an app that uses metaswarm.**
> You are here to **develop the plugin**, not to build features with it. **Read
> [`FORK-CONTEXT.md`](FORK-CONTEXT.md) and [`CUSTOMIZATIONS.md`](CUSTOMIZATIONS.md) first.**
>
> Consequences for working here:
> - Customizations are **git commits on branch `custom`**; changes to *served* plugin content
>   (`skills/`, `commands/`, `rubrics/`, `agents/`, `templates/`, …) require the **`0.12.0-fork.N`
>   version bump + `sync-resources` + refresh** sequence (see CUSTOMIZATIONS.md § Version & Refresh).
> - **Verification for this repo** is `node lib/sync-resources.js --check`, the `/status`
>   diagnostic, and the local plugin-testing steps in `CONTRIBUTING.md` — **not** `npm test`
>   (there is no test script) and **not** the TDD/100%-coverage gate below.
> - **Everything below the "Adopter-facing reference" divider is exactly that** — it documents
>   the workflow this plugin *provides to projects that adopt it* (the mandatory gates, TDD,
>   coverage, `/start-task`, etc. all target *adopter* repos). It is retained so you know what
>   you're maintaining; it is **not** the rule set for editing the plugin itself.

This plugin is [metaswarm](https://github.com/dsifry/metaswarm), a multi-agent orchestration framework for Claude Code. It provides 18 specialized agents, a 9-phase development workflow, and quality gates that enforce TDD, coverage thresholds, and spec-driven development **in the projects that install it**.

---

# Adopter-facing reference

*The sections below describe how an **adopter project** uses metaswarm. They are reference for
what this plugin provides — not the workflow for editing the plugin source. See the banner above
and [`FORK-CONTEXT.md`](FORK-CONTEXT.md) for how to actually work in this repo.*

## How to Work in This Project

### Starting work

```text
/start-task
```

This is the default entry point. It primes the agent with relevant knowledge, guides you through scoping, and picks the right level of process for the task.

### For complex features (multi-file, spec-driven)

Describe what you want built, include a Definition of Done, and ask for the full workflow:

```text
I want you to build [description]. [Tech stack, DoD items, file scope.]
Use the full metaswarm orchestration workflow.
```

This triggers the full pipeline: Research → Plan → Design Review Gate → Work Unit Decomposition → Orchestrated Execution (4-phase loop per unit) → Final Review → PR.

### Available Commands

| Command | Purpose |
|---|---|
| `/start-task` | Begin tracked work on a task |
| `/prime` | Load relevant knowledge before starting |
| `/review-design` | Trigger parallel design review gate (5 agents) |
| `/pr-shepherd <pr>` | Monitor a PR through to merge |
| `/self-reflect` | Extract learnings after a PR merge |
| `/handoff` | Write a self-contained handoff doc so a fresh agent can resume the work |
| `/handle-pr-comments` | Handle PR review comments |
| `/brainstorm` | Refine an idea before implementation |
| `/create-issue` | Create a well-structured GitHub Issue |
| `/external-tools-health` | Check status of external AI tools (Codex, Gemini) |
| `/setup` | Interactive guided setup — detects project, configures metaswarm |
| `/update` | Update metaswarm to latest version |
| `/status` | Run diagnostic checks on your installation |
| `/start` | Alias for `/start-task` |

### Visual Review

Use the `visual-review` skill to take screenshots of web pages, presentations, or UIs for visual inspection. Requires Playwright (`npx playwright install chromium`). See `skills/visual-review/SKILL.md`.

## Testing

- **TDD is mandatory** — Write tests first, watch them fail, then implement
- **100% test coverage required** — Lines, branches, functions, and statements. Enforced via `.coverage-thresholds.json` as a blocking gate before PR creation and task completion
<!-- TODO: Update these commands for your project's test runner -->
- Test command: `npm test`
- Coverage command: `npm run test:coverage`

## Coverage

Coverage thresholds are defined in `.coverage-thresholds.json` — this is the **source of truth** for coverage requirements.
If a GitHub Issue specifies different coverage requirements, update `.coverage-thresholds.json` to match before implementation begins. Do not silently use a different threshold.

The validation phase of orchestrated execution reads `.coverage-thresholds.json` and runs the enforcement command. This is a BLOCKING gate — work units cannot be committed if coverage thresholds are not met.

## Quality Gates

- **Design Review Gate**: Parallel 5-agent review after design is drafted (`/review-design`)
- **Plan Review Gate**: Automatic adversarial review after any implementation plan is drafted. Spawns 3 independent reviewers (Feasibility, Completeness, Scope & Alignment) in parallel — ALL must PASS before the plan is presented to the user. See `skills/plan-review-gate/SKILL.md`
- **Coverage Gate**: Reads `.coverage-thresholds.json` and runs the enforcement command — BLOCKING gate before PR creation

## Workflow Enforcement (what the plugin ships to adopters)

metaswarm's mandatory pipeline — design-review-gate after brainstorming, plan-review-gate
after any plan, execution-method choice, `/start-task` over `EnterPlanMode`, coverage
source-of-truth, subagent discipline, pre-PR knowledge capture, `.beads/` context recovery —
is what this plugin **injects into adopter projects' CLAUDE.md** at `/setup`. The canonical,
maintained copy of those rules lives in **`templates/CLAUDE.md`** (+ `templates/CLAUDE-append.md`,
and the platform variants under `skills/setup/templates/`). Edit them there.

**These enforcement rules are NOT the workflow for editing this plugin.** Developing the plugin
source does not route through design/plan-review gates or a coverage gate. Your actual working
rules for this repo are the banner at the top of this file plus [`FORK-CONTEXT.md`](FORK-CONTEXT.md)
and [`CUSTOMIZATIONS.md`](CUSTOMIZATIONS.md). (This section previously duplicated the full
adopter enforcement text as imperative "MANDATORY / STOP" instructions, which mis-directed
plugin-dev sessions; it now points at the canonical template instead.)

## External Tools (Optional)

If external AI tools are configured (`.metaswarm/external-tools.yaml`), the orchestrator
can delegate implementation and review tasks to Codex CLI and Gemini CLI for cost savings
and cross-model adversarial review. See `templates/external-tools-setup.md` for setup.

## Team Mode

When `TeamCreate` and `SendMessage` tools are available, the orchestrator uses Team Mode for parallel agent dispatch. Otherwise it falls back to Task Mode (the existing workflow, unchanged). See `guides/agent-coordination.md` for details.

## Guides

Development patterns and standards are documented in `guides/`:
- `agent-coordination.md` — Team Mode vs Task Mode, agent dispatch patterns
- `build-validation.md` — Build and validation workflow
- `coding-standards.md` — Code style and conventions
- `git-workflow.md` — Branching, commits, and PR conventions
- `testing-patterns.md` — TDD patterns and coverage enforcement
- `worktree-development.md` — Git worktree-based parallel development

## Code Quality

<!-- TODO: Update these for your project's language and tools -->
- TypeScript strict mode, no `any` types
- ESLint + Prettier
- All quality gates must pass before PR creation

## Key Decisions

<!-- Document important architectural decisions here so agents have context.
     These get loaded during knowledge priming (/prime).
     Use `bd decision` to record decisions persistently in the beads database
     with rationale tracking — these survive compaction and are available across sessions. -->

## Notes

<!-- Add project-specific notes, conventions, or constraints here.
     Examples: "Always use server components for data fetching",
     "The payments module is legacy — do not refactor without approval" -->
