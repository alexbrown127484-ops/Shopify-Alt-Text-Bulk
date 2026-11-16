import assert from "node:assert/strict";
import test from "node:test";
import {
  getShopifyAppEntryPath,
  hasShopifyRequestContext,
} from "../app/shopify-request-context.server.js";

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

test("sends Shopify app entry requests to /app without dropping auth params", () => {
  const request = new Request(
    "https://app.example.com/?shop=store.myshopify.com&host=admin&hmac=signature",
  );

  assert.equal(
    getShopifyAppEntryPath(request),
    "/app?shop=store.myshopify.com&host=admin&hmac=signature",
  );
});

test("sends direct browser entry requests to login", () => {
  const request = new Request("https://app.example.com/");

  assert.equal(getShopifyAppEntryPath(request), "/auth/login");
});
