# `/decompose` vs `plan-review-gate` — Empirical Case

## Why the two gates exist

`plan-review-gate` spawns 3 adversarial reviewers (Feasibility, Completeness, Scope & Alignment) who read the plan and return binary PASS/FAIL per reviewer. Each reviewer evaluates work units individually against the user's request and against its specific lens.

`/decompose:decompose` (from the `decompose` plugin) traces the work-unit graph, analyzing data flow and cross-WU contracts. It returns a constructive DAG structure plus classified findings (blocking / major / minor / nit).

## Empirical case: jb1-un0e (Phase 1 collision oracle)

**Setting:** jb1-un0e is a bead tracking the Phase 1 MVP of a visual collision oracle — 9 work units producing ~1500 LOC across 5 new files. Non-trivial, multi-component, claimed parallelism in two places.

**plan-review-gate result:** 3/3 Opus reviewers returned PASS on the first iteration. The reviewers correctly caught severity calibration issues (WU-6 opacity DoD too ambitious, WU-3 perf envelope too loose), completeness gaps (self-application framing), and effort-estimate optimism. All surface-level.

**/decompose result:** 7-node DAG found 8 structural issues. Severity breakdown:

| # | Finding | Severity |
|---|---------|----------|
| F1 | WU-1 ‖ WU-2 circular dependency (selectorInventory ↔ scenario selectors) | **Blocking** |
| F2 | WU-4 ↔ WU-7 crop/outline ownership contradiction | **Blocking** |
| F3 | Missing integration gate before WU-9 acceptance tests | **Major** |
| F4 | "Extract if needed" handwave hiding a real sub-WU | **Major** |
| F5 | WU-3 DoD target unvalidatable at WU-3's scale | **Minor** |
| F6 | Hotspot/forbiddenPair merge semantics undefined between WU-1 and WU-2 | **Minor** |
| F7 | WU-5 ↔ WU-6 tight coupling — iteration risk | **Minor** |
| F8 | WU-9 injection technique unspecified | **Minor** |

## Estimated cost if skipped

| Class | Time lost |
|---|---|
| Blocking (F1, F2) | ~3–4.5h of wasted subagent work + reconciliation |
| Major (F3, F4) | ~1.5h of rework; higher silent-drop risk (F3 could have allowlisted real regressions) |
| Minor (F5, F6, F8) | ~1–2h of scattered friction |
| **Total** | **~5.5–8h** plus intangibles (PR review thrashing, reviewer fatigue, future-agent confusion over messy contracts) |

The `/decompose` gate itself cost ~10 minutes of dispatch and ~30 minutes of fix application.

## Key insight: why plan-review-gate missed these

Plan-review-gate's reviewers are prompted to check:

- Does each WU map to the user's request? (Reviewer 2 Completeness)
- Is each WU feasible against the real codebase? (Reviewer 1 Feasibility)
- Does the scope match the user's ask? (Reviewer 3 Scope)

None of these prompts cross-check WU A's output contract against WU B's input contract. Each reviewer reads WUs individually. The circular dependency in WU-1 ↔ WU-2 was invisible to every reviewer because the cross-reference only appears when you examine both WUs' DoDs side by side.

Reviewer 1 Feasibility does have `No cycles` and `Dependency ordering correct` as criteria, but it's a manual checkbox against the declared dep graph. Implicit deps — the ones that actually bit us — are not in the declared graph. `/decompose` traces the graph from data flow; the reviewer traces from the author's stated deps.

## When to run each

| Plan shape | plan-review-gate | `/decompose` |
|---|---|---|
| 1 WU, trivial | skip (trivial changes exempt) | skip |
| 2–3 WUs, linear | required if 3+ files affected | agent-judged; run if cross-WU data flow, synthesis required, or integration with existing systems |
| 4+ WUs OR any claimed parallelism | required | required |

## Handoff

1. `plan-review-gate` returns 3/3 PASS
2. If plan qualifies (per table above), invoke `/decompose:decompose`
3. Apply `blocking` and `major` findings to the plan inline
4. Record decompose-gate audit in plan frontmatter under `decompose-gate:`
5. Proceed to `orchestrated-execution` — do NOT re-run `plan-review-gate` (the fixes tighten structure, not intent; plan-review has already validated intent)

## References

- `skills/plan-review-gate/SKILL.md` § Downstream DAG Validation
- `skills/orchestrated-execution/SKILL.md` § Dependency Graph Validation
- `commands/start-task.md` Orchestrated Execution flow step 3
- jb1-specific rubric: `.claude/rules/plan-decomposition.md` in the jb1 repo
