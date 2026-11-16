import assert from "node:assert/strict";
import test from "node:test";
import {
  executeWithRetry,
  isAltTextMissing,
  updateFilesInChunks,
} from "../app/shopifyGraphqlHelpers.js";

function response(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

test("isAltTextMissing treats null, empty, and whitespace as missing", () => {
  assert.equal(isAltTextMissing(null), true);
  assert.equal(isAltTextMissing(""), true);
  assert.equal(isAltTextMissing(" \t "), true);
  assert.equal(isAltTextMissing("Product image"), false);
});

test("executeWithRetry returns successful GraphQL data", async () => {
  const admin = {
    graphql: async () =>
      response({
        data: { shop: { name: "Example" } },
        extensions: {
          cost: {
            requestedQueryCost: 1,
            throttleStatus: { currentlyAvailable: 100, restoreRate: 50 },
          },
        },
      }),
  };

  assert.deepEqual(await executeWithRetry(admin, "query { shop { name } }"), {
    shop: { name: "Example" },
  });
});

test("executeWithRetry throws when throttling retries are exhausted", async () => {
  let calls = 0;
  const admin = {
    graphql: async () => {
      calls += 1;
      return response(
        {
          errors: [
            {
              message: "Throttled",
              extensions: { code: "THROTTLED" },
            },
          ],
        },
        200,
      );
    },
  };

  await assert.rejects(
    executeWithRetry(admin, "query { shop { name } }", {}, { maxRetries: 0 }),
    /Throttled/,
  );
  assert.equal(calls, 1);
});

test("updateFilesInChunks splits input at Shopify's 250-file limit", async () => {
  const batches = [];
  const admin = {
    graphql: async (_query, { variables }) => {
      batches.push(variables.files);
      return response({
        data: {
          fileUpdate: {
            files: variables.files.map(({ id }) => ({ id })),
            userErrors: [],
          },
        },
      });
    },
  };
  const files = Array.from({ length: 251 }, (_, index) => ({
    id: `gid://shopify/MediaImage/${index}`,
    alt: `Image ${index}`,
  }));

  assert.equal(await updateFilesInChunks(admin, files), 251);
  assert.deepEqual(
    batches.map((batch) => batch.length),
    [250, 1],
  );
});

test("updateFilesInChunks surfaces Shopify user errors", async () => {
  const admin = {
    graphql: async () =>
      response({
        data: {
          fileUpdate: {
            files: [],
            userErrors: [{ message: "File is not ready" }],
          },
        },
      }),
  };

  await assert.rejects(
    updateFilesInChunks(admin, [{ id: "gid://shopify/MediaImage/1", alt: "Item" }]),
    /File is not ready/,
  );
});
