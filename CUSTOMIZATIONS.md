# metaswarm-fork Customizations

## Overview

This is a fork of `dsifry/metaswarm` — hosted at `Tabberwocky/metaswarm` (origin) with `dsifry/metaswarm` as upstream — based on tag `v0.12.0`, customized on branch `custom`.

**Why a fork instead of cache patches:**
`claude plugin update` silently overwrites the plugin cache, making hand-applied cache edits ephemeral. The fork turns every customization into a durable git commit on `custom` that survives any number of plugin updates.

**Marketplace wiring:**
The fork is served via a local-directory marketplace named `metaswarm-fork-marketplace`, registered in `~/.claude/plugins/known_marketplaces.json` with `source.source = "directory"` and `source.path = "~/Coding/metaswarm-fork"`. Codex uses the same local fork as its source: `.agents/plugins/marketplace.json` points the `metaswarm` plugin at `{"source":"local","path":"."}`, and `~/.codex/metaswarm-bridge/sync.sh` materializes active Codex skills from `~/Coding/metaswarm-fork`. This mirrors the beads plugin precedent (which uses `~/Coding/beads-plugin-source` the same way).

---

## Version & Refresh Discipline

**Versioning scheme:** `0.12.0-fork.N` (e.g. `0.12.0-fork.2`).

**5 files must stay in sync** — `node lib/sync-resources.js --check` will fail if they diverge:

- `package.json`
- `.claude-plugin/plugin.json`
- `.codex-plugin/plugin.json`
- `gemini-extension.json`
- `.claude-plugin/marketplace.json`

**Critical gotcha:** A directory-source install still copies into a version-keyed cache directory:

```
~/.claude/plugins/cache/metaswarm-fork-marketplace/metaswarm/<version>/
```

`claude plugin update` is a **no-op** when the version string is unchanged. Every change-set **must** bump `fork.N` to force the cache to refresh from the clone.

**Full refresh sequence:**

1. Edit the clone at `~/Coding/metaswarm-fork`
2. Bump the version string in all 5 files above
3. `node lib/sync-resources.js --sync` (to regenerate co-located copies from canonical sources)
4. `node lib/sync-resources.js --check` (must pass before tagging)
5. `claude plugin marketplace update metaswarm-fork-marketplace`
6. `claude plugin update metaswarm@metaswarm-fork-marketplace`
7. `~/.codex/metaswarm-bridge/sync.sh`
8. Restart Claude Code and restart Codex

---

## sync-resources.js Awareness

`lib/sync-resources.js` generates co-located copies from canonical sources. It runs on **manual invocation only** — never on `claude plugin update`.

**Generated targets:**

- `skills/*/rubrics/*` — synced from root `rubrics/`
- `skills/setup/{templates,knowledge,bin,scripts}/*` — synced from root `templates/`, `knowledge/`, `bin/`, `scripts/`
- `commands/metaswarm/*.toml` — generated from the hardcoded `TOML_COMMAND_MAP` inside the script (NOT derived from the `.md` files)

**Rule:** Always edit the canonical source (or `TOML_COMMAND_MAP` for TOML commands), then run `node lib/sync-resources.js --sync`. Never hand-edit a generated copy — it will be overwritten on the next `--sync`. Run `--check` before tagging or committing to confirm nothing drifted.

---

## Customizations

### A. Codex API Key Empty-Env Bugfix
**Commit:** `2425289` `fix(external-tools): only forward Codex API key env vars when non-empty`
**Files:** `skills/external-tools/adapters/codex.sh`

In both the `implement` and `review` `env -i` invocation blocks, unconditional empty-string forwarding (`OPENAI_API_KEY="${OPENAI_API_KEY:-}"`) was replaced with conditional forwarding (`${OPENAI_API_KEY:+OPENAI_API_KEY="$OPENAI_API_KEY"}`). Empty-string env vars can interfere with browser-auth Codex users' API key path selection.

**Upstreamable: yes** — general correctness fix, no environment-specific assumptions.

---

