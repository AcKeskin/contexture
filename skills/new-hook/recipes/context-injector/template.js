#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { execSync } = require('child_process');
const io = require('./lib/hook-io');

const MATCHER_TARGETS = new Set('__MATCHER__'.split('|'));
const SOURCE_TYPE = '__CONTEXT_SOURCE_TYPE__';
const SOURCE_VALUE = '__CONTEXT_SOURCE_VALUE__';

async function main() {
  const payload = await io.readPayload();
  const matcher = payload.matcher || '';
  if (!MATCHER_TARGETS.has(matcher)) return io.allow();

  const context = resolveContext();
  if (!context) return io.allow();

  process.stdout.write(JSON.stringify({ context }) + '\n');
  io.allow();
}

function resolveContext() {
  if (SOURCE_TYPE === 'literal') return SOURCE_VALUE;
  if (SOURCE_TYPE === 'file') {
    try {
      return fs.readFileSync(SOURCE_VALUE, 'utf8');
    } catch {
      return '';
    }
  }
  if (SOURCE_TYPE === 'command') {
    try {
      return execSync(SOURCE_VALUE, { encoding: 'utf8', timeout: 10000 });
    } catch {
      return '';
    }
  }
  return '';
}

main().catch(() => io.allow());
