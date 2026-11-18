// A small .claude/codemap.md in update-codemap's layout.
export const CODEMAP = `# Architecture — demo
Last updated: 2026-11-18

## Modules
### hooks/
**Role:** hooks

## File deps
- \`hooks/load.ts\` → \`hooks/chain.ts\`
- \`hooks/register.tsx\` → \`hooks/chain.ts\`, \`hooks/load.ts\`

## ./
- \`README.md\` — demo readme

## hooks/
- \`hooks/chain.ts\` — Scope-chain state
  exports: parseIndex — (md: string): Map<string, ; planSteps — (md: string): PlanStep[] ; statusText
- \`hooks/load.ts\` — Reads files
- \`hooks/sub/deep.ts\` — Deep file

## tests/
- \`tests/chain.test.ts\` — chain.test
`

// The same project as update-codemap's codemap.json.
export const CODEMAP_JSON = JSON.stringify({
  version: 1,
  updated: '2026-11-18',
  files: {
    'hooks/chain.ts': {
      purpose: 'Scope-chain state',
      importedBy: ['hooks/load.ts'],
      symbols: [
        { name: 'parseIndex', kind: 'function', line: 3, exported: true },
        { name: 'helper', kind: 'function', line: 9 },
      ],
    },
    'hooks/load.ts': { purpose: 'Reads files', importedBy: [], symbols: [] },
  },
})
