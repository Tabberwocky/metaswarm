---
name: pr-shepherd
description: Monitor a PR through to merge — handle CI failures, review comments, and thread resolution automatically until all checks pass
---

# pr-shepherd

Use when a PR has been created and needs to be monitored through to merge - handles CI failures, review comments, and thread resolution automatically until all checks pass and all threads are resolved.

**IMPORTANT**: This skill is designed for the **agent working in a worktree**, NOT the orchestrator. The agent handles its own PR monitoring so the orchestrator remains free for other work.

## Coordination Mode Note

This skill supports both coordination modes:

- **Task Mode** (default): Runs as a single long-running `Task()` with `run_in_background: true`. Orchestrator checks via `TaskOutput(block: false)`.
- **Team Mode**: Runs as a persistent `shepherd` teammate in the `issue-{number}` team. Sends async status updates via `SendMessage` (CI failure, review comments, all-green, PR merged). Orchestrator can respond with instructions (e.g., "defer that comment, create an issue instead"). Responds to `shutdown_request` for graceful exit.

All monitoring, fixing, and review handling logic is identical in both modes. See `./guides/agent-coordination.md` for mode detection.

---

## When to Activate

Activate this skill when ANY of these conditions are true:

- Agent just created a PR with `gh pr create`
- **Invoked on a branch with no PR yet** → pr-shepherd opens it (Phase 0) and then monitors
- User asks to "shepherd", "monitor", or "see through" a PR
- User invokes `/pr-shepherd <pr-number>`
- User asks to "watch this PR" or "handle this PR until it's merged"
- Orchestrator spawned you with instructions to shepherd a PR
- **Automatic**: `bin/create-pr-with-shepherd.sh` was used (outputs shepherd instructions)

### Automatic Activation via Wrapper Script

When `bin/create-pr-with-shepherd.sh` creates a PR, it outputs shepherd instructions:

```text
==========================================
  PR Shepherd Active for PR #123
==========================================

The pr-shepherd skill will:
  - Monitor CI/CD status
  - Auto-fix lint, type, and test issues
  - Handle review comments
  - Resolve threads after addressing feedback
  - Report when PR is ready to merge

To manually invoke shepherd later:
  /pr-shepherd 123
```

When you see this output, **immediately invoke the pr-shepherd skill** with the PR number shown.

## Announce at Start

"I'm using the pr-shepherd skill to monitor this PR through to merge. I'll watch CI/CD, handle review comments, and fix issues as they arise."

## For Orchestrators: Spawning Agents with PR Shepherding

When spawning an agent to work in a worktree, include PR shepherding in the task prompt:

```text
Work in worktree at /path/to/worktree on branch feature/xyz.

Task: [describe the implementation task]

After creating the PR:
1. Use the pr-shepherd skill to monitor it through to merge
2. Handle CI failures and review comments autonomously
3. Only escalate to orchestrator for complex issues requiring user input
4. Report back when PR is ready to merge or if blocked

Run in background so I can continue other work.
```

**Key principle**: The agent owns its PR lifecycle. The orchestrator spawns and forgets, checking back via `AgentOutputTool` when needed.

## State Machine

The agent operates in one of these states:

```text
MONITORING → FIXING → MONITORING → WAITING_FOR_USER → FIXING → MONITORING → DONE
```

| State              | What Happens                                | Exit When                                      |
| ------------------ | ------------------------------------------- | ---------------------------------------------- |
| `MONITORING`       | Watch CI and reviews via the `Monitor` tool — it streams events only on state change (see § Monitoring via the Monitor tool below) | CI fails, new comments, all done, or need help |
| `FIXING`           | Fix issues using TDD, run local validation  | Local validation passes OR need user guidance  |
| `HANDLING_REVIEWS` | Invoke `handling-pr-comments` skill         | Comments handled OR need user input            |
| `WAITING_FOR_USER` | Present options, wait for user decision     | User responds                                  |
| `DONE`             | All CI green + all threads resolved         | Exit successfully                              |

## Bot reviews — manual triggers, chosen within each bot's cap

**Default when this skill OPENS a PR (Phase 0) or completes a meaningful fix round: invoke the bots this PR warrants, within each bot's per-PR cap below — do NOT ask.** The user opts out only by saying so in the prompt that invoked the skill (e.g. "open it but skip the bots" / "just CodeRabbit"). There is no fixed roster — pick the bots by judgment within their caps, and **say which bots you fired and which you skipped, by name** in the status report ("fired CodeRabbit + Codex, skipped Bugbot — no logic-changing round yet" beats "fired the bots").

This is *not* "fire on every touch": attaching to an already-open PR to monitor does **not** re-fire the initial review (Phase 0 is skipped when a PR already exists), and per-round triggers fire only for a round that owes one (§ Materiality below).