### B. Event-Driven Monitor Instead of Fixed-Interval Polling
**Commit:** `18d5453` `feat(pr-feedback): event-driven Monitor instead of fixed-interval polling`
**Files:** `skills/pr-shepherd/SKILL.md`, `commands/pr-shepherd.md`, `.claude/commands/pr-shepherd.md`, `skills/handling-pr-comments/SKILL.md`, `commands/handle-pr-comments.md`, `.claude/commands/handle-pr-comments.md`

Replaced every `/loop 5m` / `--watch` / "every 5 minutes" polling pattern with the `Monitor` tool. `Monitor` fires a notification only when the polled state actually changes — quiet CI periods cost 0 tokens. `/loop 5m` fires on a fixed schedule regardless of state and lands exactly on the 5-minute prompt-cache TTL boundary (worst-case for cache hit rate). `gh pr checks --watch` blocks the agent entirely until CI completes. Added the canonical PR-state Monitor script and a "When NOT to use Monitor" carve-out (truly periodic tasks stay on `/loop`).

**Corrected in `0.12.0-fork.5` (see § L):** the original Monitor script treated `mergeStateStatus == "CLEAN"` as `READY_TO_MERGE`, which is wrong — that field reports conflicts and required checks only, never bot-review readiness. It now exits on `CI_COMPLETE` (CI terminal, no merge-readiness claim), and stays armed only while work is genuinely in progress rather than being re-armed indefinitely through Phase 2. A separate, narrower pattern — one silent Monitor per awaited bot round, keyed to that bot's own artifact — now covers waiting on a specific bot's result.

**Upstreamable: yes** — strictly cheaper pattern for all PR-shepherding use cases.

---

### C. Proportional Bot-Comment Triage (Likelihood × Impact)
**Commit:** `2c20d6c` `feat(pr-feedback): proportional bot-comment triage (likelihood x impact)`
**Files:** `skills/handling-pr-comments/SKILL.md` (Phase 2a), `commands/handle-pr-comments.md`, `.claude/commands/handle-pr-comments.md`

Inserted Phase 2a (Proportional Response Assessment) between Phase 2 (Triage) and Phase 2b (Outside Diff Range). The original "fix everything, no exceptions" policy treated all bot feedback equally regardless of likelihood and impact, wasting effort on false positives, theoretical edge cases, and style-only nits. Phase 2a adds a likelihood × impact decision matrix, evidence requirements for pushback, response templates for common false-positive patterns, and bead creation guidance for deferred valuable feedback. Correctness, security, and human comments remain always-fix.

**Upstreamable: yes** — general PR workflow improvement, no repo-specific assumptions.

---

### D. Portable Reviewer-Calibration Rubric
**Commit:** `b15eb43` `feat(review): add portable reviewer-calibration rubric + wire into review gates`
**Files:** `rubrics/reviewer-calibration-rubric.md` (new), wired into design-review-gate, plan-review-gate, orchestrated-execution, external-tools, all rubric files, and command/template files via `--sync`

Added a shared portable blocker/severity contract (`rubrics/reviewer-calibration-rubric.md`) and wired it into every automated review surface. Defines Critical/Major/Minor/Nit/Follow-up/Acceptable-as-is classes, maps Critical/Major to blocking FAIL/NEEDS_REVISION, and enforces scope discipline (only in-scope Critical/Major findings block). Deliberately project-neutral — no product names, domain content, BEADS-only tracking requirements, or repo-local rule-file paths. Those stay in repo-local overlays.

**Upstreamable: conditional** — the rubric itself is upstreamable; the wiring will need conflict resolution since it touches several shared files.

---

### E1. Repo-Local BEADS Setup Is Authoritative
**Commit:** `461d949` `feat(beads): repo-local BEADS setup is authoritative over metaswarm defaults`
**Files:** `skills/handling-pr-comments/SKILL.md` BEADS sections, `commands/start-task.md`, `commands/metaswarm/start-task.toml`, `guides/worktree-development.md`, `templates/`, relevant skill files

