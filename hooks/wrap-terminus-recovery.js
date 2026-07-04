#!/usr/bin/env node
'use strict';

// SessionStart hook (matcher: clear | compact): when the previous session was
// cleared or compacted, scan its transcript for a SHIP whose session-terminus
// never ran, and — if found — inject a one-line nudge proposing /wrap.
//
// Sibling of the clear-context-decision-guard: same lifecycle event, same
// fail-open transcript scan, same SessionStart `{ context }` channel (the ONLY
// channel whose stdout reaches the model — SessionEnd/PreCompact stdout is
// debug-only and exit 2 blocks, which a non-blocking guard must not do). The
// decision guard asks "were decisions left unpersisted → nudge /recap"; this
// asks "did work SHIP whose terminus (close-out / changelog / recap) never ran
// → propose /wrap".
//
// Off by default. Fires only when hook-config.json enables `wrapTerminus` —
// opt-in, matching the enablement-config posture (auto behaviours default off).
// Deliberately dumb: string / structure matching, no model call. False
// positives are cheap (one extra /wrap proposal the user declines); the
// judgment leans toward surfacing. Fails open.

const fs = require('fs');
const path = require('path');
const io = require('./lib/hook-io');

const MATCHER_TARGETS = new Set(['clear', 'compact']);

// A design artefact landing = a ship-shaped signal (a slug/proposal advanced).
const ARTEFACT_PATH_RE = /\.claude[\\/](specs|plans|docs)[\\/]|[\\/]proposals[\\/]\d{3}-/i;

// Assistant-text phrases that mark a ship the terminus should record. Lowercased.
const SHIP_PHRASES = [
  'shipped',
  'done-criteria met',
  'done criteria met',
  'plan complete',
  'landed on',
  'merged to main',
];

// A terminus watermark: the close ran. Any of — a recap file write, a CHANGELOG
// write, or a close-out archive move. Once one lands after the last ship signal,
// the terminus is not pending.
const RECAP_WRITE_RE = /[\\/]memory[\\/]sessions[\\/].+\.md$/i;
const CHANGELOG_WRITE_RE = /(^|[\\/])CHANGELOG\.md$/i;
const ARCHIVE_WRITE_RE = /\.claude[\\/]archive[\\/]/i;

async function main() {
  const payload = await io.readPayload();

  // Opt-in gate: silent unless hook-config enables wrapTerminus.
  if (io.hookConfig('wrapTerminus').enabled !== true) return io.allow();

  const matcher = payload.matcher || '';
  if (!MATCHER_TARGETS.has(matcher)) return io.allow();

  const transcriptPath = payload.transcript_path;
  if (!transcriptPath) return io.allow();

  const events = readTranscript(transcriptPath);
  if (!events.length) return io.allow();

  const scan = scanForUnclosedShip(events);
  if (!scan.signals.length) return io.allow();

  const preview = scan.signals.slice(0, 4).join('; ');
  const suffix = scan.signals.length > 4 ? `; +${scan.signals.length - 4} more` : '';
  const verb = matcher === 'clear' ? 'cleared' : 'compacted';
  const message =
    `Previous session was ${verb} and shipped work whose closing terminus may not have run: ${preview}${suffix}. ` +
    `Consider proposing /wrap — it drives the closing ceremony (recap / close-out / changelog / BACKLOG sweep) ` +
    `behind accept/edit/reject gates. The prior transcript is still on disk to reconstruct from.`;

  process.stdout.write(JSON.stringify({ context: message }) + '\n');
  io.allow();
}

// Read a Claude Code transcript .jsonl into parsed events; skip malformed lines;
// missing/unreadable file yields []. (Same reader shape as the decision guard.)
function readTranscript(p) {
  let raw;
  try {
    raw = fs.readFileSync(p, 'utf8');
  } catch {
    return [];
  }
  const events = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed));
    } catch {
      // skip malformed line
    }
  }
  return events;
}

// Walk in order. Collect ship signals; track the last ship index and the last
// terminus-watermark index. If the terminus ran after the last ship, nothing is
// pending. Otherwise surface the ship signals that postdate the last terminus.
function scanForUnclosedShip(events) {
  const signals = [];
  let lastSignalIdx = -1;
  let lastTerminusIdx = -1;

  events.forEach((ev, idx) => {
    if (eventIsTerminusWatermark(ev)) {
      lastTerminusIdx = idx;
      return;
    }
    const sig = shipSignal(ev);
    if (sig) {
      signals.push({ idx, label: sig });
      lastSignalIdx = idx;
    }
  });

  if (lastTerminusIdx > lastSignalIdx) return { signals: [] };

  const pending = signals.filter((s) => s.idx > lastTerminusIdx).map((s) => s.label);
  return { signals: [...new Set(pending)] };
}

// A terminus watermark: a Write/Edit to a recap file, CHANGELOG.md, or an
// archive path — any of which means part of the close already ran.
function eventIsTerminusWatermark(ev) {
  for (const c of toolCalls(ev)) {
    const name = c.name || '';
    if (name !== 'Write' && name !== 'Edit' && name !== 'MultiEdit') continue;
    const target = filePathArg(c);
    if (!target) continue;
    if (RECAP_WRITE_RE.test(target) || CHANGELOG_WRITE_RE.test(target) || ARCHIVE_WRITE_RE.test(target)) {
      return true;
    }
  }
  return false;
}

// Classify an event as a ship signal → short label, or null.
function shipSignal(ev) {
  for (const c of toolCalls(ev)) {
    if (c.name === 'Write' || c.name === 'Edit' || c.name === 'MultiEdit') {
      const target = filePathArg(c);
      if (target && ARTEFACT_PATH_RE.test(target)) {
        return `design artefact advanced (${path.basename(target)})`;
      }
    }
  }
  const text = assistantText(ev).toLowerCase();
  if (text) {
    for (const phrase of SHIP_PHRASES) {
      if (text.includes(phrase)) return `ship phrase ("${phrase}")`;
    }
  }
  return null;
}

function toolCalls(ev) {
  const out = [];
  const content = messageContent(ev);
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block && block.type === 'tool_use' && block.name) {
        out.push({ name: block.name, input: block.input || {} });
      }
    }
  }
  return out;
}

function filePathArg(call) {
  const input = call.input || {};
  return input.file_path || input.path || input.notebook_path || '';
}

function assistantText(ev) {
  if (messageRole(ev) !== 'assistant') return '';
  const content = messageContent(ev);
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n');
}

function messageContent(ev) {
  if (ev && ev.message && ev.message.content !== undefined) return ev.message.content;
  if (ev && ev.content !== undefined) return ev.content;
  return undefined;
}

function messageRole(ev) {
  if (ev && ev.message && ev.message.role) return ev.message.role;
  if (ev && ev.role) return ev.role;
  return '';
}

main().catch(() => io.allow());