**No bot auto-reviews except Gemini Code Assist for GitHub**, which auto-reviews **once at PR open and never again on push** — so its pass routinely covers a stale SHA. Treat that as free coverage of the opening diff; re-trigger a later SHA with the top-level `/gemini review` comment. It reviews markdown — never *predict* a "file types not supported" no-op, though one it actually posts satisfies its round. It has no cap of its own (the three-round cap below covers it like any bot) and is **never required** — skipping it is not a coverage gap. CodeRabbit, Cursor Bugbot, Copilot, and Codex are all comment-triggered / requested-reviewer bots; none reviews until explicitly asked.

> **Assumes auto-review is disabled owner-side** (CodeRabbit dashboard `auto_review` off + Copilot account auto-review off). If it isn't, explicit triggering double-reviews and burns metered review budget — that double-spend is the failure this policy prevents.

> **Repo guard:** only trigger the bots actually configured on this repo. If a repo doesn't use CodeRabbit (no `.coderabbit.yaml` / app not installed) or Copilot review isn't enabled, skip that bot silently — never post `@coderabbitai` or request Copilot where they aren't set up.

### Per-bot caps and placement

| Bot | Cap | Placement |
|---|---|---|
| **CodeRabbit** | Draws a per-developer, rolling hourly allowance (5/hr on Essentials), shared across your open PRs | Initial on open; re-trigger each round that owes one (§ Materiality) |
| **Cursor Bugbot** | **At most once per PR** (more only with explicit owner authorization) — only on a PR whose change can reach a user (user-facing behavior, shipped runtime — not diff size) | **Held back from open.** Fire it as a standalone top-level `bugbot run` at the **first logic-changing fix round** — that's where it catches defects the fix round itself introduced. If no such round arrives, it never fires — correct non-spend, not a gap |
| **Copilot** | **At most once per PR, at open, opt-in** — on smaller, high-impact PRs: a diff small enough to read whole, whose logic carries real user-facing, correctness, security, or data-integrity risk. Never on large PRs, markdown-only diffs, or a ceremonial review. Never re-request — **except** a review that comes back as an error notice ("...encountered an error and was unable to review"), which didn't consume the use; re-request once for that specific case | Once, at open only |
| **Codex** | Up to **3 uses per PR**, at your judgment | Any round that gets bot review |
| **Gemini** | No cap of its own — covered by the 3-round cap like any bot | Auto at PR open; re-trigger with `/gemini review` when a later SHA warrants it |

Never skip a bot because a PR looks large — flag the size to the user, but still fire it where its placement calls for it.

### Trigger mechanics — exact tokens

| Bot | Trigger |
|---|---|
| **CodeRabbit** | `gh pr comment <N> --body "@coderabbitai full review"` — **always `full review`**, never the incremental `@coderabbitai review` (which silently no-ops on commits it already counts as reviewed) |
| **Cursor Bugbot** | A **standalone top-level** comment: `bugbot run` (or `@cursor review`). Never a reply, and never sharing a comment with another trigger — a shared comment leaves Bugbot silently un-fired |
| **Copilot** | Primary: REST `gh api -X POST repos/$OWNER/$REPO/pulls/<N>/requested_reviewers -f 'reviewers[]=copilot-pull-request-reviewer[bot]'`, or `gh pr edit --add-reviewer @copilot` on gh ≥ 2.88. Verify immediately with GET `pulls/<N>/requested_reviewers` (lists Copilot until the review lands; `reviewRequests` never shows bots). A request that seems lost is a question for the review artifact, never a reason to retry — a retry spends the one use |
| **Codex** | A top-level mention of the bot followed by **exactly the word `review`**. Anything else after the mention starts an autonomous cloud **coding task** against the PR — the sharpest failure in this class. **Mention hygiene**: it's fine to write about the trigger here, in these instruction files — but never write a *live* codex-mention token into a PR title, body, commit message, or comment when you only mean to describe it; neutralize it (drop the sigil, break with a backtick) |
| **Gemini** | Top-level `/gemini review`, only to re-trigger past the free open-PR pass |

**Post each bot's trigger as its own separate top-level comment** — never combine two triggers in one comment (a combined comment can leave Cursor Bugbot un-fired while the other bot runs, so you declare convergence with zero Bugbot review). **Batch a round's fixes into one push, then trigger each chosen bot once** — never a review per commit.

**Don't push while a CodeRabbit review is running** — a push aborts it (`⚠️ Action not completed — Head commit changed.`). If you must push mid-review, expect to re-fire CodeRabbit afterward.

**Copilot request mechanic note:** `gh`'s reviewer flags have rejected the bot login in some environments — if `gh pr edit --add-reviewer @copilot` fails, fall back to the REST call above, and if both fail, request Copilot via the GitHub Reviewers UI and note it for the user.

### Materiality — which rounds are owed

**Re-review only if the fix commits changed behavior** — new or changed control flow or code paths, **or a behavior-changing edit to an agent-instruction surface** (rules, skills, commands, bot-calibration config). Doc/test-only/nit fix rounds owe **no** re-review and converge locally: tests green plus your own diff review of the fix commits.

**Convergent findings from 2+ bots are a signal, not a verdict.** Bots share priors and can converge on the same wrong diagnosis or the same naive — and wrong — prescription. Agreement across bots doesn't excuse verifying the finding yourself against live source before applying it.