When a repo already has BEADS docs, config, sync flow, or storage conventions, those repo-local/custom rules win unconditionally. Metaswarm must not run its stock BEADS setup flow as a replacement, copy its BEADS templates into a repo with a custom setup, assume `.beads/issues.jsonl` or `bd sync`/`bd dolt push` as defaults, or frame its BEADS defaults as authoritative. Every relevant entrypoint now includes an explicit check: read repo-local BEADS guidance first via `bd where --json` before backend-specific operations.

> **Refined by § M (`0.12.0-fork.7`):** the beads templates now show `bd update --claim` and `bd dolt push`, but `bd dolt push` only as a conditional ("if a shared Dolt remote is configured"), under the same "examples only" caveat — still not a default.

**Upstreamable: no** — this is an environment-specific policy for repos that use a custom BEADS setup.

---

### E2. Deferred-Feedback Capture via Bead + Cross-Linked GitHub Issue
**Commit:** `67119a7` `feat(pr-feedback): deferred-feedback capture via bead + cross-linked GitHub issue`
**Files:** `skills/handling-pr-comments/SKILL.md` (Phase 2c CREATE_ISSUE flow)

The CREATE_ISSUE flow in Phase 2c now creates both a GitHub issue AND a bead, bidirectionally cross-linked. The bead title is derived from the bot comment, its body includes the original comment text, file paths, and GitHub issue link; it carries `bot-feedback` and `deferred` labels. Filing is subagent-delegated so it doesn't block the main triage thread. The reply thread is updated with both the issue number and bead ID.

This supersedes the older `plugin-patches.md` patch-9 text, which only linked bead→issue. The current implementation is bidirectional and the GitHub issue link is surfaced in the bead body for discoverability.

References `~/.claude/rules/no-silent-drops.md` § "Tracking-item protocol" — out-of-scope bot feedback is a finding that must be captured, not silently dropped.

**Upstreamable: no** — depends on this environment's BEADS setup and the `no-silent-drops` rule.

---

### F. Worktree Location Convention
**Commit:** `167f5cc` `chore(worktrees): use ~/Coding/.worktrees/<repo>/ convention`
**Files:** `guides/worktree-development.md`, `agents/swarm-coordinator-agent.md`, `skills/start/agents/swarm-coordinator-agent.md`

Replaced all ~14 occurrences of upstream's `~/Developer/<project>-worktrees/<agent-name>` pattern with `~/Coding/.worktrees/<repo>/<branch>`. Also updated `swarm-coordinator-agent.md` `base_dir` references. Worktrees inside or alongside the repo create recursive checkout loops and IDE indexer hangs; centralizing under `~/Coding/.worktrees/` eliminates this. The upstream default's sheer repetition (~14 references) could override the CLAUDE.md rule through volume.

**Upstreamable: no** — path convention is environment-specific.

---

### G. Advisor Escalation for Architectural Bot Findings
**Commit:** `8f0b479` `feat(pr-shepherd): advisor escalation for architectural/load-bearing bot findings`
**Files:** `skills/pr-shepherd/SKILL.md` (Phase 3, between "Complex Issues" and "FIXING State Rules")

Inserted "Architectural / Load-Bearing Issues (Advisor Escalation)" subsection. PR triage runs at Sonnet by default — appropriate for ~90% of bot feedback (lint, JSDoc, naming, defensive copies, missing tests). The remaining ~10% — findings that touch code covered by a checked-in `.claude/rules/*.md` file, or that propose changes to scoring formulas, persistence invariants, or other load-bearing patterns — Sonnet may push through without recognizing the stakes.

