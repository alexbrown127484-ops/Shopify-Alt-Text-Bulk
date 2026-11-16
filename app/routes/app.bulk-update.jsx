import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import {
  CATALOG_COUNTS_QUERY,
  GET_COLLECTIONS_WITH_IMAGE_QUERY,
  GET_PRODUCTS_WITH_MEDIA_QUERY,
  executeWithRetry,
  isAltTextMissing,
  updateFilesInChunks,
} from "../shopifyGraphqlHelpers";

const STALE_JOB_MS = 2 * 60 * 1000;
const LEASE_MS = 60 * 1000;
const ACTION_BUDGET_MS = 8 * 1000;

export const config = { maxDuration: 60 };

function progressFor(job) {
  return {
    id: job.id,
    status: job.status,
    productsUpdated: job.productsUpdated,
    collectionsUpdated: job.collectionsUpdated,
    productsScanned: job.productsScanned,
    collectionsScanned: job.collectionsScanned,
    totalProducts: job.totalProducts,
    totalCollections: job.totalCollections,
    errorMessage: job.errorMessage,
  };
}

function responseFor(job, options = {}, status = 200) {
  const done = job.status !== "running";
  return Response.json(
    { job: progressFor(job), done, ...options },
    { status },
  );
}

async function readRequestBody(request) {
  if (request.headers.get("content-type")?.includes("application/json")) {
    return request.json();
  }
  const formData = await request.formData();
  return { jobId: formData.get("jobId") || undefined };
}

async function startJob(shop, admin) {
  const existing = await prisma.bulkUpdateJob.findFirst({
    where: { shop, status: "running" },
    orderBy: { startedAt: "desc" },
  });

  if (
    existing &&
    Date.now() - existing.lastHeartbeatAt.getTime() <= STALE_JOB_MS
  ) {
    return { job: existing, conflict: true };
  }

  const countsData = await executeWithRetry(admin, CATALOG_COUNTS_QUERY);
  const totalProducts = countsData.productsCount?.count;
  const totalCollections = countsData.collectionsCount?.count;

  if (!Number.isInteger(totalProducts) || !Number.isInteger(totalCollections)) {
    throw new Error("Shopify did not return valid product and collection counts.");
  }

  return prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw`
      WITH acquired AS (
        SELECT pg_advisory_xact_lock(hashtextextended(${shop}, 0))
      )
      SELECT TRUE AS locked FROM acquired
    `;

    const activeJob = await transaction.bulkUpdateJob.findFirst({
      where: { shop, status: "running" },
      orderBy: { startedAt: "desc" },
    });

    if (
      activeJob &&
      Date.now() - activeJob.lastHeartbeatAt.getTime() <= STALE_JOB_MS
    ) {
      return { job: activeJob, conflict: true };
    }

    if (activeJob) {
      await transaction.bulkUpdateJob.update({
        where: { id: activeJob.id },
        data: {
          status: "failed",
          errorMessage: "The job stopped responding and was marked as failed.",
          finishedAt: new Date(),
          leaseExpiresAt: null,
        },
      });
    }

    const job = await transaction.bulkUpdateJob.create({
      data: {
        shop,
        status: "running",
        totalProducts,
        totalCollections,
      },
    });

    return { job, conflict: false };
  });
}

async function persistPage(job, shop, data) {
  return prisma.bulkUpdateJob.update({
    where: { id: job.id },
    data: {
      ...data,
      lastHeartbeatAt: new Date(),
      leaseExpiresAt: new Date(Date.now() + LEASE_MS),
    },
  });
}

async function processProductPage(job, shop, admin) {
  const data = await executeWithRetry(admin, GET_PRODUCTS_WITH_MEDIA_QUERY, {
    after: job.productCursor,
  });
  const connection = data.products;

  if (!connection) {
    throw new Error("Shopify did not return the product connection.");
  }

  const files = new Map();
  for (const product of connection.nodes) {
    for (const media of product.media.nodes) {
      if (media.__typename !== "MediaImage") continue;
      if (
        media.status === "READY" &&
        isAltTextMissing(media.image?.altText) &&
        product.title?.trim() &&
        !files.has(media.id)
      ) {
        files.set(media.id, { id: media.id, alt: product.title.trim() });
      }
    }
  }

  for (const product of connection.nodes) {
    if (product.media.pageInfo?.hasNextPage) {
      throw new Error(
        `Product ${product.id} has more than 250 media items; the job stopped rather than skipping images.`,
      );
    }
  }

  const updated = await updateFilesInChunks(admin, [...files.values()]);
  const { hasNextPage, endCursor } = connection.pageInfo;

  if (hasNextPage && !endCursor) {
    throw new Error("Shopify returned a product page without an end cursor.");
  }

  return persistPage(job, shop, {
    productCursor: endCursor,
    productsDone: !hasNextPage,
    productsScanned: { increment: connection.nodes.length },
    productsUpdated: { increment: updated },
  });
}

