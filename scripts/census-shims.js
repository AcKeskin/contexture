'use strict';

// Census: command shims vs their skills. Catches the structural parallel-surface
// drift class — an orphan shim (no skill) or a user-invocable skill missing its
// shim. Run on demand:
//   node scripts/census-shims.js
// Exit 0 = consistent, exit 1 = drift found.
//
// It does NOT compare descriptions: a shim is a hand-authored human-facing card
// (worked /command examples, form syntax, prose summary), deliberately distinct
// from the skill's frontmatter description (the auto-fire trigger surface). Body
// fact drift (dimension counts, recipe lists) is not machine-checkable here.

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const COMMANDS_DIR = path.join(REPO_ROOT, 'commands');
const SKILLS_DIR = path.join(REPO_ROOT, 'skills');

// Shims that intentionally have no skill (self-contained procedures) or alias
// another skill's shim. name -> reason.
const SHIM_EXCEPTIONS = {
  'allow-skip-hooks': 'self-contained procedure, no skill',
  status: 'alias for work-state',
};
// Skills that intentionally ship no shim: library-only (not user-invoked) or
// model-triggered (fire on a described condition, not a slash command).
const SKILL_NO_SHIM = new Set([
  'deliver', // library — rendered by other skills
  'retrospect-core', // library — engine for the meta-review organs
  'dispatch', // model-triggered on parallel independent tasks
  'systematic-debugging', // model-triggered on a non-trivial bug
  'test-driven-development', // model-triggered before implementation
  'using-git-worktrees', // model-triggered before isolated feature work
]);

function main() {
  const problems = [];

  const shims = fs
    .readdirSync(COMMANDS_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, ''));
  const skills = fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(SKILLS_DIR, e.name, 'SKILL.md')))
    .map((e) => e.name);
  const skillSet = new Set(skills);
  const shimSet = new Set(shims);

  // 1. Every shim maps to a skill (or is a declared exception).
  for (const shim of shims) {
    if (skillSet.has(shim) || SHIM_EXCEPTIONS[shim]) continue;
    problems.push(`orphan shim: commands/${shim}.md has no skills/${shim}/SKILL.md (add the skill, or list it in SHIM_EXCEPTIONS)`);
  }

  // 2. Every user-invocable skill has a shim (unless declared library/auto).
  for (const skill of skills) {
    if (shimSet.has(skill) || SKILL_NO_SHIM.has(skill)) continue;
    problems.push(`missing shim: skills/${skill}/SKILL.md has no commands/${skill}.md (add the shim, or list it in SKILL_NO_SHIM)`);
  }

  if (problems.length) {
    process.stderr.write(`shim census: ${problems.length} drift(s)\n`);
    for (const p of problems) process.stderr.write(`  - ${p}\n`);
    process.exit(1);
  }
  process.stdout.write(`shim census: OK — ${shims.length} shim(s), ${skills.length} skill(s), no drift\n`);
}

main();
