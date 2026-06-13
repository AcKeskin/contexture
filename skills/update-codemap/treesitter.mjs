// AST-based multi-language extraction for update-codemap, via web-tree-sitter (WASM).
//
// Produces the SAME shapes the regex extractors in codemap.mjs produce, so the caller
// can swap transparently:
//   classes: [{ name, kind, extends[], implements[], fields:[{name,type}], namespace, attributes[] }]
//   exports: [{ name }]
//   imports: [ "target", ... ]   (bare module/path strings, resolved later by resolveImport)
//
// Design:
//   - Grammars ship as prebuilt WASM via the optional `tree-sitter-wasms` dep. If the
//     deps aren't installed, `initTreeSitter()` returns null and the caller falls back
//     to regex. The module NEVER throws on a missing dep — graceful degradation.
//   - The grammar dir is resolved relative to THIS module via import.meta.url, never cwd
//     (the skill is symlinked into ~/.claude; per no-hardcoded-machine-paths).
//   - Each language is a self-contained spec: which grammar, and an extractor that walks
//     the parsed tree. Queries/walks were authored against the real grammar node names
//     (dumped from tree-sitter-wasms@0.1.13), not guesses.
//   - ABI: tree-sitter-wasms@0.1.13 grammars require the web-tree-sitter 0.25 line.
//     0.26+ dropped the old grammar ABI; 0.24- is CommonJS-only. Pin ~0.25 (package.json).

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WASM_DIR = path.join(HERE, 'node_modules', 'tree-sitter-wasms', 'out');

// Map our internal lang tags → tree-sitter-wasms grammar basenames.
const GRAMMAR_BY_LANG = {
  python: 'python',
  java: 'java',
  kotlin: 'kotlin',
  swift: 'swift',
  rust: 'rust',
  go: 'go',
  cpp: 'cpp', // serves both cpp-header and cpp-impl
};

let _tsModule = null;     // the web-tree-sitter module, or false if unavailable
let _initDone = false;
const _langCache = new Map();

// Returns the web-tree-sitter module once initialised, or null if the optional deps
// are not installed / fail to load. Cached. Never throws.
export async function initTreeSitter() {
  if (_initDone) return _tsModule || null;
  _initDone = true;
  try {
    if (!fs.existsSync(WASM_DIR)) { _tsModule = false; return null; }
    const ts = await import('web-tree-sitter');
    await ts.Parser.init();
    _tsModule = ts;
    return ts;
  } catch {
    _tsModule = false;
    return null;
  }
}

async function loadLanguage(ts, lang) {
  const grammar = GRAMMAR_BY_LANG[lang];
  if (!grammar) return null;
  if (_langCache.has(grammar)) return _langCache.get(grammar);
  const wasm = path.join(WASM_DIR, `tree-sitter-${grammar}.wasm`);
  if (!fs.existsSync(wasm)) { _langCache.set(grammar, null); return null; }
  try {
    const language = await ts.Language.load(wasm);
    _langCache.set(grammar, language);
    return language;
  } catch {
    _langCache.set(grammar, null);
    return null;
  }
}

export function isTreeSitterLang(lang) {
  return Object.prototype.hasOwnProperty.call(GRAMMAR_BY_LANG, lang);
}

// --- small tree-walk helpers -------------------------------------------------

function* descendants(node) {
  // Pre-order DFS over named children. Cursor-free (clearer; trees here are small).
  const stack = [node];
  while (stack.length) {
    const n = stack.pop();
    yield n;
    for (let i = n.namedChildCount - 1; i >= 0; i--) stack.push(n.namedChild(i));
  }
}

function childField(node, field) {
  return node.childForFieldName ? node.childForFieldName(field) : null;
}

// First descendant (incl. self) of one of the given types.
function firstOfType(node, types) {
  const set = new Set(Array.isArray(types) ? types : [types]);
  for (const d of descendants(node)) if (set.has(d.type)) return d;
  return null;
}

// All direct/indirect descendants of a type, but NOT descending past a `stopType`
// boundary (so nested classes' members don't leak into the outer class).
function collectShallow(node, type, stopTypes) {
  const out = [];
  const stop = new Set(stopTypes || []);
  const visit = (n, isRoot) => {
    if (!isRoot && stop.has(n.type)) return; // don't descend into nested decls
    if (!isRoot && n.type === type) { out.push(n); return; }
    for (let i = 0; i < n.namedChildCount; i++) visit(n.namedChild(i), false);
  };
  visit(node, true);
  return out;
}

function mk(name, kind, { extends: ext = [], implements: impl = [], fields = [], namespace = '', attributes = [] } = {}) {
  return { name, kind, extends: ext, implements: impl, fields, namespace, attributes };
}