**Three review rounds per PR, then an `/enforce` check.** A round is one cycle of bot feedback followed by code-iteration commits, whichever bots gave the feedback. A PR that ostensibly needs a fourth round has usually gone off the rails. Before firing a fourth, run `/enforce` in `pr` mode against the findings it would chase; if a fourth round still looks warranted, check in with the user for permission and guidance, naming the risk and the bot you'd use.

### Throttles and quota notices — stop and check in, never re-fire on your own

Any throttle, rate-limit, quota, or usage-limit notice from **any** bot means: don't re-fire it — not on a timer, not per commit, not "once, hours later" — and don't route the round to another bot on your own. Stop and check in with the user: they decide whether to wait, re-route, or save the capacity for a higher-priority PR. The notice doesn't consume the bot's use.

**CodeRabbit throttle → `@claude` fallback:** if CodeRabbit returns a rate-limit notice instead of a review, notify the user and ask once per throttle episode whether to tag `@claude` as the fallback reviewer (never autonomously). On yes, keep `@claude` consulted for the rest of the PR (re-mention on meaningful updates, not per commit) and skip CodeRabbit's trigger while it's engaged. On no, note it (no silent drop) and either wait out the window or proceed without CodeRabbit. This is what "check in" looks like for this specific bot — it doesn't relax the stop-and-check-in rule above for any other bot's throttle.

### Verifying a round — the artifact, never the trigger's ack

**Count a round by the artifact it produced, never by the trigger's acknowledgement.** A trigger can be acknowledged (`✅ Action performed / Review finished`) and then silently consumed by a throttle, an abort, or a no-op. **A non-empty body is not evidence of a review** — quota, throttle, error, and unsupported-filetype notices can all render as review-shaped objects; only some satisfy their round. **Read whole bodies and expand `<details>` blocks** — CodeRabbit hides a nit-only review inside one.

A *clean* CodeRabbit pass posts **no review object at all** — the signal is the `recent_review` block of its pinned summary comment (*"No actionable comments were generated in the recent review."*) sitting above that block's own `📥 Commits` range. The walkthrough's separate `between <base> and <head>` range is a **different range that can cover head mid-review**, so it means **UNKNOWN**, never "clean" — don't read it as a clean signal. And ~half of CodeRabbit's "review objects" are **empty reply containers, not reviews** — filter on non-empty `.body`:
```bash
gh api "repos/$OWNER/$REPO/pulls/<N>/reviews?per_page=100" \
  | jq -r 'sort_by(.submitted_at)[] | select((.body // "") != "") | "\(.user.login)\t\(.commit_id[0:7])\t\(.submitted_at)"'
```
A bot **absent from one endpoint has not been shown not to have reviewed** — a clean CodeRabbit or Codex pass creates zero review objects by design, so don't treat "no review object" as the sole signal (check the bot's own clean-pass surface first). A missing signal is **UNKNOWN → check the bot's own surface before concluding anything**; it is **not** `did-not-review` and is **never** grounds to re-trigger. A false re-trigger draws down the shared fair-usage meter and can starve a *later* PR to zero coverage.

For the exact per-bot clean-pass signal, findings signal, traps, and the full non-review-notices table (quota/throttle/error/unsupported-filetype per bot), see `~/Coding/knowledge_base/docs/pr-management/bot-invocation-policy.md` § 6 — desktop sessions only; it may be absent on Claude Code web, in which case fall back to the rules above.

## Phase 0: Open the PR (skip if a PR already exists)

Run this only when the skill is invoked on a branch with **no PR yet**. **Skip** when a PR number/URL was provided or a PR already exists for the branch — jump to Phase 1. Phase 0 is autonomous: invoking pr-shepherd on a branch is your authorization to open; the only pause is an uncommitted working tree.

```bash
# 1. Branch shareability gate
BASE_BRANCH="$(git symbolic-ref --short refs/remotes/origin/HEAD | sed 's#^origin/##')"
# Fail closed on a dirty tree: a partial (committed-only) push would open a PR on an incomplete diff.
test -z "$(git status --porcelain)" || { git status --short; echo "Working tree is dirty — commit, stash, or confirm scope before opening a PR (never auto-commit). Surface to the user and stop."; exit 1; }
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[ "$BRANCH" = "$BASE_BRANCH" ] && { echo "Refusing to PR from the default branch."; exit 1; }
[ "$(git rev-list --count "origin/${BASE_BRANCH}..HEAD")" -eq 0 ] && { echo "Nothing to PR."; exit 1; }

# 2. Push the branch (retry 2/4/8/16s on network errors; never --force unless asked) — MUST succeed before creating the PR
git push -u origin "$BRANCH"

# 3. Duplicate guard — reuse an existing open PR instead of creating a second
PR_NUMBER=$(gh pr list --head "$BRANCH" --state open --json number -q '.[0].number')
```

If no existing PR (`PR_NUMBER` empty):

