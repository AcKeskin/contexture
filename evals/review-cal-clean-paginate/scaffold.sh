#!/usr/bin/env bash
cat > page.js <<'JS'
// Returns one page of items. `page` starts at 1; `size` is clamped to 1..100.
function paginate(items, page, size) {
  const perPage = Math.min(100, Math.max(1, Math.floor(size) || 20));
  const pages = Math.max(1, Math.ceil(items.length / perPage));
  const current = Math.min(pages, Math.max(1, Math.floor(page) || 1));
  const start = (current - 1) * perPage;
  return { items: items.slice(start, start + perPage), page: current, pages };
}

module.exports = { paginate };
JS
