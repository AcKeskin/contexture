'use strict';

// Platform detection and path resolution. Single source of truth for
// anywhere the bootstrap needs to know "where does X live on this OS".

const os = require('os');
const path = require('path');

function detect() {
  const platform = process.platform;
  const home = os.homedir();
  const homeClaude = path.join(home, '.claude');

  return {
    platform,
    home,
    homeClaude,
  };
}

module.exports = { detect };
