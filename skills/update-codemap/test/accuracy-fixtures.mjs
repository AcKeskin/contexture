// Ground-truth projects for the accuracy eval (accuracy.mjs). Each fixture is a small
// project with traps (same-name functions, builtins named like project code, aliases,
// build-dir imports, package-scoped calls) and the edges a careful human reads off it:
//
//   imports: [source, target]          file edges from import statements
//   refs:    [source, target]          doc/config references
//   calls:   [file, caller, callee]    in-project calls; callee is the bare name
//   symbols: [file, name, line]        declaration lines
//
// Anything codemap reports that is not listed here counts against precision.

export const ACCURACY_FIXTURES = [
  {
    name: 'ts-monorepo',
    files: {
      'tsconfig.json': '{\n  // shared aliases\n  "compilerOptions": { "baseUrl": ".", "paths": { "@core/*": ["packages/core/src/*"] }, },\n}\n',
      'packages/core/package.json': '{ "name": "@acme/core", "main": "dist/index.js" }\n',
      'packages/core/tsconfig.json': '{ "compilerOptions": { "outDir": "dist", "rootDir": "src" } }\n',
      'packages/core/src/index.ts': "export { add } from './math';\nexport { Counter } from './counter';\n",
      'packages/core/src/math.ts': 'export function add(a: number, b: number): number { return a + b; }\nexport function split(s: string): string[] { return [s]; }\n',
      'packages/core/src/counter.ts': "import { add } from './math';\n\nexport class Counter {\n  n = 0;\n  inc(): void {\n    this.n = add(this.n, 1);\n  }\n}\n",
      'packages/cli/tsconfig.json': '{ "compilerOptions": { "outDir": "./dist", "rootDir": "./src" } }\n',
      'packages/cli/src/run.ts': "import { add } from '@acme/core';\nimport { Counter } from '@core/counter';\n\nexport function run(argv: string[]): number {\n  const parts = argv.join(' ').split(' ');\n  const c = new Counter();\n  c.inc();\n  return add(parts.length, 1);\n}\n",
      'packages/cli/scripts/smoke.mjs': "import { run } from '../dist/run.js';\n\nrun([]);\n",
      'README.md': '# Acme\n\nSee [core](packages/core/src/index.ts) and `packages/cli/src/run.ts`. Broken: [x](nope.md). Web: [w](https://example.com/a.ts).\n',
      'hooks/hooks.json': '{ "hooks": { "Stop": [{ "command": "node ${CLAUDE_PLUGIN_ROOT}/packages/cli/scripts/smoke.mjs" }] } }\n',
    },
    expected: {
      imports: [
        ['packages/core/src/index.ts', 'packages/core/src/math.ts'],
        ['packages/core/src/index.ts', 'packages/core/src/counter.ts'],
        ['packages/core/src/counter.ts', 'packages/core/src/math.ts'],
        ['packages/cli/src/run.ts', 'packages/core/src/index.ts'],
        ['packages/cli/src/run.ts', 'packages/core/src/counter.ts'],
        ['packages/cli/scripts/smoke.mjs', 'packages/cli/src/run.ts'],
      ],
      refs: [
        ['README.md', 'packages/core/src/index.ts'],
        ['README.md', 'packages/cli/src/run.ts'],
        ['hooks/hooks.json', 'packages/cli/scripts/smoke.mjs'],
      ],
      calls: [
        ['packages/core/src/counter.ts', 'inc', 'add'],
        ['packages/cli/src/run.ts', 'run', 'inc'],
        ['packages/cli/src/run.ts', 'run', 'add'],
        ['packages/cli/scripts/smoke.mjs', '<module>', 'run'],
      ],
      symbols: [
        ['packages/core/src/math.ts', 'add', 1],
        ['packages/core/src/math.ts', 'split', 2],
        ['packages/core/src/counter.ts', 'Counter', 3],
        ['packages/core/src/counter.ts', 'inc', 5],
        ['packages/cli/src/run.ts', 'run', 4],
      ],
    },
  },
  {
    name: 'python-pkg',
    files: {
      'app/__init__.py': '',
      'app/util.py': '"""Helpers."""\n\n\ndef normalize(s):\n    return s.strip().lower()\n\n\ndef size(items):\n    return len(items)\n',
      'app/models.py': 'from .util import normalize\n\n\nclass User:\n    def __init__(self, name):\n        self.name = normalize(name)\n\n    def label(self):\n        return self.title()\n\n    def title(self):\n        return self.name.title()\n',
      'app/main.py': 'from app.models import User\nfrom app import util\n\n\ndef main():\n    u = User("x")\n    print(u.label())\n    return util.size([u])\n',
      'other/util.py': 'def normalize(s):\n    return s\n',
    },
    expected: {
      imports: [
        ['app/models.py', 'app/util.py'],
        ['app/main.py', 'app/models.py'],
        ['app/main.py', 'app/util.py'],
      ],
      refs: [],
      calls: [
        ['app/models.py', '__init__', 'normalize'],
        ['app/models.py', 'label', 'title'],
        ['app/main.py', 'main', 'User'],
        ['app/main.py', 'main', 'label'],
        ['app/main.py', 'main', 'size'],
      ],
      symbols: [
        ['app/util.py', 'normalize', 4],
        ['app/util.py', 'size', 8],
        ['app/models.py', 'User', 4],
        ['app/models.py', '__init__', 5],
        ['app/models.py', 'label', 8],
        ['app/models.py', 'title', 11],
        ['app/main.py', 'main', 5],
      ],
    },
  },
  {
    name: 'go-pkg',
    files: {
      'go.mod': 'module example.com/shop\n\ngo 1.22\n',
      'cart/cart.go': 'package cart\n\nfunc Total(items []int) int {\n\treturn sum(items)\n}\n',
      'cart/sum.go': 'package cart\n\nfunc sum(xs []int) int {\n\tn := 0\n\tfor _, x := range xs {\n\t\tn += x\n\t}\n\treturn n\n}\n',
      'report/report.go': 'package report\n\nimport (\n\t"fmt"\n\n\t"example.com/shop/cart"\n)\n\nfunc Print(items []int) {\n\tfmt.Println(cart.Total(items))\n}\n\nfunc sum(a, b int) int { return a + b }\n',
    },
    expected: {
      imports: [
        ['report/report.go', 'cart/cart.go'],
      ],
      refs: [],
      calls: [
        ['cart/cart.go', 'Total', 'sum'],
        ['report/report.go', 'Print', 'Total'],
      ],
      symbols: [
        ['cart/cart.go', 'Total', 3],
        ['cart/sum.go', 'sum', 3],
        ['report/report.go', 'Print', 9],
        ['report/report.go', 'sum', 13],
      ],
    },
  },
  {
    name: 'csharp-ns',
    files: {
      'src/Shop/Cart.cs': 'namespace Shop\n{\n    public class Cart\n    {\n        public int Total() { return Pricing.Sum(new[] { 1, 2 }); }\n    }\n}\n',
      'src/Shop/Pricing.cs': 'namespace Shop\n{\n    public static class Pricing\n    {\n        public static int Sum(int[] xs) { return xs.Length; }\n    }\n}\n',
      'src/App/Program.cs': 'using Shop;\n\nnamespace App\n{\n    public class Program\n    {\n        public static void Main()\n        {\n            var c = new Cart();\n            System.Console.WriteLine(c.Total());\n        }\n    }\n}\n',
    },
    expected: {
      imports: [
        ['src/App/Program.cs', 'src/Shop/Cart.cs'],
      ],
      refs: [],
      calls: [
        ['src/Shop/Cart.cs', 'Total', 'Sum'],
        ['src/App/Program.cs', 'Main', 'Total'],
      ],
      symbols: [
        ['src/Shop/Cart.cs', 'Cart', 3],
        ['src/Shop/Cart.cs', 'Total', 5],
        ['src/Shop/Pricing.cs', 'Pricing', 3],
        ['src/Shop/Pricing.cs', 'Sum', 5],
        ['src/App/Program.cs', 'Program', 5],
        ['src/App/Program.cs', 'Main', 7],
      ],
    },
  },
];
