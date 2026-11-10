#!/usr/bin/env bash
cat > slug.js <<'JS'
// Turns a post title into a URL slug: lower case ASCII words joined by "-".
// Accents are stripped; letters with no ASCII base (ß, ł, ø) act as a word break. Titles are English.
function slugify(title) {
  return String(title)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

module.exports = { slugify };
JS
