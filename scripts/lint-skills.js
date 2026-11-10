'use strict';

// Skills lint: report where a skill drifts from
// architectural-rules/config-authoring/skill-anatomy.md and invocation-control.md.
//   node scripts/lint-skills.js            # report, exit 0
//   node scripts/lint-skills.js --strict   # exit 1 on any finding
//
// Findings are prompts to look, not verdicts: a long description may be right.
// Hidden Unicode is the exception: it always exits 1 (see HIDDEN below).

const fs = require('fs');
const path = require('path');

const SKILLS = path.join(__dirname, '..', 'skills');

// Tripwire, not a gate: descriptions load every session, and the median is
// about 300 characters. Past 400, ask whether the extra words help matching.
const DESCRIPTION_TRIPWIRE = 400;
// Quoted phrases in a description beyond this read as a keyword pile.
const QUOTED_PHRASES_TRIPWIRE = 2;
// After compaction Claude Code re-attaches the first 5,000 tokens of each
// invoked skill. Skill bodies measured ~2.75 chars/token (2026-11-04), so text
// past ~13,700 chars is lost for the rest of the session.
const BODY_CHAR_LIMIT = 13700;

// Characters that render as nothing or reorder text, so an instruction can sit
// in a file unseen: zero-width, bidi controls, word joiners, Unicode tags.
// U+200D (zero-width joiner) is left out; emoji sequences use it.
// A BOM (U+FEFF) is fine as the first character only.
const HIDDEN = /[\u200B\u200C\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]|\uDB40[\uDC00-\uDC7F]/g;
// Text the agents load: instructions, rules, hooks and the per-tool copies.
const HIDDEN_SCAN_DIRS = ['skills', 'architectural-rules', 'agents', 'commands', 'claude-md', 'hooks', 'copilot', 'cursor', 'opencode', '.github', 'settings'];
const HIDDEN_SCAN_EXT = /\.(md|mdc|json|ya?ml|toml|js|mjs|cjs|sh|ps1|txt)$/;

function frontmatter(text) {
  if (!text.startsWith('---\n')) return {};
  const block = text.slice(4, text.indexOf('\n---', 4));
  const out = {};
  for (const line of block.split('\n')) {
    const m = line.match(/^([a-z][\w-]*):\s*(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^"(.*)"$/, '$1').replace(/\\"/g, '"');
  }
  return out;
}

function lintSkill(name) {
  const file = path.join(SKILLS, name, 'SKILL.md');
  const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const fm = frontmatter(text);
  const desc = fm.description || '';
  const findings = [];

  if (!desc) findings.push('no description');
  if (desc.length > DESCRIPTION_TRIPWIRE) findings.push(`description is ${desc.length} chars (tripwire ${DESCRIPTION_TRIPWIRE})`);
  const quoted = desc.match(/"[^"]+"/g) || [];
  if (quoted.length > QUOTED_PHRASES_TRIPWIRE) findings.push(`description quotes ${quoted.length} trigger phrases; state the trigger as a clause`);
  if (/^["']?true["']?\s*(#.*)?$/i.test(fm['disable-model-invocation'] || '') && /never auto-fire/i.test(desc)) {
    findings.push('user-only skill repeats "never auto-fires" in its description; the field is the contract');
  }
  const body = text.slice(text.indexOf('\n---', 4) + 4);
  const crossRefs = body.match(/\]\(\.\.\/[\w-]+\/SKILL\.md\)\s*§\s*\d[\w.]*/g) || [];
  if (crossRefs.length) findings.push(`points at another skill by section number: ${crossRefs.slice(0, 3).join(', ')}`);
  if (body.length > BODY_CHAR_LIMIT) {
    const lost = (body.slice(BODY_CHAR_LIMIT).match(/^#{1,3} .*$/gm) || []).slice(0, 4);
    findings.push(`body is ${body.length} chars (limit ${BODY_CHAR_LIMIT}); after compaction Claude Code drops the rest${lost.length ? `: ${lost.join(' | ')}` : ''}. Move reference parts to a sibling file`);
  }
  // Claude Code replaces $0, $1 ... in a skill body with the invocation's arguments.
  const argRefs = body.match(/(^|[^\\])\$\d/g) || [];
  if (argRefs.length) findings.push(`body has ${argRefs.length} unescaped $<digit>; Claude Code puts the Nth argument there. Write \\$ for a literal, \${CLAUDE_SKILL_DIR} for the skill folder`);

  return findings;
}

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (HIDDEN_SCAN_EXT.test(e.name)) out.push(p);
  }
  return out;
}

// One line per file: where the first hidden character sits, and how many.
function scanHidden(root) {
  const findings = [];
  for (const d of HIDDEN_SCAN_DIRS) {
    const dir = path.join(root, d);
    if (!fs.existsSync(dir)) continue;
    for (const file of walk(dir, [])) {
      const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
      const hits = [...text.matchAll(HIDDEN)];
      if (!hits.length) continue;
      const first = hits[0];
      const line = text.slice(0, first.index).split('\n').length;
      const code = first[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
      findings.push(`${path.relative(root, file)}:${line}: ${hits.length} hidden character(s), first U+${code}. Remove them; text that renders as nothing can carry instructions`);
    }
  }
  return findings;
}

function main() {
  const strict = process.argv.includes('--strict');
  const skills = fs.readdirSync(SKILLS).filter((s) => fs.existsSync(path.join(SKILLS, s, 'SKILL.md'))).sort();
  let total = 0;
  for (const s of skills) {
    const findings = lintSkill(s);
    total += findings.length;
    for (const f of findings) console.log(`${s}: ${f}`);
  }
  console.log(total ? `${total} finding(s) in ${skills.length} skills` : `ran on ${skills.length} skills, nothing found`);
  const hidden = scanHidden(path.join(__dirname, '..'));
  for (const f of hidden) console.error(`hidden-unicode: ${f}`);
  if (hidden.length) process.exit(1);
  if (strict && total) process.exit(1);
}

if (require.main === module) main();
module.exports = { lintSkill, frontmatter, scanHidden };
