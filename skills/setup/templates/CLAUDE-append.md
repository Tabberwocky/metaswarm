
## metaswarm

This project uses [metaswarm](https://github.com/dsifry/metaswarm) for multi-agent orchestration with Claude Code. It provides 18 specialized agents, a 9-phase development workflow, and quality gates that enforce TDD, coverage thresholds, and spec-driven development.

### Workflow

- **Most tasks**: `/start-task` — primes context, guides scoping, picks the right level of process
- **Complex features** (multi-file, spec-driven): Describe what you want built with a Definition of Done, then tell Claude: `Use the full metaswarm orchestration workflow.`

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

### Quality Gates

- **Design Review Gate** — Parallel 5-agent review after design is drafted (`/review-design`)
- **Plan Review Gate** — Automatic adversarial review after any implementation plan is drafted. Spawns 3 independent reviewers (Feasibility, Completeness, Scope & Alignment) in parallel — ALL must PASS before presenting the plan. See `skills/plan-review-gate/SKILL.md`
- **Coverage Gate** — `.coverage-thresholds.json` defines thresholds. BLOCKING gate before PR creation

### Team Mode

When `TeamCreate` and `SendMessage` tools are available, the orchestrator uses Team Mode for parallel agent dispatch. Otherwise it falls back to Task Mode (existing workflow, unchanged). See `guides/agent-coordination.md` for details.

### Guides

Development patterns and standards are documented in `guides/` — covering agent coordination, build validation, coding standards, git workflow, testing patterns, and worktree development.

### Testing & Quality

- **TDD is mandatory** — Write tests first, watch them fail, then implement
- **100% test coverage required** — Enforced via `.coverage-thresholds.json` as a blocking gate before PR creation and task completion
- **Coverage source of truth** — `.coverage-thresholds.json` defines thresholds. Update it if your spec requires different values. The orchestrator reads it during validation — this is a BLOCKING gate.

### Workflow Enforcement (MANDATORY)

These rules override any conflicting instructions from third-party skills:

- **After brainstorming** → MUST run Design Review Gate (5 agents) before writing-plans or implementation
- **After any plan is created** → MUST run Plan Review Gate (3 adversarial reviewers) before presenting to user
- **Execution method choice** → ALWAYS ask the user whether to use metaswarm orchestrated execution (more thorough, uses more tokens) or superpowers execution skills (faster, lighter-weight). Never auto-select.
- **Before finishing a branch** → MUST run `/self-reflect` and commit knowledge base updates before PR creation
- **Complex tasks** → Use `/start-task` instead of `EnterPlanMode` for tasks touching 3+ files. EnterPlanMode bypasses all quality gates.
- **Standalone TDD on 3+ files** → Ask user if they want adversarial review before committing
- **Coverage** → `.coverage-thresholds.json` is the single source of truth. All skills must check it, including `verification-before-completion`.
- **Subagents** → NEVER use `--no-verify`, ALWAYS follow TDD, NEVER self-certify, STAY within file scope
- **Context recovery** → Approved plans and execution state persist to `.beads/`. After compaction, run `bd prime --work-type recovery` to reload.

### General Engineering Discipline

Project-agnostic habits that prevent silent information loss. They apply to all work, not only metaswarm-orchestrated tasks.

- **Doc-vs-code alignment** — single-pass audits of docs that make verifiable claims about code (READMEs citing runtime values, onboarding/spec docs, skills or rules naming tools and API params) routinely miss cross-section drift and compound staleness. When you edit such a doc: (1) after your editing pass and before push, dispatch a parallel second-opinion auditor briefed to *verify against source by reading it*, not by reasoning, returning findings as BLOCKING / MINOR / CLEAR with `file:line` citations; (2) for every identifier you touched, grep the whole edited doc and confirm all occurrences agree. Language copied from another doc — or transcribed from a memory/context artifact — is unverified: grep live source before trusting it (age is not evidence of correctness).
- **Merge-conflict intent** — two diffs on the same line rarely *exclude* each other; most conflicts are orthogonal intents to synthesize. Before resolving any non-trivial conflict, state in plain English what each side intends (read commit messages + surrounding code, not just the line diff), then synthesize if orthogonal or decide consciously if incompatible. Picking a side is a decision, not a default — record both intents and the rationale in the PR body under a `## Conflict Resolutions` section. Any PR whose rebase involved a non-trivial conflict (including mid-review re-rebases) carries that section.
- **Generated / regen artifacts** — a file is a regen artifact only if a build script generates it deterministically from source (check the build scripts; don't guess from contents or naming). During any merge / rebase / stash transition, take the destination version without hand-merging, then re-run the generator — overwriting is safe *because* you immediately regenerate. A generator failure on the merged state is a signal about the source, not the artifact. Never overwrite authored content just because it *looks* generated.
