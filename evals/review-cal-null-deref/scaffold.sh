#!/usr/bin/env bash
cat > notify.js <<'JS'
// Builds the email for an order update. `users` comes from the account service.
function orderEmail(users, order) {
  const user = users.find((u) => u.id === order.userId);
  const to = user.email;
  return { to, subject: `Order ${order.id} is ${order.status}` };
}

module.exports = { orderEmail };
JS
