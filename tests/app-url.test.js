import assert from "node:assert/strict";
import test from "node:test";
import { getAppUrl } from "../app/app-url.server.js";

test("uses configured production app URL", () => {
  assert.equal(
    getAppUrl({
      SHOPIFY_APP_URL: "https://shop.example.com/",
      VERCEL_PROJECT_PRODUCTION_URL: "shop.vercel.app",
    }),
    "https://shop.example.com",
  );
});

test("uses Vercel production URL instead of scaffold placeholder", () => {
  assert.equal(
    getAppUrl({
      SHOPIFY_APP_URL: "https://your-production-domain.vercel.app",
      VERCEL_PROJECT_PRODUCTION_URL: "shopify-alt-text-bulk-fix.vercel.app",
    }),
    "https://shopify-alt-text-bulk-fix.vercel.app",
  );
});

test("uses a localhost fallback for local development", () => {
  assert.equal(getAppUrl({}), "http://localhost:3000");
});
