import assert from "node:assert/strict";
import test from "node:test";
import { hasShopifyRequestContext } from "../app/shopify-request-context.server.js";

test("recognizes Shopify shop query context", () => {
  const request = new Request(
    "https://app.example.com/app?shop=store.myshopify.com&host=admin",
  );

  assert.equal(hasShopifyRequestContext(request), true);
});

test("recognizes Shopify session-token authorization context", () => {
  const request = new Request("https://app.example.com/app", {
    headers: { authorization: "Bearer session-token" },
  });

  assert.equal(hasShopifyRequestContext(request), true);
});

test("rejects direct browser requests without Shopify context", () => {
  const request = new Request("https://app.example.com/app");

  assert.equal(hasShopifyRequestContext(request), false);
});
