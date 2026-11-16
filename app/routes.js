import { index, route } from "@react-router/dev/routes";

export default [
  index("routes/_index/route.jsx"),
  route("auth/*", "routes/auth.$.jsx"),
  route("auth/login", "routes/auth.login/route.jsx"),
  route("app", "routes/app.jsx", [
    index("routes/app._index.jsx"),
    route("bulk-update", "routes/app.bulk-update.jsx"),
  ]),
  route("webhooks/app/uninstalled", "routes/webhooks.app.uninstalled.jsx"),
  route(
    "webhooks/customers/data_request",
    "routes/webhooks.customers.data_request.jsx",
  ),
  route("webhooks/customers/redact", "routes/webhooks.customers.redact.jsx"),
  route("webhooks/shop/redact", "routes/webhooks.shop.redact.jsx"),
];