async function processCollectionPage(job, shop, admin) {
  const data = await executeWithRetry(admin, GET_COLLECTIONS_WITH_IMAGE_QUERY, {
    after: job.collectionCursor,
  });
  const connection = data.collections;

  if (!connection) {
    throw new Error("Shopify did not return the collection connection.");
  }

  const files = new Map();
  for (const collection of connection.nodes) {
    if (
      collection.image?.id &&
      isAltTextMissing(collection.image.altText) &&
      collection.title?.trim() &&
      !files.has(collection.image.id)
    ) {
      files.set(collection.image.id, {
        id: collection.image.id,
        alt: collection.title.trim(),
      });
    }
  }

  const updated = await updateFilesInChunks(admin, [...files.values()]);
  const { hasNextPage, endCursor } = connection.pageInfo;

  if (hasNextPage && !endCursor) {
    throw new Error("Shopify returned a collection page without an end cursor.");
  }

  return persistPage(job, shop, {
    collectionCursor: endCursor,
    collectionsDone: !hasNextPage,
    collectionsScanned: { increment: connection.nodes.length },
    collectionsUpdated: { increment: updated },
  });
}

async function processJob(job, shop, admin) {
  const now = new Date();
  const claim = await prisma.bulkUpdateJob.updateMany({
    where: {
      id: job.id,
      shop,
      status: "running",
      OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }],
    },
    data: {
      leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
      lastHeartbeatAt: now,
    },
  });

  if (claim.count === 0) {
    const currentJob = await prisma.bulkUpdateJob.findFirst({
      where: { id: job.id, shop },
    });
    if (!currentJob) {
      return Response.json({ errorMessage: "The job could not be found." }, { status: 404 });
    }
    return responseFor(currentJob, { busy: currentJob.status === "running" });
  }

  let currentJob = await prisma.bulkUpdateJob.findUniqueOrThrow({
    where: { id: job.id },
  });
  const startedAt = Date.now();

  try {
    while (
      Date.now() - startedAt < ACTION_BUDGET_MS &&
      currentJob.status === "running"
    ) {
      if (!currentJob.productsDone) {
        currentJob = await processProductPage(currentJob, shop, admin);
      }

      if (
        Date.now() - startedAt < ACTION_BUDGET_MS &&
        !currentJob.collectionsDone
      ) {
        currentJob = await processCollectionPage(currentJob, shop, admin);
      }

      if (currentJob.productsDone && currentJob.collectionsDone) {
        currentJob = await prisma.bulkUpdateJob.update({
          where: { id: currentJob.id },
          data: {
            status: "completed",
            finishedAt: new Date(),
            lastHeartbeatAt: new Date(),
            leaseExpiresAt: null,
          },
        });
      }
    }

    return responseFor(currentJob);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "An unknown error occurred.";
    await prisma.bulkUpdateJob.update({
      where: { id: currentJob.id },
      data: {
        status: "failed",
        errorMessage: errorMessage.slice(0, 2000),
        finishedAt: new Date(),
        lastHeartbeatAt: new Date(),
        leaseExpiresAt: null,
      },
    });
    const failedJob = await prisma.bulkUpdateJob.findUniqueOrThrow({
      where: { id: currentJob.id },
    });
    return responseFor(failedJob, {}, 500);
  } finally {
    await prisma.bulkUpdateJob.updateMany({
      where: { id: job.id, shop, status: "running" },
      data: { leaseExpiresAt: null },
    });
  }
}

export async function action({ request }) {
  const { admin, session } = await authenticate.admin(request);
  let body;

  try {
    body = await readRequestBody(request);
  } catch {
    return Response.json(
      { errorMessage: "The request body could not be read." },
      { status: 400 },
    );
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json(
      { errorMessage: "The request body must be an object." },
      { status: 400 },
    );
  }

  if (
    body.jobId !== undefined &&
    (typeof body.jobId !== "string" || body.jobId.length === 0)
  ) {
    return Response.json({ errorMessage: "Invalid job id." }, { status: 400 });
  }

  let job;

  if (body.jobId) {
    job = await prisma.bulkUpdateJob.findFirst({
      where: { id: body.jobId, shop: session.shop },
    });
    if (!job) {
      return Response.json({ errorMessage: "The job could not be found." }, { status: 404 });
    }
    if (job.status !== "running") return responseFor(job);
  } else {
    try {
      const result = await startJob(session.shop, admin);
      job = result.job;
      if (result.conflict) return responseFor(job, { busy: true }, 409);
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message.slice(0, 2000)
          : "The bulk update could not be started.";
      return Response.json({ errorMessage }, { status: 500 });
    }
  }

  if (
    job.status === "running" &&
    Date.now() - job.lastHeartbeatAt.getTime() > STALE_JOB_MS
  ) {
    job = await prisma.bulkUpdateJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        errorMessage: "The job stopped responding and can be restarted.",
        finishedAt: new Date(),
        leaseExpiresAt: null,
      },
    });
    return responseFor(job);
  }

  return processJob(job, session.shop, admin);
}
