'use strict';

// CCometixLine install. Checks presence via the staged binary (fast and
// filesystem-only), installs globally via npm if missing. The statusLine
// path written into settings.json is resolved by platform.js.

const fs = require('fs');
const { execSync, spawnSync } = require('child_process');

const PACKAGE = '@cometix/ccline';

function ensureInstalled({ cclinePath }) {
  if (fs.existsSync(cclinePath)) {
    return { action: 'up-to-date', cclinePath };
  }

  if (!npmAvailable()) {
    throw new Error(
      `npm not found on PATH; cannot install ${PACKAGE}. Install Node.js first.`
    );
  }

  install();

  if (!fs.existsSync(cclinePath)) {
    throw new Error(
      `${PACKAGE} installed but binary not found at expected path: ${cclinePath}`
    );
  }

  return { action: 'installed', cclinePath };
}

function install() {
  const result = spawnSync('npm', ['install', '-g', PACKAGE], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    throw new Error(`npm install -g ${PACKAGE} failed with exit code ${result.status}`);
  }
}

function npmAvailable() {
  try {
    execSync('npm --version', {
      stdio: 'ignore',
      shell: process.platform === 'win32',
    });
    return true;
  } catch {
    return false;
  }
}

module.exports = { ensureInstalled };
