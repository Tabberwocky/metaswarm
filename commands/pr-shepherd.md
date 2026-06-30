---
description: Open a PR (if needed) and monitor it through to merge - handles CI failures, reviews, and thread resolution
---

# PR Shepherd

Open a PR (if one doesn't exist yet) and monitor it through merge, handling CI failures, review comments, and thread resolution automatically.

## Usage

```text
/pr-shepherd [pr-number]
```

If no PR number is provided, uses the PR on the current branch — and if the branch has **no PR yet**, pr-shepherd **opens one** (Phase 0) before monitoring.

## What This Does

1. **Opens the PR if none exists** - Phase 0: push, create the PR, trigger initial reviews (skipped when a PR already exists)
2. **Monitors CI/CD** - Watches for state changes via the `Monitor` tool (event-driven, not fixed-interval)
3. **Monitors Reviews** - Watches for new comments and unresolved threads
4. **Triggers CodeRabbit + Copilot reviews** - Manually, by default (they no longer auto-review); re-triggers per fix round. See the pr-shepherd skill § "Bot reviews are manually triggered."
5. **Auto-fixes simple issues** - Lint, prettier, type errors
6. **Asks before complex fixes** - Presents options with pros/cons for approval
7. **Handles review comments** - Delegates to `handling-pr-comments` skill
8. **Checkpoints at 4 hours** - Asks if you want to continue or handoff

## Steps

1. **Get PR information (or open one)**:

   ```bash
   PR_NUMBER=${1:-$(gh pr view --json number -q .number 2>/dev/null)}
   # If no PR exists for this branch, the skill's Phase 0 opens one (push + gh pr create + initial bot triggers).
   ```

2. **Activate the pr-shepherd skill**:
   Load and follow the pr-shepherd skill definition.

3. **Begin monitoring via the `Monitor` tool** (see the pr-shepherd skill for the canonical script):
   - Check CI status
   - Check for new review comments
   - Check unresolved thread count
   - Take action based on state machine

4. **Handle issues as they arise**:
   - Simple CI failures -> auto-fix with TDD
   - Complex failures -> present options, wait for approval
   - New comments -> invoke `handling-pr-comments` skill

5. **Exit when done**:
   - All CI green AND all threads resolved -> report success
   - 4-hour timeout -> checkpoint with user

## Example

```text
/pr-shepherd 695

> I'm using the pr-shepherd skill to monitor PR #695 through to merge.
> I'll watch CI/CD, handle review comments, and fix issues as they arise.
>
> Current status:
> - CI: Running (2/5 checks complete)
> - Threads: 0 unresolved
>
> Monitoring... (events arrive on state change)
```

## Notes

- The agent stays active until the PR is ready to merge or you stop it
- All code changes use TDD process
- Complex issues always get user approval before fixing
- Uses `handling-pr-comments` skill for review comment handling
- **Bots are invoked, not awaited**: CodeRabbit + Copilot don't auto-review; pr-shepherd triggers both by default on open and per fix round (opt out only in the invoking prompt; only the bots configured on the repo). Cursor/Gemini still auto-review on push.
