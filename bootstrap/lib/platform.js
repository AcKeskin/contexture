'use strict';

// Platform detection and path resolution. Single source of truth for
// anywhere the bootstrap needs to know "where does X live on this OS".

const os = require('os');
const path = require('path');

function detect() {
  const platform = process.platform;
  const home = os.homedir();
  const homeClaude = path.join(home, '.claude');

  let cclinePath;
  if (platform === 'win32') {
    cclinePath = path.join(homeClaude, 'ccline', 'ccline.exe');
  } else {
    cclinePath = path.join(homeClaude, 'ccline', 'ccline');
  }

  return {
    platform,
    home,
    homeClaude,
    cclinePath,
    // JSON/settings prefer forward slashes on Windows — Claude Code tolerates
    // both, forward slashes avoid escaped-backslash ambiguity.
    cclinePathForSettings: cclinePath.split(path.sep).join('/'),
  };
}

module.exports = { detect };
