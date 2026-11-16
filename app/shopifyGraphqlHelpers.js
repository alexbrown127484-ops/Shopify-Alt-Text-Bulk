export const GET_PRODUCTS_WITH_MEDIA_QUERY = `#graphql
  query GetProductsWithMedia($after: String) {
    products(first: 3, after: $after) {
      nodes {
        id
        title
        media(first: 250) {
          nodes {
            __typename
            ... on MediaImage {
              id
              status
              image {
                altText
              }
            }
          }
          pageInfo {
            hasNextPage
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const GET_COLLECTIONS_WITH_IMAGE_QUERY = `#graphql
  query GetCollectionsWithImage($after: String) {
    collections(first: 100, after: $after) {
      nodes {
        id
        title
        image {
          id
          altText
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const CATALOG_COUNTS_QUERY = `#graphql
  query GetCatalogCounts {
    productsCount(limit: null) {
      count
    }
    collectionsCount(limit: null) {
      count
    }
  }
`;

export const FILE_UPDATE_MUTATION = `#graphql
  mutation UpdateFileAltText($files: [FileUpdateInput!]!) {
    fileUpdate(files: $files) {
      files {
        id
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

// Shopify documents a 250-item maximum for input arrays.
export const FILE_UPDATE_BATCH_SIZE = 250;

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function formatGraphqlErrors(errors) {
  return errors
    .map((error) => error.message || "Unknown GraphQL error")
    .join("; ");
}

async function waitForAvailableCost(cost) {
  const throttleStatus = cost?.throttleStatus;
  const requestedCost = cost?.requestedQueryCost ?? cost?.actualQueryCost;
  const available = throttleStatus?.currentlyAvailable;
  const restoreRate = throttleStatus?.restoreRate;

  if (
    Number.isFinite(requestedCost) &&
    Number.isFinite(available) &&
    Number.isFinite(restoreRate) &&
    restoreRate > 0 &&
    available < requestedCost
  ) {
    await sleep(Math.ceil(((requestedCost - available) / restoreRate) * 1000));
  }
}

export async function executeWithRetry(
  admin,
  query,
  variables = {},
  { maxRetries = 5 } = {},
) {
  let retries = 0;

  while (true) {
    const response = await admin.graphql(query, { variables });
    const payload = await response.json();
    const cost = payload.extensions?.cost;
    const errors = Array.isArray(payload.errors) ? payload.errors : [];
    const isThrottled =
      response.status === 429 ||
      errors.some(
        (error) =>
          error.extensions?.code === "THROTTLED" ||
          error.message?.toUpperCase().includes("THROTTLED"),
      );

    if (isThrottled && retries < maxRetries) {
      await sleep(1000 * 2 ** retries);
      retries += 1;
      continue;
    }

    if (errors.length > 0) {
      throw new Error(`Shopify GraphQL request failed: ${formatGraphqlErrors(errors)}`);
    }

    if (!response.ok) {
      throw new Error(`Shopify GraphQL request failed with HTTP ${response.status}.`);
    }

    if (!payload.data) {
      throw new Error("Shopify GraphQL response did not contain data.");
    }

    await waitForAvailableCost(cost);
    return payload.data;
  }
}

export function isAltTextMissing(altText) {
  return typeof altText !== "string" || altText.trim().length === 0;
}

export async function updateFilesInChunks(admin, files) {
  let updatedCount = 0;

  for (let offset = 0; offset < files.length; offset += FILE_UPDATE_BATCH_SIZE) {
    const chunk = files.slice(offset, offset + FILE_UPDATE_BATCH_SIZE);
    const data = await executeWithRetry(admin, FILE_UPDATE_MUTATION, {
      files: chunk,
    });
    const result = data.fileUpdate;

    if (!result) {
      throw new Error("Shopify did not return a fileUpdate result.");
    }

    if (result.userErrors?.length) {
      const details = result.userErrors
        .map((error) => error.message)
        .filter(Boolean)
        .join("; ");
      throw new Error(
        `Shopify rejected ${result.userErrors.length} file update(s): ${details}`,
      );
    }

    updatedCount += result.files?.length ?? 0;
  }

  return updatedCount;
}

