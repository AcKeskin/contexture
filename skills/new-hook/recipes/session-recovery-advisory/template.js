#!/usr/bin/env node
'use strict';

// SessionStart recovery-advisory hook. Fires when the previous session ended via
// clear or compact; reads that session's transcript and, if a configurable signal
// is present and unresolved, injects a { context } nudge into the new session.
//
// Recovers across a context discard rather than blocking it: SessionStart's
// { context } output on exit 0 is the only documented model-visible non-blocking
// channel (PreCompact/SessionEnd stdout goes to the debug log; exit 2 blocks).
// Fails open — any error injects nothing rather than crashing session start.

const fs = require('fs');
const io = require('./lib/hook-io');

const MATCHER_TARGETS = new Set(['clear', 'compact']);
const ADVISORY_PREFIX = '__ADVISORY_PREFIX__';

async function main() {
  const payload = await io.readPayload();
  const matcher = payload.matcher || '';
  if (!MATCHER_TARGETS.has(matcher)) return io.allow();

  const transcriptPath = payload.transcript_path;
  if (!transcriptPath) return io.allow();

  const events = readTranscript(transcriptPath);
  if (!events.length) return io.allow();

  const signals = unresolvedSignals(events);
  if (!signals.length) return io.allow();

  const preview = signals.slice(0, 4).join('; ');
  const suffix = signals.length > 4 ? `; +${signals.length - 4} more` : '';
  const message = `${ADVISORY_PREFIX} ${preview}${suffix}`;

  process.stdout.write(JSON.stringify({ context: message }) + '\n');
  io.allow();
}

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

// Collect signal labels, suppressing any that were resolved (a watermark event
// after the last signal means everything was handled). Order matters, not mere
// presence. De-duplicates while preserving first-seen order.
function unresolvedSignals(events) {
  const signals = [];
  let lastSignalIdx = -1;
  let lastWatermarkIdx = -1;

  events.forEach((ev, idx) => {
    if (isWatermark(ev)) {
      lastWatermarkIdx = idx;
      return;
    }
    const labels = scan(ev);
    for (const label of labels) {
      signals.push({ idx, label });
      lastSignalIdx = idx;
    }
  });

  if (lastWatermarkIdx > lastSignalIdx) return [];
  const pending = signals.filter((s) => s.idx > lastWatermarkIdx).map((s) => s.label);
  return [...new Set(pending)];
}

// __SIGNAL_SCAN_FN__ — return an array of human-readable signal labels for one
// transcript event (empty array when the event carries no signal).
function scan(event) {
  __SIGNAL_SCAN_FN__
}

// __WATERMARK_FN__ — return true when this event marks the signal as resolved/saved.
function isWatermark(event) {
  __WATERMARK_FN__
}

main().catch(() => io.allow());
