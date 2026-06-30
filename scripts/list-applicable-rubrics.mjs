#!/usr/bin/env node

/**
 * List which .claude/rubrics/*.md auto-fire on a diff — the MECHANICAL review floor.
 *
 * Auto-fire rubrics (`trigger: auto` + `applies-to` globs) encode repo-specific
 * checks — cross-file KEEP-IN-SYNC contracts, registration surfaces, invariants —
 * that generic PR bots cannot know. The adversarial reviewer is supposed to apply
 * the rubrics whose globs match the diff, but that selection is judgment-based: a
 * right-sized review (or a skipped one) silently drops them. This lister rebinds
 * the floor to the DIFF itself — it names every rubric whose `applies-to` globs
 * match a changed file, so the floor is evaluable regardless of how the review was
 * sized. Informational (always exit 0); the caller reads the list and evaluates
 * each named rubric. A rubric that matches the diff but is never evaluated is the
 * exact failure mode this list prevents.
 *
 * Usage:
 *   node scripts/list-applicable-rubrics.mjs [base-ref]
 *     base-ref given   -> changed files = `git diff --name-only <base>` (working
 *                        tree vs base) union untracked. Use the ref the branch/PR
 *                        diverged from (e.g. origin/main, or a pre-merge SHA).
 *     no base-ref      -> changed files = unstaged + staged + untracked (the
 *                        current working set, for a mid-work check).
 *
 * Portability: this is a Node script with zero dependencies. In a repo without a
 * Node toolchain, port the ~100 lines of logic to the project's language (or a
 * shell equivalent) — the contract is "glob `applies-to` against the diff".
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const rubricsDir = path.join(repoRoot, '.claude/rubrics');
const base = process.argv[2];

function git(args) {
  try {
    return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' })
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function changedFiles() {
  const files = new Set();
  if (base) {
    git(['diff', '--name-only', base]).forEach((f) => files.add(f));
  } else {
    git(['diff', '--name-only', 'HEAD']).forEach((f) => files.add(f));
    git(['diff', '--name-only', '--cached']).forEach((f) => files.add(f));
  }
  git(['ls-files', '--others', '--exclude-standard']).forEach((f) => files.add(f));
  return [...files];
}

// glob -> anchored RegExp. Handles **/ (zero+ path segments), ** (any), * (within
// a path segment), ? (one non-slash char). @...@ sentinels are absent from any
// glob and from its regex-escaped form, so the multi-char tokens can't clobber
// each other mid-replacement.
function globToRegExp(glob) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const re = escaped
    .split('**/').join('@DSS@')
    .split('**').join('@DS@')
    .split('*').join('@S@')
    .split('?').join('@Q@')
    .split('@DSS@').join('(?:.*/)?')
    .split('@DS@').join('.*')
    .split('@S@').join('[^/]*')
    .split('@Q@').join('[^/]');
  return new RegExp('^' + re + '$');
}

// Pull the `applies-to:` glob list out of a rubric's YAML frontmatter.
function appliesToGlobs(filePath) {
  const text = readFileSync(filePath, 'utf8');
  const fm = text.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return [];
  const lines = fm[1].split('\n');
  const globs = [];
  let inList = false;
  for (const line of lines) {
    if (/^applies-to:/.test(line)) {
      inList = true;
      continue;
    }
    if (inList) {
      const item = line.match(/^\s*-\s+(.+?)\s*$/);
      if (item) {
        globs.push(item[1].replace(/^['"]|['"]$/g, ''));
      } else if (/^\S/.test(line)) {
        break; // next top-level key ends the list
      }
    }
  }
  return globs;
}

if (!existsSync(rubricsDir)) {
  console.log('[rubrics] No .claude/rubrics/ in this repo — nothing to evaluate.');
  process.exit(0);
}

const files = changedFiles();
if (files.length === 0) {
  console.log('[rubrics] No changed files detected — nothing to evaluate.');
  process.exit(0);
}

const rubrics = readdirSync(rubricsDir)
  .filter((f) => f.endsWith('.md') && f !== 'README.md')
  .sort();

const matched = [];
for (const name of rubrics) {
  const globs = appliesToGlobs(path.join(rubricsDir, name));
  if (globs.length === 0) continue; // no auto-fire trigger (manual / always)
  const res = globs.map((g) => globToRegExp(g));
  const hits = files.filter((f) => res.some((r) => r.test(f)));
  if (hits.length) matched.push({ name, hits });
}

const baseLabel = base ? `vs ${base}` : 'working set';
if (matched.length === 0) {
  console.log(`[rubrics] 0 auto-fire rubrics match this diff (${baseLabel}). Floor clear.`);
  process.exit(0);
}

console.log(
  `[rubrics] ${matched.length} auto-fire rubric(s) apply to this diff (${baseLabel}) — evaluate EACH (mechanical floor; not subject to review right-sizing):\n`
);
for (const { name, hits } of matched) {
  console.log(`  • .claude/rubrics/${name}`);
  for (const h of hits.slice(0, 6)) console.log(`      ↳ ${h}`);
  if (hits.length > 6) console.log(`      ↳ …and ${hits.length - 6} more`);
}
console.log(
  '\n[rubrics] Each rubric self-gates (most resolve to N/A in one line). A rubric that\n' +
    '          matches the diff but is never evaluated is the failure mode this list prevents.'
);
process.exit(0);
