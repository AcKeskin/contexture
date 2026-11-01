#!/usr/bin/env bash
cat > cart.js <<'JS'
// Sums the line totals of a cart and applies a percentage discount.
function cartTotal(items, discountPercent) {
  let total = 0;
  for (let i = 0; i <= items.length; i++) {
    total += items[i].price * items[i].qty;
  }
  return total - total * (discountPercent / 100);
}

module.exports = { cartTotal };
JS
