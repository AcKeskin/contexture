'use strict';

// Resolve ~/.claude/settings.json from the synced template + per-machine
// overrides + computed values (ccline path, home-dir token). Idempotent:
// writes only when the resolved content differs from what is already on disk.
//
// Merge strategy:
//   - Top-level keys follow "local overrides template".
//   - The `hooks` key gets a scoped deep-merge so user-added hook events
//     (e.g. a third-party SessionStart hook) coexist with our defaults rather than
//     clobbering each other.
//   - Per the enablement config, the template is structured into `hookBundles`
//     (security / gitDiscipline / bootstrapDrift). The resolver picks
//     enabled bundles based on `enabled.hookBundles` from hook-config.json,
//     concatenates their event arrays into the final `hooks` field, and
//     drops the `hookBundles` key. The runtime shape is unchanged.

const fs = require('fs');
const path = require('path');

const CCLINE_PATH_TOKEN = '__CCLINE_PATH__';
const HOME_TOKEN = '__HOME__';

function resolveSettings({ repoRoot, cclinePathForSettings, homeDirForSettings, enabledHookBundles }) {
  const templatePath = path.join(repoRoot, 'settings', 'settings.template.json');
  const localPath = path.join(repoRoot, 'settings', 'settings.local.json');

  const template = readJson(templatePath);
  if (!template) {
    throw new Error(`settings.template.json missing at ${templatePath}`);
  }

  // Resolve enabled bundles into a flat `hooks` field; drop hookBundles.
  const resolvedTemplate = collapseBundles(template, enabledHookBundles || {});

  const local = readJson(localPath) || {};
  const merged = mergeWithHooksDeepened(resolvedTemplate, local);

  substituteTokens(merged, {
    [CCLINE_PATH_TOKEN]: cclinePathForSettings,
    [HOME_TOKEN]: homeDirForSettings,
  });

  return merged;
}

function collapseBundles(template, enabledMap) {
  const out = { ...template };
  const bundles = template.hookBundles || {};
  delete out.hookBundles;

  // Existing flat `hooks` block (if any) is the starting point so a future
  // template can mix flat-and-bundled. Today the template is bundle-only.
  const hooks = template.hooks ? deepClone(template.hooks) : {};
  for (const [name, bundle] of Object.entries(bundles)) {
    if (!enabledMap[name]) continue;
    for (const [event, arr] of Object.entries(bundle)) {
      if (!Array.isArray(arr)) continue;
      if (Array.isArray(hooks[event])) hooks[event] = hooks[event].concat(arr);
      else hooks[event] = arr.slice();
    }
  }
  out.hooks = hooks;
  return out;
}

function deepClone(o) {
  return JSON.parse(JSON.stringify(o));
}

function writeSettings({ homeClaude, settings }) {
  fs.mkdirSync(homeClaude, { recursive: true });
  const target = path.join(homeClaude, 'settings.json');
  const next = JSON.stringify(settings, null, 2) + '\n';

  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
  if (current === next) {
    return { action: 'up-to-date', target };
  }
  fs.writeFileSync(target, next);
  return { action: current == null ? 'created' : 'updated', target };
}

function readJson(p) {
  if (!fs.existsSync(p)) return null;
  const raw = fs.readFileSync(p, 'utf8');
  return JSON.parse(raw);
}

function mergeWithHooksDeepened(template, override) {
  const out = { ...template };
  for (const [k, v] of Object.entries(override)) {
    if (k === 'hooks' && isPlainObject(v) && isPlainObject(template.hooks)) {
      out.hooks = mergeHooks(template.hooks, v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function mergeHooks(base, extra) {
  const out = { ...base };
  for (const [event, arr] of Object.entries(extra)) {
    if (Array.isArray(out[event]) && Array.isArray(arr)) {
      out[event] = out[event].concat(arr);
    } else {
      out[event] = arr;
    }
  }
  return out;
}

function isPlainObject(x) {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

function substituteTokens(node, tokens) {
  if (node === null || typeof node !== 'object') return;
  for (const [k, v] of Object.entries(node)) {
    if (typeof v === 'string') {
      let replaced = v;
      for (const [token, value] of Object.entries(tokens)) {
        if (value == null) continue;
        if (replaced.includes(token)) replaced = replaced.split(token).join(value);
      }
      node[k] = replaced;
    } else if (typeof v === 'object') {
      substituteTokens(v, tokens);
    }
  }
}

module.exports = { resolveSettings, writeSettings, CCLINE_PATH_TOKEN, HOME_TOKEN };
