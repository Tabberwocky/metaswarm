---
name: handling-pr-comments
description: Address PR review feedback systematically — fetch inline comments, review bodies, handle outside-diff-range comments, resolve threads with proper attribution
---

# handling-pr-comments

Use when addressing PR review feedback, after receiving review comments from CodeRabbit, Copilot, Cursor, or human reviewers - ensures systematic responses to each comment thread with proper attribution and thread resolution.

## When to Activate

Activate this skill when ANY of these conditions are true:

- User asks to "address PR comments" or "handle review feedback"
- User mentions CodeRabbit, Copilot, Cursor bot, or reviewer comments
- User is working on fixes requested in a PR review
- User asks to "check PR comments" or "respond to reviewers"
- After making fixes to address review feedback

## CRITICAL: The Complete Workflow

**Most developers forget steps 4-6. This skill ensures they happen.**

### Phase 1: Discover and Filter Comments

Run the filtering script to identify actionable comments:

```bash
# Filter actionable vs non-actionable comments
bin/pr-comments-filter.sh <PR_NUMBER>
```

This script:

- Filters out non-actionable comments (confirmations, acknowledgments, fingerprinting)
- Categorizes actionable comments by priority (Critical → Low)
- Shows comment IDs and details for processing

### Phase 2: Triage Actionable Comments

The filter script categorizes by priority:

| Priority        | Marker                                                   | Action           |
| --------------- | -------------------------------------------------------- | ---------------- |
| CRITICAL        | `_⚠️ Potential issue_ \| _🔴 Critical_`                  | Fix immediately  |
| HIGH            | `_⚠️ Potential issue_ \| _🟠 Major_`                     | Fix before merge |
| MEDIUM          | `_🟡 Minor_` or `_🛠️ Refactor suggestion_ \| _🟠 Major_` | Should fix       |
| LOW             | `_🔵 Trivial_` / `_🧹 Nitpick_`                          | Fix if quick     |
| HUMAN           | Non-bot comments                                         | Always process   |

For each actionable comment, further categorize as:

1. **Bug/Issue** - Must fix
2. **Enhancement** - Should fix
3. **Nitpick** - Nice to fix
4. **Question** - Needs clarification
5. **Intentional** - Decline with explanation
6. **Out-of-Scope** - See Phase 2b

### Phase 2a: Proportional Response Assessment

