# Reviewer Calibration Rubric

**Used By**: Every automated review surface (design, plan, adversarial implementation, and cross-model reviewers)
**Purpose**: A portable, project-neutral contract for how reviewers classify findings by severity and decide what blocks
**Version**: 1.0

---

## Why this rubric exists

Automated reviewers tend to over-block: they flag every concern at the highest severity, default ambiguous findings to "blocking," and gold-plate the implementation with speculative improvements. The result is review churn that is disproportionate to actual risk — real defects get buried under nits, and authors learn to discount reviewer output wholesale.

This rubric calibrates that. It defines a shared severity scale, a likelihood × impact method for assigning severity, and a mapping from severity to a blocking or non-blocking disposition. Every reviewer loads this rubric **before** classifying findings, then applies its own domain rubric on top.

This rubric is intentionally project-neutral. It carries no product names, no domain-specific perception rules, no tracking-system requirements, and no repo-local rule-file paths. Repo-local overlays may add stricter rules on top of this baseline; this rubric is the floor, not the ceiling.

---

## Scope discipline (what a finding may be about)

A review finding must be **in scope** to count toward a blocking verdict. In scope means: the finding is about the change under review and its stated contract (the spec, the Definition of Done, the user's request, or the acceptance criteria), not about adjacent code the change did not touch.

- **In scope**: the change introduces a defect, omits a stated requirement, violates the contract, or regresses existing behavior the change interacts with.
- **Out of scope**: pre-existing issues in untouched code, broad refactors the change did not request, and architectural preferences the contract did not call for.

Out-of-scope observations are still worth recording — they become **Follow-up** items (see below). They do not block.

---

## YAGNI / KISS for recommendations

When a reviewer is tempted to *recommend* additional work, apply two filters before raising it above a note:

- **YAGNI (You Aren't Gonna Need It)**: do not require speculative generality, extension points, or handling for inputs the contract does not mention. "Might need it later" is not a present requirement.
- **KISS (Keep It Simple)**: prefer the simplest implementation that satisfies the contract. A reviewer must not block a change for failing to adopt a more elaborate pattern when the simple one meets the spec.

A recommendation that fails these filters is at most a **Minor** or **Follow-up** note, never a blocker.

---

## Severity calibration: likelihood × impact

Assign severity from two axes, judged against realistic conditions — not worst-case fantasies and not best-case hand-waving.

- **Likelihood**: how probable is it that this finding manifests as a real problem in actual use? (e.g., a guarded-against input is low likelihood; a default code path is high likelihood.)
- **Impact**: if it manifests, how bad is the consequence? (e.g., a crash, data loss, security breach, or contract violation is high impact; a cosmetic inconsistency is low impact.)

| | **Impact: High** | **Impact: Medium** | **Impact: Low** |
|---|---|---|---|
| **Likelihood: High** | Critical | Major | Minor |
| **Likelihood: Medium** | Major | Minor | Nit |
| **Likelihood: Low** | Major | Minor | Nit / Acceptable-as-is |

Two overrides apply regardless of the matrix:

- A direct **contract violation** (the spec/DoD/acceptance criteria say X and the change does not do X) is at least **Major**, and **Critical** when it breaks a core promised behavior — independent of likelihood, because the contract is the agreed baseline.
- A **security defect** with a plausible exploit path (injection, auth bypass, secret exposure, unsafe file operation) is **Critical**, because impact dominates.

---

## Finding classes

| Class | Definition | Disposition |
|---|---|---|
| **Critical** | In-scope defect that breaks a core contract behavior, causes data loss, or opens a security hole with a plausible exploit path. | **Blocking** |
| **Major** | In-scope contract violation, missing stated requirement, or a high-likelihood/high-impact defect that is not core-breaking. | **Blocking** |
| **Minor** | In-scope quality concern with limited likelihood or impact — works, but could be cleaner or more robust. | Non-blocking note |
| **Nit** | Cosmetic or stylistic preference with negligible impact. | Non-blocking note |
| **Follow-up** | A real, worthwhile issue that is out of the current scope, or a deferrable improvement. Record it as a tracking item (issue/ticket) so it is not silently dropped. | Non-blocking; tracked |
| **Acceptable-as-is** | Examined and explicitly judged fine — the simplest correct solution, or a concern that does not apply under realistic conditions. | Non-blocking; close it out |

`Acceptable-as-is` is an active verdict, not silence: it records that a reviewer looked and decided no action is warranted, so the same concern is not re-litigated.

---

## Blocking vs. non-blocking mapping

The core contract every reviewer honors:

- **Critical** and **Major** in-scope findings → **blocking**. They drive `FAIL` / `NEEDS_REVISION`.
- **Minor**, **Nit**, **Follow-up**, and **Acceptable-as-is** → **non-blocking**. They are surfaced as notes (and tracked, for Follow-ups) but never by themselves fail a review.

Stated as a verdict rule: a review fails **only** when at least one in-scope Critical or Major finding exists. Zero in-scope Critical/Major findings → the review passes, even if Minor/Nit notes remain.

### Per-surface application

- **Design reviewers**: only in-scope Critical/Major findings produce `NEEDS_REVISION`. Lower classes are non-blocking suggestions.
- **Plan reviewers**: keep the binary PASS/FAIL verdict, but FAIL is limited to in-scope Critical/Major feasibility, completeness, or scope defects.
- **Adversarial implementation reviewers**: Definition-of-Done / spec contract violations remain blocking (Critical or Major). Speculative improvements become Minor, Follow-up, or Acceptable-as-is — they do not fail the review.
- **External / cross-model reviewers**: cross-model disagreement is preserved and reported, but only in-scope Critical/Major defects fail the review.

---

## Reviewer conduct under this rubric

1. **Calibrate before you classify.** For each finding, judge likelihood × impact and assign a class from the table above before deciding whether it blocks.
2. **Block on contract, not on taste.** A change that meets its contract passes, even if you would have built it differently. Preferences are Minor or Nit at most.
3. **No blanket blocking.** "When in doubt" does not mean "block." When genuinely uncertain whether a finding is in scope or severe, default to the *lower* blocking weight and record it as Minor or Follow-up — do not inflate it to Critical/Major to be safe.
4. **No silent drops.** Every out-of-scope or deferred issue you decline to block on becomes a Follow-up tracking item or an explicit Acceptable-as-is verdict. Skipping a real finding without recording it is not allowed.
5. **Evidence required for blockers.** A Critical or Major finding must cite concrete evidence (file:line, the violated criterion, or the reproduction path). An unevidenced concern cannot block.