**The trigger is mechanical:** before applying any bot finding whose touched file is referenced by a `.claude/rules/*.md` file in the repo (or any pattern flagged as load-bearing in the repo's CLAUDE.md), invoke `advisor()` first. Surface advisor's recommendation in the PR triage comment; don't apply silently. The rule converts "must recognize architectural stakes mid-flight" into a deterministic file-check.

Companion to `~/.claude/CLAUDE.md` § "Code Review / PR Workflow → Advisor escalation for architectural bot findings".

**Upstreamable: no** — depends on this environment's `.claude/rules/` convention and advisor model configuration.

---

### H. /decompose DAG-Validation Gate
**Commit:** `829fb6a` `feat(gates): add /decompose DAG-validation gate alongside plan-review-gate`
**Files:** `skills/plan-review-gate/SKILL.md` (§ Downstream), `skills/orchestrated-execution/SKILL.md` (Dependency Graph Checklist → Validation), `commands/start-task.md` (new step 3, renumbering 3→4 through 6→7), `docs/gates/decompose-vs-plan-review.md` (new evidence doc)

Added `/decompose:decompose` as a sibling gate between plan-review-gate PASS and execution kickoff. For plans with 4+ WUs or any claimed parallelism, decompose is mandatory; for 2–3 WU linear plans, agent-judged (run when the plan has cross-WU data flow, synthesis requirements, or non-trivial integration).

This is NOT a 4th adversarial reviewer — it's a constructive DAG trace that catches what plan-review-gate's per-WU lens misses: hidden circularity, cross-WU output-contract contradictions, missing synthesis nodes, handwave dependencies.

Empirical basis: jb1-un0e — plan-review-gate PASSED 3/3 Opus reviewers on the first iteration; `/decompose` then found 8 structural issues including 2 blocking (WU-1 ↔ WU-2 circular dependency, WU-4 ↔ WU-7 crop/outline ownership contradiction). Estimated cost if skipped: 5.5–8h of wasted subagent work. The decompose gate itself cost ~40 minutes total. Full case documented in `docs/gates/decompose-vs-plan-review.md`.

Also replaced the "Dependency Graph Checklist" checkbox block in orchestrated-execution (self-certification) with a `/decompose` invocation requirement — checkbox self-certification is the exact pattern that let the jb1-un0e circular dependency slip past plan-review-gate.

**Upstreamable: no** — references the `decompose` plugin (external dependency) and jb1-specific empirical evidence that isn't portable.

---

### I. Setup-Generated Rubric Mechanical Floor
**Change-set:** `0.12.0-fork.3`
**Files:** `scripts/list-applicable-rubrics.mjs` (new), `templates/rubrics-readme.md` (new, § Mechanical Floor), `skills/setup/SKILL.md` (Phase 3 now writes both into the target project + completion summary)

`/setup` now lays down a rubric **mechanical floor**: a zero-dependency Node lister that globs every `.claude/rubrics/*.md` `applies-to` pattern against the diff and prints the `auto` rubrics that match. Reviewer selection of "which rubrics apply" is judgment-based, so a right-sized (or skipped) review can silently drop an auto-fire rubric that should have run; the lister rebinds the floor to the diff so it's evaluable regardless of review sizing. Informational (always exits 0). Setup writes the convention doc to `.claude/rubrics/README.md` and the lister to `scripts/` — the floor is inert (prints "Floor clear") until domain rubrics are authored. Mirrors the same mechanism added to the user-level `adapt-metaswarm` skill, which authors the domain rubrics on top.

**Upstreamable: yes** — generic mechanism (pure glob-vs-diff), no environment-specific assumptions. Non-Node repos port the ~100 lines to their language.

---

### J. General Engineering Discipline Rules
**Change-set:** `0.12.0-fork.3`
**Files:** `templates/CLAUDE.md` (§ General Engineering Discipline, top-level — non-mandatory), `templates/CLAUDE-append.md` (§ General Engineering Discipline, non-mandatory sibling)

Three project-agnostic habits injected into adopters' CLAUDE.md at setup, deliberately scoped as guidance (NOT under "Workflow Enforcement (MANDATORY)"): **doc-vs-code alignment** (parallel second-opinion auditor + doc-against-self grep before push; verify copied/transcribed claims against live source), **merge-conflict intent** (resolve by stated intent not line overlap; record non-trivial resolutions in a PR `## Conflict Resolutions` section), and **generated/regen artifacts** (identify by producer script, overwrite-then-regenerate during merges, never hand-merge). Distilled to portable form from jb1's `.claude/rules/*` (jb1-domain specifics stripped).

**Upstreamable: yes** — generic discipline; no environment-specific dependencies.

---

### K. pr-shepherd opens PRs + manual dual-bot (CodeRabbit + Copilot) policy
**Change-set:** `0.12.0-fork.4`
**Files:** `skills/pr-shepherd/SKILL.md` (new § "Bot reviews are manually triggered" + new "Phase 0: Open the PR"; per-round re-trigger wired into Phase 4; fixed the auto-review framing in Common Mistakes), `skills/handling-pr-comments/SKILL.md` (Phase 7 STEP 0 per-round re-trigger + reframed auto-review line + activation mentions), `commands/pr-shepherd.md` + `.claude/commands/pr-shepherd.md`, `commands/handle-pr-comments.md` + `.claude/commands/handle-pr-comments.md` (manually-kept identical pairs)

> **Superseded by § L (`0.12.0-fork.5`).** The "manual dual-bot policy" below described a two-bot (CodeRabbit + Copilot) world with Cursor/Gemini still assumed auto. That assumption was already wrong by K.1 below, and the roster itself is now five bots (CodeRabbit, Cursor Bugbot, Copilot, Codex, Gemini), each with its own cap and placement per § L. Kept here for change history; don't treat the "dual-bot" framing as current.

pr-shepherd now **opens** a PR when invoked on a branch with no PR (Phase 0: shareability gate → push → duplicate guard → `gh pr create` → initial bot triggers → report), skipping cleanly when a PR already exists. It supersedes `issue-orchestrator`'s manual "Option B: `gh pr create` then invoke pr-shepherd" step. Adds the **manual dual-bot policy**: CodeRabbit + Copilot don't auto-review, so the skill triggers both explicitly — initial on open, re-trigger per meaningful fix round — **by default without asking** (opt out only in the invoking prompt; only the bots a repo actually uses; Cursor/Gemini still auto). Copilot's `gh` reviewer-request mechanic is documented as a tiered fallback (`gh pr edit --add-reviewer` → REST `requested_reviewers` → Reviewers UI; confirm on first live use). Includes the CodeRabbit-throttle → `@claude` fallback. Adapted from jb1's `pr-web`/`pr-shepherd` (commit `6a498c9d`), MCP→`gh` idiom. The global behavior policy lives in the user-level `~/.claude/CLAUDE.md` § "PR bot invocation"; this is the metaswarm-fork half.

**Upstreamable: partial** — the manual dual-bot policy + Phase-0 PR-creation are generic; the `@claude`-throttle-fallback wording and the assumption that auto-review is owner-disabled are environment-specific.

#### K.1 — Bot-fact corrections (2026-07-18): triple-bot policy + CodeRabbit coverage truth
**Change-set:** `0.12.0-fork.4` (in place)
**Files:** the same six as § K.

> **Partially superseded by § L (`0.12.0-fork.5`).** Two claims below are now known wrong: "Gemini is dead" (it wasn't — Gemini Code Assist auto-reviews once at PR open, per the owner's 2026-09-22 ruling) and "Copilot's queue is quota-blocked through 2026-08-01" (that date has passed; Copilot is opt-in/once/at-open on its own merits, not because of a quota block). The Cursor Bugbot and CodeRabbit-coverage corrections below still hold, though Bugbot's placement changed again in § L (held back from open, capped at one use, fired at the first logic-changing round rather than every round).

Corrects four factual errors the § K text carried, ported from a jb1 four-day PR-bot forensic audit (PRs 829–860):
- ~~**Gemini is dead.** Its consumer code-review product was retired 2026-07-17; every "Cursor/Gemini still auto-review on push" claim is corrected to "no bot auto-reviews" + an explicit "Gemini posts nothing, never await it." (It also auto-reviewed on *open*, not push, even while alive.)~~ **Wrong — see § L.** Gemini Code Assist for GitHub is alive and is the one bot that still auto-reviews (once, at open, never on push).
- **Cursor Bugbot is manually triggered, not an auto-reviewer.** The trigger table + handle-pr-comments STEP 0 now carry a **Cursor Bugbot** column/row: a **standalone top-level** `bugbot run` (or `@cursor review`) comment that MUST NOT be combined with another trigger in one comment (a combined comment silently fails to fire Bugbot — jb1 PR #841). The prior text relied on the false "Cursor auto-reviews" claim and never triggered Bugbot at all.
- ~~**Copilot is requested once at open, not per round** (its queue is quota-blocked through 2026-08-01, so a no-op is expected). Per-round re-request removed.~~ **Date passed — see § L.** Copilot is still once-at-open, but because that's where a cold full-diff read pays most on a small high-impact PR, not because of a quota block.
- **`full review` recovers a throttled/no-op round** (not only "after a history-rewriting rebase").
- **CodeRabbit coverage truth (new blockquote after the throttle paragraph):** a *clean* CodeRabbit pass posts **no review object** — it edits its pinned `summarize by coderabbit.ai` walkthrough comment (`between <base> and <head>` range is the signal); ~half of CodeRabbit "review objects" are empty reply containers (filter `.body != ""`). A missing review object means **UNKNOWN → read the walkthrough**, not `did-not-review`, and is **never** grounds to re-trigger (a false re-trigger drains the shared fair-usage meter). Mirrors jb1's always-loaded `proactive-gate-selection.md` fix (jb1 commit `daff6a20`). **Refined in § L:** the walkthrough's `between <base> and <head>` range is UNKNOWN, not clean — the actual clean signal is the `recent_review` block of the same summary comment.

**Upstreamable: yes** — all five are vendor-factual, not environment-specific.

---

### L. PR-bot policy realigned to knowledge_base pr-management pack + owner rulings (2026-09-22)
**Change-set:** `0.12.0-fork.5`
**Files:** `skills/pr-shepherd/SKILL.md`, `agents/pr-shepherd-agent.md`, `skills/handling-pr-comments/SKILL.md`, `commands/pr-shepherd.md` + `.claude/commands/pr-shepherd.md`, `commands/handle-pr-comments.md` + `.claude/commands/handle-pr-comments.md` (manually-kept identical pairs)

Realigns all PR-bot invocation guidance to the canonical portable policy at `~/Coding/knowledge_base/docs/pr-management/bot-invocation-policy.md`, incorporating owner rulings from 2026-09-22 that supersede §§ K/K.1 above:

- **Gemini Code Assist for GitHub is alive**, not retired: it auto-reviews **once at PR open, never on push** (so its pass often covers a stale SHA); re-trigger with top-level `/gemini review`; it reviews markdown; it is never required.
- **Copilot**: opt-in, at most once at open, on smaller high-impact PRs; re-request **once only** if the review comes back as an error notice (which doesn't consume the use); otherwise never re-request. Removed the "quota-blocked through 2026-08-01" framing — that date has passed and was never the real constraint.
- **Cursor Bugbot**: at most once per PR, held back from open, fired as a standalone top-level `bugbot run` at the **first logic-changing fix round** — not "re-post every round" as §K/K.1 had it. If no such round arrives, it never fires (correct non-spend).
- **Codex**: new to this skill set — up to 3 uses per PR, top-level mention + exactly the word `review` (anything else launches an autonomous coding task), with explicit mention-hygiene guidance for these instruction files vs. live PR surfaces.
- **CodeRabbit**: always `@coderabbitai full review`, never the incremental trigger (which silently no-ops on already-reviewed commits); don't push mid-review (a push aborts it).
- **Materiality**: re-review only when fix commits changed behavior, including behavior-changing edits to agent-instruction files; doc/test-only/nit rounds converge locally with no re-review.
- **Three-round cap**: before a fourth round, run `/enforce` in `pr` mode against the findings it would chase, then get the user's go-ahead.
- **Throttles**: generalized from CodeRabbit-only to all bots — stop and check in with the user rather than re-firing or re-routing; the CodeRabbit-throttle → `@claude` fallback is kept as the worked example of what "check in" looks like.
- **Round counting**: by artifact, never the trigger's ack; read full bodies and expand `<details>`; corrected a 200-char body truncation in `commands/handle-pr-comments.md` that ran *before* the "Actionable comments posted" substring test, which could silently hide the match.
- **Convergence**: findings from 2+ bots are a signal, not a verdict — bots share priors and can converge on the same wrong diagnosis.
- **Thread resolution**: left to agent discretion (owner ruling) rather than "never auto-resolve" — with a preference for dispatching per-thread resolution work to a subagent when the agent does resolve threads itself, to keep that context out of the main session.
- **Readiness verdict**: replaced "CI green + threads resolved" readiness claims with an explicit, first-party-confirmed `Ready to merge (my assessment): YES/NO` line everywhere a PR is handed back, matching the canonical policy's § 7 termination rule (never `NO` for process reasons).
- **Monitor usage**: corrected the canonical Monitor script, which had treated `mergeStateStatus == "CLEAN"` as `READY_TO_MERGE` (that field reports conflicts/required-checks only); it now exits on `CI_COMPLETE`. Added a separate, narrower "one silent Monitor per awaited bot round, keyed to that bot's own artifact" pattern for waiting on a specific bot's result, replacing indefinite re-arming through Phase 2.

**Upstreamable: partial** — the bot-policy corrections and Monitor fixes are vendor-factual and generic; the pointer to `~/Coding/knowledge_base/docs/pr-management/` and the `/enforce`-gated fourth-round check are environment-specific.

---

### M. Thread disposition, verdict hand-back, plain `gh` instead of GTG, no repo-local PR-comment scripts, Dolt-first beads templates (2026-09-22)
**Change-set:** `0.12.0-fork.7`
**Files:** `skills/pr-shepherd/SKILL.md`, `agents/pr-shepherd-agent.md`, `skills/handling-pr-comments/SKILL.md`, `commands/pr-shepherd.md` + `.claude/commands/pr-shepherd.md`, `commands/handle-pr-comments.md` + `.claude/commands/handle-pr-comments.md` (manually-kept identical pairs), `skills/start/SKILL.md`, `skills/status/SKILL.md`, `skills/setup/SKILL.md`, `templates/{task-completion-checklist,beads-readme,todo-management}.md` (+ generated `skills/setup/templates/` copies), `lib/sync-resources.js` (+ regenerated `commands/metaswarm/{pr-shepherd,handle-pr-comments,status}.toml`); **deleted** `bin/pr-comments-{check,filter}.sh`, `templates/gtg-workflow.yml` (+ their generated `skills/setup/` copies)

Owner decisions (Eric, 2026-09-22) and agreed residuals, closing the gaps § L left:

- **D1 — disposition, not resolution.** Every DONE/READY/exit criterion that required "all threads resolved / zero unresolved" now requires that **every review thread has a disposition** — fixed (with a reply) or declined with the reason in a reply — with any thread deliberately left open listed in the hand-back report. Resolving stays at the agent's discretion (§ L). The pr-shepherd and handling-pr-comments skills carry one GraphQL `reviewThreads` query that classifies each thread `NEEDS-DISPOSITION` / `OPEN-REPLIED` / `RESOLVED-NO-REPLY` / `RESOLVED`. Also removed `commands/handle-pr-comments.md`'s "Do NOT resolve threads — let reviewer verify", which contradicted § L.
- **D2 — the skill ends at the hand-back.** "PR squash-merged to main" is gone from pr-shepherd's exit conditions; it hands back the one-line `Ready to merge (my assessment): YES — … / NO — …` verdict, merges only if the owner explicitly authorized that merge in the session, and never enables auto-merge unless asked. Phase 7 (post-merge knowledge extraction) runs only if a merge actually happened. `agents/pr-shepherd-agent.md` keeps its human-approves-the-merge handoff.
- **D3 — plain `gh`, no `gtg`.** `gtg` isn't installed here; its section, state table, and `Merge Ready (gtg)` re-run are replaced by a `gh pr checks --json name,state,bucket` classifier plus the thread query, and a state table in those terms. **Verified on gh 2.83.1: with `--json`, `gh pr checks` exits 0 for passing, failing, and pending checks alike** — the documented 1/8 exit codes apply only to the plain-text form — so CI state is classified from `bucket`, and a non-zero exit means "no checks reported" (absent, not pending) or an error. `gtg` references also removed from `skills/start/SKILL.md` (merge-gate section), `skills/status/SKILL.md` (check #8, table row, recommendation), and the status TOML prompt. `templates/gtg-workflow.yml` deleted — no setup step ever installed it.
- **R1** — removed pr-shepherd's "Post-Completion RAM Cleanup" (`/auto-ram-cleanup` doesn't exist in this fork).
- **R2** — "ready to merge" completion wording in the pr-shepherd command and agent rephrased as the hand-back verdict, which requires the first-party round check.
- **R3** — the task-completion checklist's `gh pr merge … --squash` + auto-merge step replaced with the verdict hand-back (merge only on explicit instruction; auto-merge only if asked).
- **R4** — the repo-local `bin/pr-comments-{check,filter}.sh` scripts (off-canon: "any reply = addressed", CodeRabbit-only) and the non-existent `bin/pr-comments-out-of-scope.sh` are no longer called: replaced by inline `gh api` over the three REST surfaces (`issues/comments`, `pulls/comments`, `pulls/reviews`, `--paginate`), the PR body, and the GraphQL thread query, classifying all five bots plus humans. Scripts and the setup step that installed them deleted (nothing else called them).
- **R5** — the generated `handle-pr-comments` TOML prompt names the right skill (`handling-pr-comments`) and describes disposition + materiality-gated re-rounds; the `pr-shepherd` TOML prompt no longer says "shepherd a PR to merge / report when ready to merge".
- **R6** — Dolt-first commands ported from `~/Coding/knowledge_base/.claude/templates/`: claim with `bd update <id> --claim`, close with `bd close --reason`, push with `bd dolt push` only when a shared Dolt remote is configured. (bd 1.2.1 still has `bd sync`, now a full Dolt pull/push cycle that can adopt git `origin` as a Dolt remote — the change retires the *unconditional* default, it doesn't claim `bd sync` is gone.) The readme's "examples only" authority caveat is kept; kb-specific prose was not ported.

> **Upstream-merge watch:** upstream still carries everything this section removed — `gtg` usage and `gtg-workflow.yml`, `bin/pr-comments-*.sh` and their setup step, "all threads resolved / zero unresolved" criteria, the "squash-merged to main" exit, `/auto-ram-cleanup`, and unconditional `bd sync`. On an upstream merge, keep them out.

**Upstreamable: partial** — D1's disposition rule, D3's `gh` classifier (and the exit-code finding), R1, R4, and R5 are generic; D2's authorization boundary and R6's Dolt-first default reflect this owner's policy.

---

## Upstream Sync Procedure

When a new upstream tag is available:

1. `git fetch upstream`
2. `git merge upstream/main` (or `git rebase custom` onto the new upstream tag) into `custom`
3. Resolve conflicts — note that `skills/pr-shepherd/SKILL.md`, `skills/handling-pr-comments/SKILL.md`, `skills/plan-review-gate/SKILL.md`, and `skills/orchestrated-execution/SKILL.md` each carry multiple groups (B+G+K+K.1+L+M, B+C+E2+K+K.1+L+M, D+H, D+H respectively), and § M also touches `skills/start`, `skills/status`, `skills/setup`, `templates/`, `bin/`, and `lib/sync-resources.js`, so cherry-picking upstreamable groups will produce conflicts in shared files
4. `node lib/sync-resources.js --sync` to regenerate co-located copies
5. `node lib/sync-resources.js --check` — must pass before tagging
6. Bump `fork.N` in all 5 version files
7. Run the full refresh sequence (§ Version & Refresh Discipline above)

For upstreamable changes (A, B, C, and the project-neutral parts of D), consider opening PRs against `dsifry/metaswarm` to reduce future merge friction.
