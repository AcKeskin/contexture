// AST-based multi-language extraction for update-codemap, via web-tree-sitter (WASM).
//
// Produces the SAME shapes the regex extractors in codemap.mjs produce, so the caller
// can swap transparently:
//   classes: [{ name, kind, extends[], implements[], fields:[{name,type}], namespace, attributes[] }]
//   exports: [{ name }]
//   imports: [ "target", ... ]   (bare module/path strings, resolved later by resolveImport)
//   calls:   [{ caller, callee }] (attached by extractWithTreeSitter via extractCalls(),
//            NOT by the per-language extractors; syntactic / name-matched call edges)
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
  ts: 'typescript', // plain .ts / .js
  tsx: 'tsx',        // .tsx / .jsx (JSX-capable grammar)
  csharp: 'c_sharp',
  c: 'c',
  ruby: 'ruby',
  php: 'php',
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
// Call edges are NOT produced here — extractCalls() (below) walks the same tree
// separately and extractWithTreeSitter attaches the result as `calls`.

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

  // TypeScript / JavaScript (the `typescript` and `tsx` grammars share node names).
  // Replaces the regex extractClassesTs/extractExportsTs as the primary path; those
  // stay in codemap.mjs as the !treeSitterReady fallback.
  //
  // Output-parity grain (a deliberate call): the AST surfaces
  // MORE than the regex did — chiefly real exports the narrower regex missed (verified +93
  // legitimate symbols on the contexture corpus; class count unchanged). The extra
  // fidelity is KEPT, not grain-matched down: a more complete public surface is the point.
  // Symbol-index "differences" vs the regex era are attribution shifts (a symbol's real
  // source file now wins over its re-export site or `.d.ts` declaration) + the pre-existing
  // global dedup in buildSymbolIndex, not coverage loss — every name still extracts.
  ts(root) {
    const classes = [], exports = [], imports = [];
    const exportNames = new Set();
    // A declaration is "exported" iff its nearest statement ancestor is an export_statement.
    // The grammar nests `export_statement > class_declaration`, so detect by walking up.
    const isExported = (n) => {
      for (let a = n.parent; a; a = a.parent) {
        if (a.type === 'export_statement') return true;
        if (a.type === 'statement_block' || a.type === 'class_body') return false;
      }
      return false;
    };
    for (const n of descendants(root)) {
      if (n.type === 'import_statement') {
        const src = firstOfType(n, 'string');
        // `import {X} from '../core/shape'` → bare module target (resolveImport handles it).
        if (src) {
          const frag = firstOfType(src, 'string_fragment');
          const raw = (frag ? frag.text : src.text).replace(/^['"`]|['"`]$/g, '');
          if (raw) imports.push(raw);
        }
      }
      if (n.type === 'class_declaration' || n.type === 'interface_declaration') {
        const nameNode = childField(n, 'name') || firstOfType(n, 'type_identifier');
        const name = nameNode?.text;
        if (!name) continue;
        const kind = n.type === 'interface_declaration' ? 'interface' : 'class';
        const ext = [], impl = [];
        // class: class_heritage > extends_clause / implements_clause.
        const heritage = firstOfType(n, 'class_heritage');
        if (heritage) {
          const extClause = firstOfType(heritage, 'extends_clause');
          if (extClause) for (let i = 0; i < extClause.namedChildCount; i++) {
            const c = extClause.namedChild(i);
            if (c.type === 'identifier' || c.type === 'type_identifier' || c.type === 'member_expression') {
              ext.push(stripGenericTail(c.text)); break; // single base in TS
            }
          }
          const implClause = firstOfType(heritage, 'implements_clause');
          if (implClause) for (const t of collectShallow(implClause, 'type_identifier', ['class_body'])) impl.push(stripGenericTail(t.text));
        }
        // interface: `extends A, B` is an extends_type_clause; record under extends.
        if (kind === 'interface') {
          const body = firstOfType(n, 'interface_body');
          for (const ec of collectShallow(n, 'extends_type_clause', [body ? 'interface_body' : ''])) {
            for (const t of collectShallow(ec, 'type_identifier', [])) ext.push(stripGenericTail(t.text));
          }
        }
        // Fields: public_field_definition (TS exposes via accessibility modifiers; we
        // record all declared fields — the codemap composition edge wants the type).
        const fields = [];
        const body = firstOfType(n, kind === 'interface' ? 'interface_body' : 'class_body');
        if (body) for (const fd of collectShallow(body, 'public_field_definition', ['class_body', 'statement_block'])) {
          const id = firstOfType(fd, 'property_identifier');
          const ann = firstOfType(fd, 'type_annotation');
          const ty = ann ? (firstOfType(ann, 'type_identifier')?.text || firstOfType(ann, 'predefined_type')?.text || '') : '';
          if (id) fields.push({ name: id.text, type: ty });
        }
        // interface members are property_signature, not public_field_definition.
        if (kind === 'interface' && body) for (const ps of collectShallow(body, 'property_signature', ['interface_body'])) {
          const id = firstOfType(ps, 'property_identifier');
          const ann = firstOfType(ps, 'type_annotation');
          const ty = ann ? (firstOfType(ann, 'type_identifier')?.text || firstOfType(ann, 'predefined_type')?.text || '') : '';
          if (id && !fields.some((f) => f.name === id.text)) fields.push({ name: id.text, type: ty });
        }
        classes.push(mk(name, kind, { extends: ext, implements: impl, fields }));
        if (isExported(n)) exportNames.add(name);
      }
      // Exported functions / consts / enums / type aliases — name-only exports.
      if ((n.type === 'function_declaration' || n.type === 'generator_function_declaration') && isExported(n)) {
        const id = childField(n, 'name'); if (id) exportNames.add(id.text);
      }
      if (n.type === 'enum_declaration' && isExported(n)) {
        const id = childField(n, 'name') || firstOfType(n, 'identifier'); if (id) exportNames.add(id.text);
      }
      if ((n.type === 'lexical_declaration' || n.type === 'variable_declaration') && isExported(n)) {
        for (const vd of collectShallow(n, 'variable_declarator', [])) {
          const id = childField(vd, 'name') || firstOfType(vd, 'identifier');
          if (id && id.type === 'identifier') exportNames.add(id.text);
        }
      }
      if (n.type === 'type_alias_declaration' && isExported(n)) {
        const id = childField(n, 'name') || firstOfType(n, 'type_identifier'); if (id) exportNames.add(id.text);
      }
      // `export { A, B as C }` / `export { X } from './y'` — named (re-)exports. The
      // exported binding is the local name, or the alias when `as` is present.
      if (n.type === 'export_clause') {
        for (const spec of collectShallow(n, 'export_specifier', [])) {
          const alias = childField(spec, 'alias');
          const name = childField(spec, 'name');
          const exported = (alias || name);
          if (exported && exported.text && exported.text !== 'default') exportNames.add(exported.text);
        }
      }
    }
    for (const name of exportNames) exports.push({ name });
    return { classes, exports, imports };
  },

  // C#. Replaces the regex extractClassesCSharp/extractExportsCSharp as the primary
  // path; those stay in codemap.mjs as the !treeSitterReady fallback. Declarations may
  // be nested under a file_scoped_namespace_declaration or block namespace_declaration,
  // so namespace is resolved per-declaration by walking up to the nearest namespace node.
  csharp(root) {
    const classes = [], exports = [], imports = [];
    // Nearest enclosing namespace name for a node (file-scoped or block).
    const namespaceOf = (n) => {
      for (let a = n.parent; a; a = a.parent) {
        if (a.type === 'file_scoped_namespace_declaration' || a.type === 'namespace_declaration') {
          const nm = childField(a, 'name') || firstOfType(a, 'qualified_name') || firstOfType(a, 'identifier');
          return nm ? nm.text : '';
        }
      }
      return '';
    };
    for (const n of descendants(root)) {
      if (n.type === 'using_directive') {
        const nm = firstOfType(n, 'qualified_name') || firstOfType(n, 'identifier');
        if (nm) imports.push(nm.text); // `using Geo.Core;` — namespace, resolved via byNamespace index
      }
      const isType = n.type === 'class_declaration' || n.type === 'struct_declaration'
        || n.type === 'interface_declaration' || n.type === 'record_declaration'
        || n.type === 'enum_declaration';
      if (!isType) continue;
      const name = (childField(n, 'name') || firstOfType(n, 'identifier'))?.text;
      if (!name) continue;
      const kind = n.type === 'struct_declaration' ? 'struct'
        : n.type === 'interface_declaration' ? 'interface'
        : n.type === 'record_declaration' ? 'record'
        : n.type === 'enum_declaration' ? 'enum' : 'class';
      const ns = namespaceOf(n);
      const attributes = [];
      for (const al of collectShallow(n, 'attribute_list', ['declaration_list'])) {
        for (const at of collectShallow(al, 'attribute', [])) {
          const id = childField(at, 'name') || firstOfType(at, 'identifier') || firstOfType(at, 'qualified_name');
          if (id) attributes.push(id.text.split('.').pop());
        }
      }
      // base_list: C# doesn't syntactically split base class from interfaces. Mirror the
      // regex heuristic — for class/struct/record the first non-`I[A-Z]` entry is the base
      // (extends), the rest are interfaces (implements). interface/enum: all → extends.
      const bases = [];
      const bl = firstOfType(n, 'base_list');
      if (bl) for (let i = 0; i < bl.namedChildCount; i++) {
        const c = bl.namedChild(i);
        if (c.type === 'identifier' || c.type === 'qualified_name' || c.type === 'generic_name') {
          bases.push(stripGenericTail(c.text));
        }
      }
      const ext = [], impl = [];
      if (kind === 'interface' || kind === 'enum') {
        ext.push(...bases);
      } else {
        bases.forEach((b, i) => { (i === 0 && !/^I[A-Z]/.test(b) ? ext : impl).push(b); });
      }
      // Fields + auto-properties (public surface for the composition edge).
      const fields = [];
      const body = firstOfType(n, 'declaration_list');
      if (body) {
        for (const fd of collectShallow(body, 'field_declaration', ['declaration_list'])) {
          const vd = firstOfType(fd, 'variable_declaration');
          if (!vd) continue;
          const ty = childField(vd, 'type')?.text || '';
          const decl = firstOfType(vd, 'variable_declarator');
          const fn = decl ? (childField(decl, 'name')?.text || firstOfType(decl, 'identifier')?.text) : null;
          if (fn) fields.push({ name: fn, type: stripGenericTail(ty) });
        }
        for (const pd of collectShallow(body, 'property_declaration', ['declaration_list'])) {
          const fn = childField(pd, 'name')?.text;
          const ty = childField(pd, 'type')?.text || '';
          if (fn) fields.push({ name: fn, type: stripGenericTail(ty) });
        }
      }
      classes.push(mk(name, kind, kind === 'interface' || kind === 'enum'
        ? { extends: ext, fields, namespace: ns, attributes }
        : { extends: ext, implements: impl, fields, namespace: ns, attributes }));
      exports.push({ name });
    }
    return { classes, exports, imports };
  },

  // C — structs / typedefs / unions + #include imports. No classes/inheritance; emit
  // structs with fields as the standard shape's honest reduced subset.
  c(root) {
    const classes = [], exports = [], imports = [];
    const seen = new Set();
    const pushStruct = (name, structNode) => {
      if (!name || seen.has(name)) return;
      seen.add(name);
      const c = mk(name, 'struct');
      const list = structNode ? firstOfType(structNode, 'field_declaration_list') : null;
      if (list) for (const fd of collectShallow(list, 'field_declaration', ['field_declaration_list'])) {
        const decl = childField(fd, 'declarator');
        if (decl && decl.type === 'function_declarator') continue;
        const fid = (decl && decl.type === 'field_identifier') ? decl : firstOfType(fd, 'field_identifier');
        const ty = childField(fd, 'type')?.text || '';
        if (fid && fid.type === 'field_identifier') c.fields.push({ name: fid.text, type: ty });
      }
      classes.push(c); exports.push({ name });
    };
    for (const n of descendants(root)) {
      if (n.type === 'preproc_include') {
        const p = childField(n, 'path');
        if (p) imports.push(p.text.replace(/^["<]|[">]$/g, ''));
      }
      if (n.type === 'struct_specifier' || n.type === 'union_specifier') {
        const nm = childField(n, 'name');
        if (nm) pushStruct(nm.text, n);
      }
      // `typedef struct {...} Name;` — the name is the typedef declarator.
      if (n.type === 'type_definition') {
        const inner = firstOfType(n, 'struct_specifier') || firstOfType(n, 'union_specifier');
        const decl = firstOfType(n, 'type_identifier');
        if (decl) pushStruct(decl.text, inner);
      }
    }
    return { classes, exports, imports };
  },

  // Ruby — class superclass → extends, `include M` → implements, `@ivar` → fields,
  // require/require_relative → imports.
  ruby(root) {
    const classes = [], exports = [], imports = [];
    for (const n of descendants(root)) {
      if (n.type === 'call') {
        const m = childField(n, 'method');
        if (m && (m.text === 'require' || m.text === 'require_relative')) {
          const arg = firstOfType(n, 'string');
          if (arg) {
            const frag = firstOfType(arg, 'string_content');
            const raw = (frag ? frag.text : arg.text).replace(/^['"]|['"]$/g, '');
            if (raw) imports.push(raw);
          }
        }
      }
      if (n.type === 'class' || n.type === 'module') {
        const nameNode = childField(n, 'name');
        const name = nameNode?.text;
        if (!name) continue;
        const kind = n.type === 'module' ? 'interface' : 'class';
        const ext = [], impl = [];
        const sc = childField(n, 'superclass');
        if (sc) { const t = firstOfType(sc, 'constant') || firstOfType(sc, 'scope_resolution'); if (t) ext.push(t.text.split('::').pop()); }
        const fields = [], seenF = new Set();
        const body = childField(n, 'body') || firstOfType(n, 'body_statement');
        if (body) for (const d of descendants(body)) {
          // `include Mod` inside the body → implements edge.
          if (d.type === 'call') {
            const mm = childField(d, 'method');
            if (mm && (mm.text === 'include' || mm.text === 'prepend' || mm.text === 'extend')) {
              const argc = firstOfType(d, 'constant');
              if (argc) impl.push(argc.text);
            }
          }
          // `@ivar = ...` assignment → field.
          if (d.type === 'assignment') {
            const left = childField(d, 'left');
            if (left && left.type === 'instance_variable' && !seenF.has(left.text)) {
              seenF.add(left.text);
              fields.push({ name: left.text.replace(/^@/, ''), type: '' });
            }
          }
        }
        classes.push(mk(name, kind, { extends: ext, implements: impl, fields }));
        exports.push({ name });
      }
    }
    return { classes, exports, imports };
  },

  // PHP — class extends → extends, implements → implements, typed properties → fields,
  // namespace / use → imports.
  php(root) {
    const classes = [], exports = [], imports = [];
    for (const n of descendants(root)) {
      if (n.type === 'namespace_use_declaration') {
        for (const cl of collectShallow(n, 'namespace_use_clause', [])) {
          // The inner `name` node collapses `Core\Shape` → `CoreShape` (separators are
          // anonymous tokens); the clause's own text preserves the backslashes. `use X as Y`
          // keeps only the path before `as`. Emit a DOTTED namespace (`Geo.Core.IShape`) so
          // codemap.mjs's byNamespace resolver — shared with C# `using` — maps it to the file
          // declaring that namespace (PHP namespaces don't mirror directory layout).
          const raw = cl.text.split(/\s+as\s+/i)[0].trim();
          const dotted = raw.replace(/^\\+/, '').split('\\').filter(Boolean).join('.');
          if (dotted) imports.push(dotted);
        }
      }
      if (n.type === 'class_declaration' || n.type === 'interface_declaration' || n.type === 'trait_declaration') {
        const name = childField(n, 'name')?.text;
        if (!name) continue;
        const kind = n.type === 'interface_declaration' ? 'interface' : 'class';
        const ext = [], impl = [];
        const baseClause = firstOfType(n, 'base_clause');
        if (baseClause) for (const t of collectShallow(baseClause, 'name', [])) ext.push(t.text);
        const ifaceClause = firstOfType(n, 'class_interface_clause');
        if (ifaceClause) for (const t of collectShallow(ifaceClause, 'name', [])) impl.push(t.text);
        const fields = [];
        const body = firstOfType(n, 'declaration_list');
        if (body) for (const pd of collectShallow(body, 'property_declaration', ['declaration_list'])) {
          const ty = firstOfType(pd, 'named_type')?.text || firstOfType(pd, 'primitive_type')?.text || '';
          const el = firstOfType(pd, 'property_element');
          const vn = el ? firstOfType(el, 'variable_name') : firstOfType(pd, 'variable_name');
          if (vn) fields.push({ name: vn.text.replace(/^\$/, ''), type: ty });
        }
        classes.push(mk(name, kind, { extends: ext, implements: impl, fields }));
        exports.push({ name });
      }
    }
    return { classes, exports, imports };
  },
};

// .tsx / .jsx use the JSX-capable grammar but the same node-walker — alias the extractor.
EXTRACTORS.tsx = EXTRACTORS.ts;

// Strip a trailing generic argument list and any leading namespace qualifier from a
// heritage type reference: `List<Foo>` → `List`, `ns.Base` → `Base`.
function stripGenericTail(t) {
  return (t || '').replace(/<.*$/, '').split('.').pop().trim();
}

// --- call-site extraction -----------------------------------------------------
// SYNTACTIC, name-matched edges only. The caller is the enclosing function/method's
// declared name; the callee is the trailing identifier of the call target. Receiver
// types are NOT resolved (`user.save()` → callee `save`, not `User.save`) — every edge
// is flagged unresolved by the schema. The walk is uniform across languages given a
// per-language config: which node types are functions, the field holding a function's
// own name, which node types are calls, and the field holding the call target.
const CALL_CONFIG = {
  python: { fn: ['function_definition'], fnName: 'name', call: ['call'], target: 'function' },
  java:   { fn: ['method_declaration', 'constructor_declaration'], fnName: 'name', call: ['method_invocation', 'object_creation_expression'], target: 'name' },
  kotlin: { fn: ['function_declaration'], fnName: 'simple_identifier', call: ['call_expression'], target: null },
  swift:  { fn: ['function_declaration'], fnName: 'simple_identifier', call: ['call_expression'], target: null },
  rust:   { fn: ['function_item'], fnName: 'name', call: ['call_expression'], target: 'function' },
  go:     { fn: ['function_declaration', 'method_declaration'], fnName: 'name', call: ['call_expression'], target: 'function' },
  cpp:    { fn: ['function_definition'], fnName: null, call: ['call_expression'], target: 'function' },
  c:      { fn: ['function_definition'], fnName: null, call: ['call_expression'], target: 'function' },
  ts:     { fn: ['function_declaration', 'method_definition', 'generator_function_declaration'], fnName: null, call: ['call_expression'], target: 'function' },
  tsx:    { fn: ['function_declaration', 'method_definition', 'generator_function_declaration'], fnName: null, call: ['call_expression'], target: 'function' },
  csharp: { fn: ['method_declaration', 'constructor_declaration', 'local_function_statement'], fnName: 'name', call: ['invocation_expression'], target: 'function' },
  ruby:   { fn: ['method', 'singleton_method'], fnName: 'name', call: ['call'], target: 'method' },
  php:    { fn: ['function_definition', 'method_declaration'], fnName: 'name', call: ['function_call_expression', 'member_call_expression', 'scoped_call_expression'], target: 'function' },
};

// The trailing identifier of a call-target node: a bare identifier returns itself; a
// member/attribute/selector/field/scope expression returns its rightmost name segment.
const PROP_TYPES = new Set([
  'property_identifier', 'field_identifier', 'identifier', 'name', 'simple_identifier',
]);
function calleeName(node) {
  if (!node) return null;
  if (node.type === 'identifier' || node.type === 'name' || node.type === 'simple_identifier'
      || node.type === 'property_identifier' || node.type === 'field_identifier') {
    return node.text;
  }
  // member_expression / attribute / selector_expression / field_expression /
  // scoped_identifier — take the last named child that looks like a name.
  for (let i = node.namedChildCount - 1; i >= 0; i--) {
    const c = node.namedChild(i);
    if (PROP_TYPES.has(c.type)) return c.text;
  }
  // Fallback: rightmost dotted/`::`/`->` segment of the raw text.
  const seg = node.text.split(/->|::|\./).pop().trim();
  return /^[A-Za-z_$][\w$]*$/.test(seg) ? seg : null;
}

// The name of a function/method node, via its config field or a first-identifier probe
// (cpp/ts methods nest the name as a declarator/property_identifier, no clean field).
function functionName(node, cfg) {
  if (cfg.fnName) {
    const direct = childField(node, cfg.fnName) || firstOfType(node, cfg.fnName);
    if (direct) return direct.text;
  }
  // ts method_definition → property_identifier; ts function_declaration → identifier;
  // cpp function_definition → function_declarator > identifier/field_identifier.
  if (node.type === 'method_definition') return firstOfType(node, 'property_identifier')?.text || null;
  const decl = firstOfType(node, 'function_declarator');
  if (decl) { const id = firstOfType(decl, 'identifier') || firstOfType(decl, 'field_identifier') || firstOfType(decl, 'qualified_identifier'); if (id) return id.text.split('::').pop(); }
  return firstOfType(node, 'identifier')?.text || null;
}

// Walk the tree once and return { edges, defines }:
//   edges   — { caller, callee } call edges. `caller` is the enclosing function's name (or
//             '<module>' for top-level calls); `callee` is the target's trailing identifier.
//   defines — the set of function/method names DEFINED in this file. This is the true
//             project-definition signal the call-graph precision pass needs: a callee that
//             resolves to a name in the union of all files' `defines` is a real in-repo call,
//             one outside it is a builtin / stdlib / third-party call. Crucially this catches
//             non-exported leaf functions (e.g. a private `safeLstat`) that the caller/export
//             sets miss. Collected from the same fnTypes nodes the call walk already visits.
// Self-recursive and language-builtin calls are kept — the schema caps per module, and
// de-noising is a future type-resolution layer's job, not this one's.
function extractCalls(root, lang) {
  const cfg = CALL_CONFIG[lang];
  if (!cfg) return { edges: [], defines: [] };
  const fnTypes = new Set(cfg.fn);
  const callTypes = new Set(cfg.call);
  const edges = [];
  const defines = new Set();
  const seen = new Set();
  const emit = (caller, callee) => {
    if (!caller || !callee) return;
    const key = caller + '' + callee;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ caller, callee });
  };
  // Find the nearest enclosing function name for a call node (walk up to the first fn).
  const enclosingName = (n) => {
    for (let a = n.parent; a; a = a.parent) {
      if (fnTypes.has(a.type)) return functionName(a, cfg) || '<anonymous>';
    }
    return '<module>';
  };
  for (const n of descendants(root)) {
    if (fnTypes.has(n.type)) {
      const name = functionName(n, cfg);
      if (name && name !== '<anonymous>') defines.add(name);
    }
    if (!callTypes.has(n.type)) continue;
    // PHP member_call_expression carries the method under a `name` field, not `function`.
    let targetNode = childField(n, cfg.target);
    if (!targetNode && (n.type === 'member_call_expression' || n.type === 'scoped_call_expression')) {
      targetNode = childField(n, 'name');
    }
    if (!targetNode) targetNode = n.namedChild(0); // kotlin/swift call_expression: target is first child
    const callee = calleeName(targetNode);
    if (!callee) continue;
    emit(enclosingName(n), callee);
  }
  return { edges, defines: [...defines] };
}

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
  // Call-site edges + defined-function names. Best-effort: a throw here must not sink the
  // whole extraction — declarations/imports are the load-bearing output, calls are additive.
  try {
    const { edges, defines } = extractCalls(root, lang);
    result.calls = edges;
    result.defines = defines;
  } catch { result.calls = []; result.defines = []; }
  return result;
}
