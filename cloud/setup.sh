#!/usr/bin/env bash
#
# setup.sh — install contexture in a cloud agent container.
#
# Use it as the setup script of a Claude Code cloud environment (Claude
# Projects threads, claude.ai/code), Codex cloud or Jules, as the install step
# of a Cursor cloud agent, or from Copilot's copilot-setup-steps.yml.
#
#   curl -fsSL https://raw.githubusercontent.com/AcKeskin/contexture/main/cloud/setup.sh | bash
#   bash setup.sh --exclude=mcps          # extra args go to bootstrap
#
# CONTEXTURE_DIR  where to clone (default ~/contexture)
# CONTEXTURE_REPO what to clone  (default the public repo)

set -euo pipefail

DIR="${CONTEXTURE_DIR:-$HOME/contexture}"
REPO="${CONTEXTURE_REPO:-https://github.com/AcKeskin/contexture.git}"

if [ -d "$DIR/.git" ]; then
  git -C "$DIR" pull -q --ff-only
else
  git clone -q --depth 1 "$REPO" "$DIR"
fi

# Containers start fresh, so the drift check only adds noise. Project threads
# keep shared files in /mnt/project-files, outside the repo; let writes there through.
node - "$HOME/.claude/hook-config.json" <<'EOF'
const fs = require('fs');
const path = require('path');
const file = process.argv[2];
const cfg = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
cfg.enabled = cfg.enabled || {};
cfg.enabled.hookBundles = { bootstrapDrift: false, ...cfg.enabled.hookBundles };
const allow = (cfg.outsideProjectWriteBlocker = cfg.outsideProjectWriteBlocker || {}).allow || [];
if (!allow.includes('/mnt/project-files')) allow.push('/mnt/project-files');
cfg.outsideProjectWriteBlocker.allow = allow;
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n');
EOF

node "$DIR/bootstrap/bootstrap.js" "$@"

# Claude Code cloud sessions can clear ~/.claude/hooks after setup. Point the
# hook commands at the clone so they still resolve.
settings="$HOME/.claude/settings.json"
if [ -f "$settings" ]; then
  sed -i "s#$HOME/.claude/hooks/#$DIR/hooks/#g" "$settings"
fi

# Codex reads personal skills from ~/.codex/skills.
if command -v codex >/dev/null && [ ! -e "$HOME/.codex/skills" ]; then
  mkdir -p "$HOME/.codex"
  ln -s "$DIR/skills" "$HOME/.codex/skills"
fi