4. **Compose** title (<70 chars, repo convention) + body from all branch commits + the cumulative diff. Body: `## Summary` (what + why) and `## Test plan` (validated vs pending checks). Add a `## Conflict Resolutions` section only if a non-trivial rebase happened (per the general-discipline merge-conflict rule).
5. **Create** (ready, not draft, unless the user explicitly asked for a GitHub draft) — open immediately, no draft-for-review pause:
   ```bash
   gh pr create --base "$BASE_BRANCH" --head "$BRANCH" --title "<title>" --body "<body>"
   PR_NUMBER=$(gh pr view "$BRANCH" --json number -q .number)
   ```
6. **Trigger the initial bot reviews** — default, do NOT ask (see § "Bot reviews — manual triggers, chosen within each bot's cap"): `@coderabbitai full review` if this repo uses CodeRabbit, and request the Copilot reviewer only if this PR fits Copilot's cap (smaller, high-impact — see the caps table). Gemini already auto-reviews on open; no action needed. Cursor Bugbot and Codex are held back from open per their own placement rules.
7. **Report** PR number/URL/base, then fall into Phase 1.

This supersedes the manual "Option B: `gh pr create` then invoke pr-shepherd" step in `issue-orchestrator` — pr-shepherd now owns opening when invoked on a bare branch.

## Phase 1: Initialize

```bash
# Get PR info
PR_NUMBER=$(gh pr view --json number -q .number 2>/dev/null)
OWNER=$(gh repo view --json owner -q .owner.login)
REPO=$(gh repo view --json name -q .name)

# If no PR on current branch and none was provided, run Phase 0 to open one (don't just exit)
if [ -z "$PR_NUMBER" ]; then
  echo "No PR for current branch — run Phase 0 (Open the PR), or provide a PR number."
  exit 1
fi

echo "Shepherding PR #$PR_NUMBER"
```

## Phase 2: Monitoring Loop (Background)

### Monitoring via the Monitor tool (not `/loop`)

`Monitor` runs a shell script in the background and emits a chat notification **only when the script writes a stdout line**. That means quiet periods — CI still running, no new comments — cost zero agent tokens. It is strictly cheaper than `/loop <interval>` for PR shepherding because:

1. Monitor fires on actual state change; `/loop` fires every N minutes regardless.
2. Each Monitor event is a single JSON line (~150 bytes); each `/loop` firing replays the full user prompt.
3. Events that cluster within a few minutes stay inside the 5-minute prompt-cache TTL; `/loop 5m` lands exactly on the cache boundary.

**Canonical CI-state monitor** (watches CI checks only — this is not a review-readiness signal, see the callout below):

```
Monitor({
  description: "PR $PR_NUMBER CI state changes",
  timeout_ms: 900000,   // 15 min; re-arm if CI is still running
  persistent: false,
  command: `prev=""