**The original "fix everything, no exceptions" policy is wrong.** Treating every bot comment as equally mandatory wastes effort on false positives, theoretical edge cases, and style-only nits. Calibrate the response to actual risk using a likelihood × impact model (adapted from jb1's `be_practical/risk_and_mitigations.md`).

**Always-fix carve-outs (skip the matrix, just fix):**

- **Correctness** — the comment identifies a real bug, broken behavior, or incorrect logic.
- **Security / privacy / data integrity / money / regulatory** — fix properly regardless of how rare the trigger seems.
- **Human comments** — non-bot reviewer feedback is always addressed, never triaged away.

For everything else (bot nitpicks, refactor suggestions, defensive-coding asks, style preferences), classify on two axes:

- **Likelihood** the issue actually occurs: common, occasional, rare, or theoretical.
- **Impact** if it does: serious, moderate, or minor.

| Likelihood ↓ / Impact → | Serious | Moderate | Minor |
| ----------------------- | ------- | -------- | ----- |
| **Common / Occasional** | Fix thoroughly | Fix | Fix if quick, else push back |
| **Rare** | Fix (simple, local) | Simple local fix or push back | Push back or note as acceptable |
| **Theoretical** | Simple guard or note | Push back | Push back / acceptable as-is |

**Push back requires evidence.** Disagreement with a bot is only credible when grounded in the code, not assertion. Before declining, cite at least one of:

- A **code reference** showing the concern is already handled (the guard, the caller contract, the validation).
- A **type constraint** that makes the flagged state unreachable.
- An **existing test or mechanism** that already covers the case.

If you can't point to one of those, treat the finding as valid and fix it.

**Response templates** (full reply wording lives in Response Templates below — these are the triage shapes):

- **False positive** — "This is a false positive: <code reference showing why>. No change needed."
- **Dead-code guard** — "The flagged branch is unreachable because <type/caller constraint>. Declining to add a guard for a state that can't occur."
- **DRY violation (low value)** — "Noted. The duplication is <N> lines across <M> sites with diverging intent; extracting now would couple them prematurely. Declining per proportional triage."
- **Style preference** — "Style preference without a correctness or readability delta here; leaving as-is to keep the diff scoped."

**Deferred valuable feedback** — if a pushed-back finding is genuinely valuable but out of scope for this PR, do not silently drop it: capture it per the deferred-feedback capture protocol (see Phase 2c / the repo's no-silent-drops Tracking-item protocol).

### Phase 2b: Extract "Outside Diff Range" Comments from Review Bodies (CRITICAL)

**COMMONLY MISSED**: CodeRabbit posts "Outside diff range" comments in the **review body**, not as inline threads. These are actionable feedback that MUST be addressed.

```bash
# Extract Outside diff range comments from review bodies
PR_NUMBER=<number>
OWNER=$(gh repo view --json owner -q .owner.login)
REPO_NAME=$(gh repo view --json name -q .name)

echo "=== OUTSIDE DIFF RANGE COMMENTS ==="
gh api "repos/$OWNER/$REPO_NAME/pulls/$PR_NUMBER/reviews" --paginate | \
  jq -r '.[] | select(.body | test("Outside diff range"; "i")) |
    "Review ID: \(.id)\n\(.body)\n---"'
```

**These comments are NOT in threads** - they cannot be replied to inline. You must:

1. Parse the file paths and line numbers from the review body
2. Address the feedback in your code
3. Commit and push
4. Leave a general PR comment acknowledging you addressed them

### Phase 2c: Handle Other Out-of-Scope Comments

Run the out-of-scope detection script:

```bash
# Detect out-of-scope comments
bin/pr-comments-out-of-scope.sh <PR_NUMBER>
```

This script detects comments that:

- Reference lines NOT in the PR diff
- Are marked "outdated" by GitHub (GraphQL `isOutdated` flag)
- Are general PR discussion comments

**IMPORTANT**: Treat out-of-scope comments as **IN SCOPE** by default.

#### Evaluation Process

Use **ultrathink** to evaluate each out-of-scope comment:

```text
ultrathink: Analyze this out-of-scope review comment:
- What is the reviewer asking for?
- How complex is this change? (lines of code, files affected)
- Does it require refactoring other systems?
- Can I complete this in under 30 minutes?
- Are there any risks or dependencies?

Recommend: FIX_NOW or CREATE_ISSUE
```

#### Decision Matrix

| Criteria                                      | Action                                    |
| --------------------------------------------- | ----------------------------------------- |
| Simple fix (< 30 min, < 3 files, no refactor) | **FIX_NOW** - Make the change immediately |
| Medium complexity (unclear scope)             | **ASK_USER** - Present options            |
| Major refactor (multiple systems, risky)      | **CREATE_ISSUE** - Document for follow-up |

#### For FIX_NOW

1. Make the fix
2. Commit with descriptive message
3. Push to the PR branch
4. Reply: "Fixed in commit <hash>. This was outside the original PR scope but straightforward to address."
5. Resolve the thread

#### For CREATE_ISSUE

1. File the deferred item via the **Deferred-Feedback Capture Protocol** below (creates the cross-linked bead + GitHub issue).
2. Reply: "Created issue #<number> (tracked as <bead-id>); resolving thread."
3. Resolve the thread

#### Deferred-Feedback Capture Protocol

This is the canonical capture flow for **valuable** deferred bot feedback — out-of-scope or not-now but worth tracking. The Phase 2a "deferred valuable feedback" pointer resolves here. (Dismissed false-positives and pure nits get no tracking item — see Phase 2a.)

Follow the canonical rule at `~/.claude/rules/no-silent-drops.md` § "Tracking-item protocol". The essentials an agent must apply here:

- **Always create BOTH a bead AND a GitHub issue, cross-linked bidirectionally.** The bead body holds the issue URL, *and* the issue body holds the bead id — the cross-link runs both directions (bead ↔ issue), not just bead → issue.
- **The bead**: title derived from the finding; body with the original bot comment text + file paths + the GitHub issue URL; priority from the Phase 2a likelihood × impact assessment; labels `bot-feedback` and `deferred`.
- **The issue**: context for the finding, plus the **bead id in the issue body** (the reverse half of the cross-link).
- **Delegate the filing when it's cheaper**: dispatch a low-cost subagent (Haiku/Sonnet-class — the work is mechanical) to create the bead + issue and return the issue # and bead id, whenever the orchestrating agent is on an expensive model / high effort, or filing inline would pile unneeded context onto it. File inline only when dispatch overhead would exceed the savings.

This ensures valuable out-of-scope feedback survives PR closure and is discoverable by future agents via `bd ready` or `bd search`, with the GitHub issue and bead pointing at each other.

### Phase 3: Make Fixes

Fix the actual code issues. Commit and push.

### Phase 4: RESPOND TO EACH THREAD (Often Forgotten!)

**After pushing fixes, respond to EACH comment thread individually:**

```bash
PR_NUMBER=<number>
OWNER=$(gh repo view --json owner -q .owner.login)
REPO_NAME=$(gh repo view --json name -q .name)
CURRENT_USER=$(gh api user -q '.login')
COMMENT_ID=<id-from-filter-script>

gh api "/repos/$OWNER/$REPO_NAME/pulls/$PR_NUMBER/comments/$COMMENT_ID/replies" \
  -X POST \
  -f body="Fixed in commit $(git rev-parse --short HEAD).

*(Response by Claude on behalf of @$CURRENT_USER)*"
```

### Phase 5: Resolve ALL Threads

**Every thread must be resolved after responding.** Whether to resolve a thread yourself (vs. leaving it for the human reviewer to close) is your discretion — the owner ruling here is that either is fine. If you do resolve individual threads, prefer dispatching that per-thread work to a subagent where feasible, so per-thread context doesn't pile up in the main session. Use GraphQL to resolve:

```bash
THREAD_ID="PRRT_kwDOK-xA485..."  # From GraphQL query

gh api graphql -f query='mutation {
  resolveReviewThread(input: {threadId: "'"$THREAD_ID"'"}) {
    thread { id isResolved }
  }
}'
```

### Phase 6: Handle Threads That Can't Be Resolved

1. **Query the comment author** asking for specific follow-up
2. **Do NOT leave unresolved** - either resolve after responding, or ask for clarification
3. If waiting for author response, mark as needing user input

### Phase 7: Post-Push Iteration Check (MANDATORY)

**THE #1 WORKFLOW FAILURE: Stopping after Phase 5-6 without checking for NEW comments.**

**No bot auto-reviews except Gemini** (once, at PR open, never on push). CodeRabbit, Cursor Bugbot, Copilot, and Codex are all comment-triggered or requested-reviewer bots — none re-review on their own (see the pr-shepherd skill § "Bot reviews — manual triggers, chosen within each bot's cap"). So when this fix round **changed behavior** (§ Materiality in that section — doc/test-only/nit rounds owe none), re-trigger the bots this round warrants, within their caps, *before* watching for the resulting comments — otherwise their reviews silently go stale.

```bash
# STEP 0: Re-trigger the bots this round owes — ONLY if the round changed behavior (§ Materiality).
#   Doc/test-only/nit rounds owe no re-trigger and converge locally.
#   Only the bots actually configured on this repo; assumes auto-review is disabled owner-side.
#   Always "full review" for CodeRabbit — never the incremental trigger, which silently no-ops on already-reviewed commits.
#   CodeRabbit:    gh pr comment "$PR_NUMBER" --body "@coderabbitai full review"
#   Cursor Bugbot: gh pr comment "$PR_NUMBER" --body "bugbot run"   # standalone top-level only, never combined with another trigger, never more than once per PR — held back until the first logic-changing round
#   Codex:         top-level mention + exactly the word "review"    # up to 3 uses per PR
#   Copilot:       once, at open only, opt-in on smaller high-impact PRs — no per-round re-request (exception: once, if the earlier review was an error notice)
#   Gemini:        top-level "/gemini review" — only to cover a SHA past its free open-PR pass
#                (exact gh mechanic and per-bot caps in pr-shepherd § "Bot reviews — manual triggers, chosen within each bot's cap")
#   Batch this round's fixes into one push, then trigger each chosen bot once — never a review per commit.
#   Any throttle/quota/rate-limit notice from any bot: don't re-fire, don't re-route on your own — stop and check in with the user.

# STEP 1: Watch for ALL CI/CD checks to complete via the Monitor tool
PR_NUMBER=<number>
# Use the Monitor tool to watch for state changes (see the pr-shepherd skill for the canonical script).
# Monitor streams events only on state change, so quiet periods cost 0 tokens — strictly cheaper than
# blocking the agent on CI completion or waking it on a fixed polling interval.
# This watches CI only — it is not a bot-round verification. For each bot triggered in STEP 0, wait for
# its own artifact with ONE one-shot Monitor for the whole round, keyed to each bot's clean/findings signal (see the
# pr-shepherd skill § "Awaiting a bot's review round"), not by polling turns or treating the trigger's ack as done.

# STEP 2: Check for NEW comments since your last response
OWNER=$(gh repo view --json owner -q .owner.login)
REPO_NAME=$(gh repo view --json name -q .name)
CURRENT_USER=$(gh api user -q '.login')

# Get timestamp of your last reply
LAST_REPLY=$(gh api "repos/$OWNER/$REPO_NAME/pulls/$PR_NUMBER/comments" --paginate | \
  jq -r "[.[] | select(.user.login == \"$CURRENT_USER\") | select(.in_reply_to_id)] | sort_by(.created_at) | last | .created_at")

# Handle case where user has no previous replies
if [ -z "$LAST_REPLY" ] || [ "$LAST_REPLY" = "null" ]; then
  echo "No previous replies found - checking all comments as new"
  LAST_REPLY="1970-01-01T00:00:00Z"  # Unix epoch - treat all comments as new
fi

# Check for new comments after that time
NEW_COUNT=$(gh api "repos/$OWNER/$REPO_NAME/pulls/$PR_NUMBER/comments" --paginate | \
  jq -r --arg time "$LAST_REPLY" '[.[] | select(.in_reply_to_id == null) | select(.created_at > $time)] | length')

# STEP 3: Also check review bodies for new "Outside diff range" comments
NEW_REVIEWS=$(gh api "repos/$OWNER/$REPO_NAME/pulls/$PR_NUMBER/reviews" --paginate | \
  jq -r --arg time "$LAST_REPLY" '[.[] | select(.submitted_at > $time) | select(.body | test("Outside diff range"; "i"))] | length')

TOTAL_NEW=$((NEW_COUNT + NEW_REVIEWS))

if [ "$TOTAL_NEW" -gt 0 ]; then
  echo "$NEW_COUNT NEW INLINE COMMENT(S) + $NEW_REVIEWS NEW REVIEW BODY COMMENT(S) DETECTED"
  echo "ACTION: Return to Phase 1 and iterate"
else
  echo "No new comments - safe to proceed to verification"
fi
```

**If NEW comments found**: Return to Phase 1. DO NOT proceed to verification.

**Iteration Loop**:

```text
REPEAT:
  Phase 1: Discover comments
  Phase 2: Triage (apply Phase 2a proportional assessment to each bot finding)
  Phase 3: Fix
  Phase 4: Respond
  Phase 5: Resolve threads
  Phase 6: Handle unclear threads
  Phase 7: Check for NEW comments after push (use Monitor to watch for new reviews/comments)

  IF new comments found → GO TO Phase 1
  IF no new comments → proceed to verification
```

## Response Templates

### For Fixes Made

```text
Fixed in commit <hash>.

*(Response by Claude on behalf of @username)*
```

### For Acknowledged Nitpicks

```text
Acknowledged - this is a valid suggestion. Deferring to a future cleanup PR to keep this PR focused.

*(Response by Claude on behalf of @username)*
```

### For Intentional Decisions

```text
This is intentional because [reason]. The [thing] is designed to [explanation].

*(Response by Claude on behalf of @username)*
```

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

1. If actionable → Fix it and reply confirming the fix
2. If out-of-scope → Reply explaining deferral (create issue if needed)
3. If disagree → Reply with reasoning
4. **NEVER ignore silently**

**You must show the script output in your response** as proof that all comments are addressed. Example:

```
Checking PR #908 for unaddressed comments...

=== Inline Code Review Comments ===
Comment 123 by cursor[bot] - 1 reply(s) [OK]
Comment 456 by coderabbitai[bot] - 1 reply(s) [OK]

=== General PR Discussion Comments ===
coderabbitai[bot]: <!-- summary -->...

All inline review comments have been addressed
```

A PR is NOT ready until this script returns success.

## Verification Checklist

Before declaring PR comments handled:

- [ ] Ran `bin/pr-comments-filter.sh <PR>` to identify actionable comments
- [ ] **CRITICAL**: Extracted "Outside diff range" comments from review bodies (Phase 2b)
- [ ] Ran `bin/pr-comments-out-of-scope.sh <PR>` to find other out-of-scope feedback
- [ ] Code fixes have been made and pushed
- [ ] Each comment thread has a response posted
- [ ] "Outside diff range" comments addressed with a general PR comment
- [ ] **POST-PUSH CHECK**: Waited for CI/CD to complete, checked for NEW comments
- [ ] **NO new comments found** after the post-push check (iterate if found)
- [ ] **ALL threads have been resolved** (no unresolved threads remaining)
- [ ] All responses include proper attribution
- [ ] Out-of-scope comments have been either fixed OR have GitHub issues created
- [ ] Every bot round this PR owed (§ Materiality, pr-shepherd skill) is confirmed clean at the SHA it ran against, from the bot's own artifact — not the trigger's ack

**DO NOT skip the "Outside diff range" check (Phase 2b) - this is the #2 cause of incomplete PR handling.**

## Reference

For the complete detailed workflow with all edge cases and troubleshooting, see:
the `/metaswarm:handle-pr-comments` command