// Normalise a language-specific module/import path into a `/`-separated path-like target
// that codemap.mjs's resolveImport (branch 2 + bySuffix/basename) can map to an in-repo
// file. `dropLast` drops the trailing symbol segment (Java/Rust import a *type* whose last
// segment is the symbol, not a path component). Resolution stays best-effort by design —
// package-style imports that name a folder resolve to a module-level edge.
function modulePathTarget(raw, { sep, dropLast = false, dropHead = [] } = {}) {
  let parts = raw.split(sep).filter(Boolean);
  while (parts.length && dropHead.includes(parts[0])) parts = parts.slice(1);
  if (dropLast && parts.length > 1) parts = parts.slice(0, -1);
  return parts.join('/');
}

// --- per-language extractors -------------------------------------------------
// Each returns { classes, exports, imports }. `text` is the full file source.

const EXTRACTORS = {
  python(root) {
    const classes = [], exports = [], imports = [];
    for (const n of descendants(root)) {
      if (n.type === 'class_definition') {
        const name = childField(n, 'name')?.text;
        if (!name) continue;
        // superclasses: (argument_list (identifier|attribute)...)
        const supers = childField(n, 'superclasses');
        const bases = [];
        if (supers) for (let i = 0; i < supers.namedChildCount; i++) {
          const t = supers.namedChild(i).text.trim();
          if (t) bases.push(t.split('.').pop());
        }
        // Fields: `self.x = ...` assignments anywhere in the class body.
        const fields = [];
        const seen = new Set();
        const body = childField(n, 'body');
        if (body) for (const d of descendants(body)) {
          if (d.type === 'assignment') {
            const left = childField(d, 'left');
            if (left && left.type === 'attribute') {
              const obj = childField(left, 'object');
              const attr = childField(left, 'attribute');
              if (obj && obj.text === 'self' && attr && !seen.has(attr.text)) {
                seen.add(attr.text);
                fields.push({ name: attr.text, type: '' });
              }
            }
          }
        }
        classes.push(mk(name, 'class', { extends: bases, fields }));
        exports.push({ name });
      }
    }
    for (const n of descendants(root)) {
      if (n.type === 'import_from_statement') {
        const mod = childField(n, 'module_name');
        // `from core.shape import X` → core/shape ; leading dots are relative (drop them).
        if (mod) imports.push(modulePathTarget(mod.text.replace(/^\.+/, ''), { sep: '.' }));
      } else if (n.type === 'import_statement') {
        const mod = childField(n, 'name') || n.namedChild(0);
        if (mod) imports.push(modulePathTarget(mod.text, { sep: '.' }));
      }
    }
    return { classes, exports, imports };
  },

  java(root) {
    const classes = [], exports = [], imports = [];
    let pkg = '';
    for (const n of descendants(root)) {
      if (n.type === 'package_declaration') { pkg = (firstOfType(n, 'scoped_identifier') || n).text; }
      if (n.type === 'import_declaration') {
        const id = firstOfType(n, 'scoped_identifier') || firstOfType(n, 'identifier');
        // `import geo.core.Shape` → geo/core/Shape (last segment is the type/symbol).
        if (id) imports.push(modulePathTarget(id.text, { sep: '.' }));
      }
      if (n.type === 'class_declaration' || n.type === 'interface_declaration') {
        const name = childField(n, 'name')?.text;
        if (!name) continue;
        const kind = n.type === 'interface_declaration' ? 'interface' : 'class';
        const ext = [], impl = [];
        const sc = childField(n, 'superclass');
        if (sc) { const t = firstOfType(sc, 'type_identifier'); if (t) ext.push(t.text); }
        const ifaces = childField(n, 'interfaces');
        if (ifaces) for (const t of collectShallow(ifaces, 'type_identifier', ['class_body'])) impl.push(t.text);
        // interface `extends` is recorded under `interfaces` too in Java grammar; for an
        // interface declaration treat them as extends.
        const body = childField(n, 'body');
        const fields = [];
        if (body) for (const fd of collectShallow(body, 'field_declaration', ['class_body', 'interface_body'])) {
          const type = childField(fd, 'type')?.text || '';
          const decl = firstOfType(fd, 'variable_declarator');
          const fname = decl ? childField(decl, 'name')?.text : null;
          if (fname) fields.push({ name: fname, type });
        }
        classes.push(mk(name, kind, kind === 'interface'
          ? { extends: impl, fields, namespace: pkg }
          : { extends: ext, implements: impl, fields, namespace: pkg }));
        exports.push({ name });
      }
    }
    return { classes, exports, imports };
  },

  kotlin(root) {
    const classes = [], exports = [], imports = [];
    for (const n of descendants(root)) {
      if (n.type === 'import_header') {
        const id = firstOfType(n, 'identifier');
        // `import geo.core.Shape` → geo/core/Shape (last segment is the type/symbol).
        if (id) imports.push(modulePathTarget(id.text, { sep: '.' }));
      }
      if (n.type === 'class_declaration' || n.type === 'interface_declaration' || n.type === 'object_declaration') {
        // Kotlin class name is an unlabelled (type_identifier) DIRECT child (node identity
        // across WASM objects is unreliable, so iterate direct children rather than filter
        // descendants by .parent).
        let nameNode = null;
        for (let i = 0; i < n.namedChildCount; i++) {
          if (n.namedChild(i).type === 'type_identifier') { nameNode = n.namedChild(i); break; }
        }
        const name = nameNode?.text;
        if (!name) continue;
        const isInterface = n.type === 'interface_declaration' || n.text.startsWith('interface');
        const supers = [];
        for (const ds of collectShallow(n, 'delegation_specifier', ['class_body'])) {
          const t = firstOfType(ds, 'type_identifier');
          if (t) supers.push(t.text);
        }
        const fields = [];
        const body = firstOfType(n, 'class_body');
        if (body) for (const pd of collectShallow(body, 'property_declaration', ['class_body'])) {
          const vd = firstOfType(pd, 'variable_declaration');
          const id = vd ? firstOfType(vd, 'simple_identifier') : null;
          const ut = vd ? firstOfType(vd, 'user_type') : null;
          if (id) fields.push({ name: id.text, type: ut ? ut.text : '' });
        }
        // Kotlin doesn't syntactically split base-class vs interface; record as implements
        // (conventional for the visualizer's relation edge), which the sweep accepts.
        classes.push(mk(name, isInterface ? 'interface' : 'class', { implements: supers, fields }));
        exports.push({ name });
      }
    }
    return { classes, exports, imports };
  },

  swift(root) {
    const classes = [], exports = [], imports = [];
    for (const n of descendants(root)) {
      if (n.type === 'import_declaration') {
        const id = firstOfType(n, 'simple_identifier') || firstOfType(n, 'identifier');
        if (id) imports.push(id.text);
      }
      if (n.type === 'class_declaration' || n.type === 'protocol_declaration') {
        const name = childField(n, 'name')?.text || firstOfType(n, 'type_identifier')?.text;
        if (!name) continue;
        // struct/enum/class all use class_declaration in the swift grammar; the leading
        // keyword disambiguates.
        const head = n.text.slice(0, 24);
        const kind = /\bstruct\b/.test(head) ? 'struct'
          : /\benum\b/.test(head) ? 'enumeration'
          : n.type === 'protocol_declaration' ? 'interface' : 'class';
        const supers = [];
        for (const isp of collectShallow(n, 'inheritance_specifier', ['class_body'])) {
          const t = firstOfType(isp, 'type_identifier');
          if (t) supers.push(t.text);
        }
        const fields = [];
        const body = firstOfType(n, 'class_body');
        if (body) for (const pd of collectShallow(body, 'property_declaration', ['class_body'])) {
          const pat = firstOfType(pd, 'pattern');
          const id = pat ? firstOfType(pat, 'simple_identifier') : firstOfType(pd, 'simple_identifier');
          const ann = childField(pd, 'type') || firstOfType(pd, 'type_annotation');
          if (id) fields.push({ name: id.text, type: ann ? (firstOfType(ann, 'type_identifier')?.text || '') : '' });
        }
        // Swift conformance/inheritance is one syntactic list; record as implements so the
        // protocol-conformance (the common case) shows as the relation edge.
        classes.push(mk(name, kind, { implements: supers, fields }));
        exports.push({ name });
      }
    }
    return { classes, exports, imports };
  },

  rust(root) {
    const classes = [], exports = [], imports = [];
    const byName = new Map();
    const ensure = (name, kind) => {
      let c = byName.get(name);
      if (!c) { c = mk(name, kind); byName.set(name, c); classes.push(c); exports.push({ name }); }
      return c;
    };
    for (const n of descendants(root)) {
      if (n.type === 'use_declaration') {
        const arg = childField(n, 'argument');
        // `use crate::core::shape::Shape;` → core/shape (drop crate/self/super head, drop
        // the trailing symbol segment).
        if (arg) imports.push(modulePathTarget(arg.text, { sep: '::', dropLast: true, dropHead: ['crate', 'self', 'super'] }));
      }
      if (n.type === 'struct_item' || n.type === 'enum_item') {
        const name = childField(n, 'name')?.text;
        if (!name) continue;
        const c = ensure(name, n.type === 'enum_item' ? 'enumeration' : 'struct');
        const body = firstOfType(n, 'field_declaration_list');
        if (body) for (const fd of collectShallow(body, 'field_declaration', [])) {
          const fn = childField(fd, 'name')?.text;
          const ty = childField(fd, 'type')?.text || '';
          if (fn) c.fields.push({ name: fn, type: ty });
        }
      }
      if (n.type === 'trait_item') {
        const name = childField(n, 'name')?.text;
        if (name) ensure(name, 'interface');
      }
      // `impl Trait for Type` → Type implements Trait.
      if (n.type === 'impl_item') {
        const trait = childField(n, 'trait');
        const ty = childField(n, 'type');
        if (trait && ty) {
          const c = ensure(ty.text.replace(/<.*$/, ''), 'struct');
          const tn = (firstOfType(trait, 'type_identifier') || trait).text.replace(/<.*$/, '');
          if (!c.implements.includes(tn)) c.implements.push(tn);
        }
      }
    }
    return { classes, exports, imports };
  },

  go(root) {
    const classes = [], exports = [], imports = [];
    for (const n of descendants(root)) {
      if (n.type === 'import_spec') {
        const p = childField(n, 'path') || firstOfType(n, 'interpreted_string_literal');
        // Go import path `example.com/proj/core` → keep as path; resolver matches the
        // trailing package dir segment against in-repo dirs/files.
        if (p) imports.push(p.text.replace(/^["`]|["`]$/g, ''));
      }
      if (n.type === 'type_spec') {
        const name = childField(n, 'name')?.text;
        const ty = childField(n, 'type');
        if (!name || !ty) continue;
        if (ty.type === 'struct_type') {
          const c = mk(name, 'struct');
          const list = firstOfType(ty, 'field_declaration_list');
          if (list) for (const fd of collectShallow(list, 'field_declaration', [])) {
            const fn = childField(fd, 'name')?.text;
            const ft = childField(fd, 'type')?.text || '';
            if (fn) { c.fields.push({ name: fn, type: ft.split('.').pop() }); }
            else {
              // Embedded field (composition) — type with no name. Record as implements edge
              // so the visualizer draws the relation.
              const emb = childField(fd, 'type')?.text;
              if (emb) c.implements.push(emb.split('.').pop());
            }
          }
          classes.push(c); exports.push({ name });
        } else if (ty.type === 'interface_type') {
          classes.push(mk(name, 'interface')); exports.push({ name });
        }
      }
    }
    return { classes, exports, imports };
  },

  cpp(root) {
    const classes = [], exports = [], imports = [];
    for (const n of descendants(root)) {
      if (n.type === 'preproc_include') {
        const p = childField(n, 'path');
        if (p) imports.push(p.text.replace(/^["<]|[">]$/g, ''));
      }
      if (n.type === 'class_specifier' || n.type === 'struct_specifier') {
        const name = childField(n, 'name')?.text;
        if (!name) continue;
        const ext = [];
        const base = firstOfType(n, 'base_class_clause');
        if (base) for (const t of collectShallow(base, 'type_identifier', ['field_declaration_list'])) ext.push(t.text);
        const fields = [];
        const body = childField(n, 'body') || firstOfType(n, 'field_declaration_list');
        if (body) for (const fd of collectShallow(body, 'field_declaration', ['field_declaration_list'])) {
          const decl = childField(fd, 'declarator');
          // Method (function_declarator) vs data member (field_identifier).
          if (decl && decl.type === 'function_declarator') continue;
          const fid = decl && decl.type === 'field_identifier' ? decl : firstOfType(fd, 'field_identifier');
          const type = childField(fd, 'type')?.text || '';
          if (fid && fid.type === 'field_identifier') fields.push({ name: fid.text, type });
        }
        classes.push(mk(name, n.type === 'struct_specifier' ? 'struct' : 'class', { extends: ext, fields }));
        exports.push({ name });
      }
    }
    return { classes, exports, imports };
  },
};

// Parse `text` for `lang` and return { classes, exports, imports }, or null to signal
// the caller should fall back. Null when: deps unavailable, grammar unloadable, or the
// parse failed structurally (hasError AND zero classes extracted).
export async function extractWithTreeSitter(text, lang) {
  const ts = await initTreeSitter();
  if (!ts) return null;
  const extractor = EXTRACTORS[lang];
  if (!extractor) return null;
  const language = await loadLanguage(ts, lang);
  if (!language) return null;

  const parser = new ts.Parser();
  parser.setLanguage(language);
  let tree;
  try { tree = parser.parse(text); } catch { return null; }
  const root = tree.rootNode;

  let result;
  try { result = extractor(root); } catch { return null; }

  // Only fall back if the parse was structurally broken AND yielded nothing useful.
  // A clean parse with zero classes (e.g. a file of free functions) is a valid result.
  if (root.hasError && result.classes.length === 0 && result.exports.length === 0 && result.imports.length === 0) {
    return null;
  }
  return result;
}
