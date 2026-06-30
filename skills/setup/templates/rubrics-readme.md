# Adversarial Review Rubrics

Project-specific review criteria for post-implementation adversarial review. Each rubric is a markdown file with YAML frontmatter that defines when it applies and what to check.

## Convention

Rubrics are auto-discovered by globbing `.claude/rubrics/*.md` (excluding this README). The adversarial reviewer selects rubrics where `applies-to` patterns match changed files in the diff.

### Frontmatter Schema

```yaml
---
name: rubric-identifier        # Matches filename sans .md
description: One-line summary   # Used to decide relevance
applies-to:                     # Glob patterns or file paths
  - "src/models/*.py"
  - "src/api/routes.py"
trigger: auto                   # auto | manual
---
```

**Fields:**
- `name` — Identifier, matches filename without extension
- `description` — One-line summary used by the reviewer to decide relevance
- `applies-to` — List of glob patterns or file paths. Rubric is selected when ANY changed file matches ANY pattern
- `trigger` — `auto` (fires when matching files change) or `manual` (only when explicitly invoked by name)

### Body Format

Numbered checklist with clear PASS/FAIL criteria. Each item should be verifiable with file:line evidence.

## Mechanical Floor

Reviewer selection of "which rubrics apply" is judgment-based — and a right-sized review (or a skipped one) can silently drop an `auto` rubric that should have fired. The mechanical floor closes that seam by rebinding rubric selection to the **diff** instead of reviewer memory.

`scripts/list-applicable-rubrics.mjs` globs every rubric's `applies-to` against the changed files and prints the ones that match. Run it at the start of any review pass; evaluate **each** rubric it names, regardless of how the review was sized:

```bash
node scripts/list-applicable-rubrics.mjs [base-ref]   # base-ref = where the branch diverged (e.g. origin/main)
```

It is informational (always exits 0) — most matched rubrics resolve to N/A in one line. A rubric that matches the diff but is never evaluated is the exact failure this floor prevents. `manual` rubrics are excluded from the floor (invoke them by name).

## Adding a New Rubric

1. Create a `.md` file in this directory with the frontmatter above
2. Write checklist items as numbered steps with **PASS**/**FAIL** criteria
3. That's it — the rubric is active on the next adversarial review

No registration, no index file, no configuration change needed.

## Rubric Lifecycle

- **Proposed by `/self-reflect`**: After PR merge, if a bot found something no rubric would have caught, a new rubric is proposed for user approval
- **Staleness**: Rubrics that haven't triggered in 3 months are flagged during `/self-reflect`
- **Leniency check**: Rubrics that trigger but always PASS are flagged as potentially too lenient