while true; do
  snapshot=$(gh pr view $PR_NUMBER --json statusCheckRollup,mergeStateStatus,comments,reviews 2>/dev/null | jq -c '{
    checks: [.statusCheckRollup[] | {name: (.name // .context), status: (.status // .state), conclusion}],
    merge: .mergeStateStatus,
    commentCount: (.comments | length),
    reviewCount: (.reviews | length)
  }' 2>/dev/null || echo "POLL_FAIL")
  if [ "$snapshot" != "$prev" ] && [ -n "$snapshot" ]; then
    prev="$snapshot"
    checkLen=$(echo "$snapshot" | jq -r '.checks | length' 2>/dev/null || echo "0")
    running=$(echo "$snapshot" | jq -r '[.checks[] | select(.status == "IN_PROGRESS" or .status == "PENDING" or .status == "QUEUED" or .status == "EXPECTED")] | length' 2>/dev/null || echo "1")
    if [ "$checkLen" -gt "0" ] && [ "$running" = "0" ]; then
      echo "CI_COMPLETE"
      exit 0
    fi
  fi
  sleep 30
done`
})
```

> **`mergeStateStatus` (`merge`/`CLEAN` in the snapshot) is never a readiness signal.** It reports conflict state and required-checks status only — it carries no information about whether a bot reviewed the current SHA. Don't treat `CLEAN` as "ready to merge," here or anywhere else in this skill; PR readiness is decided by the bot-round verification in § "Bot reviews" plus this CI check, not by this field alone.

**Behavior:**

- Silent while CI runs — no line per state change, so it costs exactly one wake (CLAUDE.md § "Awaiting a bot's result"). New comments and reviews are read when it fires, not streamed.
- Exits cleanly on `CI_COMPLETE` (all checks terminal) — that's a CI signal only, not a merge-readiness verdict.
- Times out after 15 minutes — re-arm with a fresh `Monitor` call only while work is genuinely in progress (a push just landed, CI is running). Don't leave a watch armed on an idle, converged PR — re-check at the merge step or on a real event instead.

**When NOT to use Monitor**: Truly periodic tasks that should fire on a schedule regardless of state (e.g., "summarize the inbox every hour"). Those stay on `/loop`.

### Awaiting a bot's review round — one silent Monitor, one wake

After firing a bot trigger (§ "Bot reviews"), don't poll for the result with repeated turns. Start **one** silent `Monitor` until-loop keyed to **that bot's own clean/findings artifact** (never the trigger's ack, never `mergeStateStatus`) — see the policy doc's § 6 table for the exact per-bot check (CodeRabbit: `recent_review` block in its summary comment, read via `updated_at` since the comment is edited in place; Codex: the issue comment `Codex Review: Didn't find any major issues.` with its Reviewed-commit SHA, or a review object; Bugbot: `<!-- CURSOR_SUMMARY -->` in the PR body; Copilot/Gemini: a review object by that bot). Shape:

```bash
until <artifact-check-for-this-bot>; do sleep 60; done; echo "landed"
```

When a round triggers several bots, one until-loop checks all of them — a tested multi-bot template (CodeRabbit, Codex, Gemini, Copilot, Bugbot) is in `~/.claude/skills/gh-pr-feedback/SKILL.md` Step 9b. Run the check once by hand against an existing artifact first to prove it can fire, then arm it. It emits one line and exits when the artifact lands — zero tokens while waiting, exactly one wake. One monitor per awaited round; don't stack them. Never arm a watch on an idle, already-converged PR.

Run GTG inside a `Monitor` watch script as the **single source of truth** for PR *CI/thread* status (not bot-review readiness, which is verified separately per § "Bot reviews"):

### Primary Check: GTG (Good-To-Go)

GTG consolidates CI status, comment classification, and thread resolution into one call. Use it instead of separate API queries.

```bash
# Primary readiness check — structured JSON output
GTG_RESULT=$(gtg $PR_NUMBER --repo "$OWNER/$REPO" --format json \
  --exclude-checks "Merge Ready (gtg)" \
  --exclude-checks "CodeRabbit" \
  --exclude-checks "Cursor Bugbot" \
  --exclude-checks "claude" 2>&1)

STATUS=$(echo "$GTG_RESULT" | jq -r '.status')
ACTION_ITEMS=$(echo "$GTG_RESULT" | jq -r '.action_items[]?' 2>/dev/null)
CI_STATE=$(echo "$GTG_RESULT" | jq -r '.ci_status.state')
```

**GTG statuses:**

| Status               | Meaning                            | Agent Action                              |
| -------------------- | ---------------------------------- | ----------------------------------------- |
| `READY`              | All CI green, all threads resolved | → DONE                                    |
| `ACTION_REQUIRED`    | Actionable comments need fixes     | → HANDLING_REVIEWS (use `action_items`)   |
| `UNRESOLVED_THREADS` | Review threads still open          | → HANDLING_REVIEWS                        |
| `CI_FAILING`         | One or more CI checks failing      | → FIXING                                  |
| `ERROR`              | Couldn't fetch PR data             | Retry on the next Monitor event; escalate after 3 consecutive ERROR events |

**GTG reports, agents act**: GTG does not resolve threads or fix code — it only tells you what's blocking. After addressing feedback, you must resolve threads yourself using the GraphQL mutation in `handle-pr-comments.md` (Section 3). GTG will report `READY` on the next Monitor event once threads are resolved.

### Evaluate State Transitions

```text
if STATUS == "READY":
  → DONE

if STATUS == "CI_FAILING":
  → Parse action_items for specific failures
  → if is_simple_failure(failure): FIXING
  → else: WAITING_FOR_USER

if STATUS == "ACTION_REQUIRED" or STATUS == "UNRESOLVED_THREADS":
  → HANDLING_REVIEWS (action_items tells you exactly what to fix)

if STATUS == "ERROR":
  → Retry, then escalate
```

### Fallback: Manual Checks

If GTG is unavailable (e.g., not installed in environment), fall back to manual queries:

```bash
# CI status
FAILED_CHECKS=$(gh pr checks $PR_NUMBER --json name,conclusion --jq '[.[] | select(.conclusion == "FAILURE")] | length')

# Unresolved threads
UNRESOLVED=$(gh api graphql -f query='
  query($owner: String!, $repo: String!, $pr: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $pr) {
        reviewThreads(first: 100) {
          nodes { isResolved }
        }
      }
    }
  }
' -f owner="$OWNER" -f repo="$REPO" -F pr="$PR_NUMBER" \
  --jq '[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false)] | length')
```

### Re-triggering GTG CI Check

When threads are resolved but the `Merge Ready (gtg)` GitHub Actions check is stale:

```bash
gh workflow run gtg.yml -f pr_number=$PR_NUMBER
```

## Phase 3: Fixing Issues

### Simple Issues (Auto-fix)

These can be fixed without user approval:

- Lint failures → run linter
- Prettier failures → run formatter
- Type errors → fix the types
- Test failures in code YOU wrote → fix using TDD

### Complex Issues (Need Approval)

These require user input BEFORE fixing:

- Test failures in code you didn't write
- Infrastructure/config failures
- Ambiguous errors
- Anything you're uncertain about

### Architectural / Load-Bearing Issues (Advisor Escalation)

PR triage typically runs at Sonnet 4.6 + high — fine for ~90% of bot feedback (lint, JSDoc, naming, defensive copies, missing tests). The remaining ~10% — bot findings that propose changes to architectural patterns, scoring formulas, persistence invariants, or anything documented as load-bearing — Sonnet may push through without recognizing the stakes.

**Before applying any bot finding that would change behavior covered by a checked-in `.claude/rules/*.md` file in the repo (or any pattern flagged as load-bearing in the repo's CLAUDE.md), invoke `advisor()` first.** Advisor is Opus and second-opinions the change; the call is ~30–60 seconds and cheap relative to a wrong fix that breaks an invariant.

The trigger is mechanical, not judgment-based:

1. Read the bot finding.
2. Quick classification:
   - **Execution-class** (lint, JSDoc, naming, defensive copy, file-line specifics) → fix without advisor.
   - **Architectural / load-bearing** (touches code referenced by a `.claude/rules/*.md` file, changes scoring/calibration constants, modifies persistence invariants, alters lens-protected fields, etc.) → invoke advisor.
   - **Ambiguous** → invoke advisor (default to escalate; the call is cheap).
3. If advisor is invoked, surface the finding + advisor's recommendation in the PR triage comment. Don't apply silently.

This applies even at Sonnet-high effort; the issue isn't reasoning depth, it's that bots surface architectural concerns as small inline comments that look execution-class to a model not deeply familiar with the codebase. The advisor gate converts "must recognize architectural stakes mid-flight" into "must check whether the touched file is referenced by a rule file" — a deterministic check.

If repo has no `.claude/rules/`, fall back to: invoke advisor before applying any bot finding that proposes changes to established patterns, public APIs, security/persistence invariants, or anything CLAUDE.md flags as load-bearing.

### FIXING State Rules

1. **Use TDD** - Invoke `superpowers:test-driven-development` for code changes
2. **Kill stale test runners** - Run `pkill -f vitest 2>/dev/null || true` before test runs
3. **Stay until green** - Don't leave FIXING until `pnpm lint && pnpm typecheck && pnpm test --run && pnpm test:coverage` all pass
4. **Only push when verified** - Never push code that fails local validation or coverage thresholds
5. **Return to MONITORING after push** - Let CI run, continue monitoring

```bash
# Kill stale vitest processes before running tests
pkill -f vitest 2>/dev/null || true

# After fixing, always validate locally (including coverage)
pnpm lint && pnpm typecheck && pnpm test --run && pnpm test:coverage

# Only push if all pass (including coverage thresholds)
git add -A && git commit -m "fix: <description>" && git push
```

## Phase 4: Handling Reviews

When new review comments are detected:

1. Invoke the `handling-pr-comments` skill
2. That skill handles categorization, fixes, responses, and thread resolution — including the **materiality-gated re-trigger** of whichever bots this round warrants after the round's fixes are pushed (see § "Bot reviews — manual triggers, chosen within each bot's cap"; only a behavior-changing round owes a re-trigger at all)
3. **CRITICAL: The handling-pr-comments skill includes an iteration loop**
4. **ALL threads must be resolved** before returning to MONITORING
5. If a thread cannot be resolved (needs clarification from reviewer), query the comment author asking for follow-up
6. Return to MONITORING only when:
   - All threads are resolved, AND
   - Post-push verification confirms NO new comments appeared

### Iteration Enforcement

**THE #1 FAILURE MODE**: Returning to MONITORING after one pass without checking for new comments.

The `handling-pr-comments` skill's Phase 7 (Post-Push Iteration Check) MUST complete successfully before exiting HANDLING_REVIEWS state. The skill will iterate automatically:

```text
HANDLING_REVIEWS:
  → handling-pr-comments skill (Phases 1-7)
  → IF Phase 7 finds new comments: skill re-runs Phases 1-7
  → IF Phase 7 confirms no new comments: exit to MONITORING
```

**DO NOT** manually override or skip Phase 7. If you find yourself tempted to skip iteration, you're about to make the #1 mistake.

### Out-of-Scope Comments

Reviewers may leave comments on code outside the PR diff. The `handling-pr-comments` skill handles these, but key points:

- **Treat out-of-scope as IN SCOPE by default** - respect reviewer feedback
- Use **ultrathink** to evaluate if fixes are quick (< 30 min, < 3 files)
- If simple: fix immediately and note it was outside original scope
- If complex: create a GitHub issue and link it in the thread response
- **Always respond and resolve** - never leave out-of-scope threads hanging

## Phase 5: Waiting for User

When user input is needed, ALWAYS:

1. **Present the situation clearly**
2. **Offer 2-4 options with pros/cons**
3. **State your recommendation**
4. **Allow user to choose OR provide their own approach**

### Template

```text
[Describe what happened]

**Options:**

1. **[Option name]** (Recommended)
   - [What it involves]
   - Pros: [benefits]
   - Cons: [drawbacks]

2. **[Option name]**
   - [What it involves]
   - Pros: [benefits]
   - Cons: [drawbacks]

3. **[Option name]**
   - [What it involves]
   - Pros: [benefits]
   - Cons: [drawbacks]

Which approach would you like? (Or describe a different approach)
```

### After User Responds

- If user picks a numbered option → proceed with that approach → FIXING
- If user describes alternative → proceed with their approach → FIXING

## Phase 6: Soft Timeout (4 Hours)

At 4 hours elapsed, pause and checkpoint:

```text
**PR Shepherd Checkpoint** (4 hours elapsed)

Current status:
- CI: [status]
- Threads: [X] resolved, [Y] unresolved
- Commits: [N] fix commits pushed

**Options:**

1. **Keep monitoring** (Recommended)
   - Continue for another 4 hours
   - Pros: PR may get reviewed soon
   - Cons: Ties up agent resources

2. **Exit with handoff**
   - Save status report, exit cleanly
   - Pros: Frees resources
   - Cons: Must manually re-invoke later

3. **Set shorter check-in**
   - Check back in 1 hour instead of 4
   - Pros: More frequent checkpoints
   - Cons: More interruptions

What would you like to do? (Or describe a different approach)
```

## Exit Conditions

### Success (DONE)

Exit successfully when ALL are true:

- All CI checks passing
- **Every single** code review comment has been addressed (fix or explanation -- NONE ignored)
- All review threads resolved (zero unresolved)
- No pending questions
- Every bot round this PR **owed** (§ "Bot reviews" — Materiality) has actually run and is clean **at the SHA it ran against**, confirmed first-party by reading the artifact, not by recalling an earlier check
- PR squash-merged to main (not just "ready to merge" -- actually merged)

**Before handing back an open PR, don't call it ready on stale evidence.** "I handled this earlier" is not confirmation — re-check the live artifact for each owed round right before you report. Platform signals (`mergeable`, `mergeStateStatus`) never substitute for this; they report conflicts and required checks only.

Report, with the verdict stated explicitly in one line — never leave it implied by "awaiting merge":

```text
**PR #[number] Status**

- CI: All checks passing
- Reviews: All threads resolved
- Bot rounds: [which ran, at which SHA, clean; which owed round was skipped and why, if any]
- Commits: [N] total ([M] fix commits)

Ready to merge (my assessment): YES — every owed round clean at <sha>, CI green.
```

If a round is technically owed but not warranted (§ "Bot reviews" — Materiality / the three-round cap), the verdict is still **YES**, with one line naming the skipped round and why. Reserve **NO** for a substantively outstanding item — a round in flight, an unfixed finding, red CI, real un-reviewed risk — never for a process technicality. A round genuinely in flight is not a hand-back moment: stay quiet with the monitor armed (§ "Awaiting a bot's review round") and report once it lands, rather than handing back an interim "waiting" update with a verdict attached.

### Post-Completion RAM Cleanup

After the PR is merged and knowledge extraction tasks are created, invoke automatic RAM cleanup to free resources:

```text
/auto-ram-cleanup
```

**Why**: Development processes (test runners, build watchers, language servers) accumulate during PR work. Cleaning up after merge frees memory for the next task.

**What stays running**:

- Docker containers (needed for database/services)
- Essential IDE processes

**What gets cleaned**:

- Orphaned test runners (vitest, jest)
- Build watchers no longer needed
- Duplicate language server instances
- Other development tool cruft

## Phase 7: Post-Merge Verification & Fallback Knowledge Extraction

**Primary path**: Self-reflect should have already run pre-PR (see orchestrated-execution section 8.5), with knowledge base changes committed as part of the PR. This phase verifies that happened and handles the fallback case.

**Fallback**: If self-reflect was NOT run pre-PR (e.g., PR was created outside the orchestrated workflow), create a blocking task for knowledge extraction after merge.

### When PR is Merged

After detecting that the PR has been merged (or after user merges it):

```bash
# Check if PR was merged
MERGED=$(gh pr view $PR_NUMBER --json merged -q .merged)

if [ "$MERGED" = "true" ]; then
  # Create a task for knowledge curation
  # Use your project's task tracking system
  echo "Create task: Curate learnings from PR #$PR_NUMBER"

  # If there's an associated epic, add this task as a blocker
  # (The epic can't close until learnings are extracted)
fi
```

**Note**: Self-reflect (`/self-reflect`) should have already run BEFORE the PR was created (see orchestrated-execution skill, section 8.5). If it was skipped, run it now as a fallback — but the preferred time is pre-PR while implementation context is freshest.

### Report to User

When creating the curation task:

````text
**PR #[number] Merged Successfully**

Created blocking task: [CURATION_TASK_ID]
- Title: "Curate learnings from PR #[number]"
- Status: pending
- Blocker for: [epic if applicable]

To extract learnings, invoke:
```
/curate-pr-learnings [number]
```

The command will:
1. Fetch PR comments (deterministic script)
2. AI analyzes and extracts learnings (your job)
3. Store validated learnings (deterministic script)

Then close the task.
````

### Why This Matters

1. **Security**: Webhook-triggered code execution is an attack surface. CLI/agent invocation is safer.
2. **Blocking Task**: The epic can't close until learnings are extracted, ensuring knowledge capture.
3. **Agent Autonomy**: An agent can pick up the curation task and process it.
4. **Human Oversight**: Human can also run curation manually via the CLI script.

### For Epic Completions: Extract Conversation Learnings

When this PR completes an **epic** (closes the last blocking task), you MUST also extract learnings from conversation history. Feature work often contains the richest architectural discussions.

**Detect epic completion:**

> **Note**: This pattern assumes single-epic workflows. If multiple epics are in-progress,
> `.[0]` selects the first one, which may not be the epic related to this PR.
> For multi-epic projects, correlate the PR's task to its blocking epic manually.

```bash
# Check if this PR closes an epic (assumes single in-progress epic)
# Use your project's task tracking system to check epic status
```

**If epic is completing:**

1. Create a task for conversation extraction
2. Report the task to user:

   ```text
   **Epic Completion Detected**

   This PR completes the epic. Created conversation extraction task.

   Before closing the epic, extract learnings from conversations.
   ```

**Why extract from conversations?**

- **Strategic insights**: Architectural decisions, trade-offs discussed
- **Debugging discoveries**: Root causes found after hours of investigation
- **Non-obvious behaviors**: "It turns out that..." moments
- **Integration quirks**: API behaviors that caused issues

These learnings are often NOT in code review comments - they're in the back-and-forth conversation.

### Timeout with Handoff

If user chooses to exit at checkpoint:

```text
**PR #[number] Shepherd Handoff**

Status at exit:
- CI: [status]
- Threads: [X] resolved, [Y] unresolved
- Last activity: [timestamp]

To resume: `/pr-shepherd [number]`
```

## Skills Invoked

| Situation           | Skill                                 |
| ------------------- | ------------------------------------- |
| New review comments | `handling-pr-comments`                |
| Code changes needed | `superpowers:test-driven-development` |
| Complex debugging   | `superpowers:systematic-debugging`    |

## Mandatory Pre-Completion Check

**BLOCKING: You MUST run this script and show its output before declaring ANY PR ready:**

```bash
bin/pr-comments-check.sh <PR_NUMBER>
```

This script:

- Returns exit code 0 if all comments addressed
- Returns exit code 1 if ANY unaddressed comments exist
- Shows status for each comment

**If the script shows ANY unaddressed comments, you are NOT done.** Address each unaddressed comment:

For EACH top-level comment (where `in_reply_to_id` is null) without a reply:

1. If actionable → Fix it and reply confirming the fix
2. If out-of-scope → Reply explaining deferral (create issue if needed)
3. If disagree → Reply with reasoning
4. **NEVER ignore silently**

A PR is NOT ready until every top-level comment has been addressed with a reply.

## Verification Checklist

Before exiting DONE state:

- [ ] All CI checks are green
- [ ] All review threads are resolved
- [ ] No pending user questions
- [ ] Final status reported to user

After PR is merged (Phase 7):

- [ ] Created task for knowledge curation
- [ ] Added task as blocker to epic (if applicable)
- [ ] Reported curation task ID to user
- [ ] Verified `/self-reflect` ran pre-PR (if not, run it now as fallback)

After all post-merge tasks complete:

- [ ] Ran `/auto-ram-cleanup` to free development resources
- [ ] Confirmed Docker containers still running (if needed)

## Common Mistakes

### #1 MISTAKE: Returning to MONITORING without checking for NEW comments

- After pushing a fix and responding to threads, you MUST run Phase 7
- No bot auto-reviews except Gemini (once, at open, never on push) — **CodeRabbit, Cursor Bugbot, Copilot, and Codex only review when you trigger them**, per their own cap and placement (§ "Bot reviews — manual triggers, chosen within each bot's cap") — so the new comments you're checking for arrive only after that trigger.
- NEW comments often appear within 1-2 minutes of your push (or your re-trigger)
- If you skip Phase 7, you'll miss the new comments and declare complete prematurely

**Pushing without local validation**

- NEVER push code that hasn't passed `pnpm lint && pnpm typecheck && pnpm test --run && pnpm test:coverage`

**Auto-fixing complex issues**

- If uncertain, ASK. Always go through WAITING_FOR_USER for complex issues.

**Forgetting to invoke handling-pr-comments**

- When new comments arrive, delegate to that skill. Don't handle comments inline.

**Not presenting options to user**

- Always give 2-4 options with pros/cons. Never just ask "what should I do?"

**Leaving FIXING state early**

- Stay in FIXING until local validation passes. Don't assume a fix worked.

**Skipping the handling-pr-comments iteration loop**

- The skill has Phases 1-7 with an explicit iteration loop
- Phase 7 checks for new comments after your fix push
- If Phase 7 finds new comments, the skill loops back to Phase 1
- DO NOT exit early - let the skill complete its full iteration
