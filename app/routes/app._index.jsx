import { useEffect } from "react";
import { useFetcher, useLoaderData } from "react-router";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

const STALE_JOB_MS = 2 * 60 * 1000;

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  let job = await prisma.bulkUpdateJob.findFirst({
    where: { shop: session.shop },
    orderBy: { startedAt: "desc" },
  });

  if (
    job?.status === "running" &&
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
  }

  return { job };
}

function getProgress(job) {
  if (!job) return 0;
  if (job.status === "completed") return 100;
  const total = job.totalProducts + job.totalCollections;
  if (total === 0) return 0;
  return Math.min(
    99,
    Math.floor(((job.productsScanned + job.collectionsScanned) / total) * 100),
  );
}

export default function Home() {
  const { job: loadedJob } = useLoaderData();
  const fetcher = useFetcher();
  const job = fetcher.data?.job || loadedJob;
  const responseError = fetcher.data?.errorMessage;
  const isRunning = job?.status === "running";
  const progress = getProgress(job);

  useEffect(() => {
    if (
      fetcher.state !== "idle" ||
      fetcher.data?.done !== false ||
      !fetcher.data?.job?.id
    ) {
      return undefined;
    }

    const delay = fetcher.data.busy ? 1200 : 150;
    const timer = setTimeout(() => {
      fetcher.submit(
        { jobId: fetcher.data.job.id },
        { method: "post", encType: "application/json" },
      );
    }, delay);

    return () => clearTimeout(timer);
  }, [fetcher.data, fetcher.state, fetcher.submit]);

  function startOrResume() {
    const jobId = isRunning ? job.id : undefined;
    fetcher.submit(
      jobId ? { jobId } : {},
      { method: "post", encType: "application/json" },
    );
  }

  return (
    <s-page heading="Alt Text Bulk Filler">
      <s-section heading="Fill missing alt text">
        <s-paragraph>
          Fill missing alt text on product images and collection featured
          images using each product or collection title. Existing alt text is
          never overwritten.
        </s-paragraph>
        <s-button
          variant="primary"
          onClick={startOrResume}
          loading={fetcher.state !== "idle"}
          disabled={fetcher.state !== "idle"}
        >
          {isRunning ? "Resume bulk update" : "Start bulk update"}
        </s-button>
      </s-section>

      {job?.status === "running" ? (
        <s-section heading="Bulk update in progress">
          <s-progress
            value={progress}
            max={100}
            accessibilityLabel="Bulk update progress"
          />
          <s-paragraph>
            Scanned {job.productsScanned.toLocaleString()} of{" "}
            {job.totalProducts.toLocaleString()} products and{" "}
            {job.collectionsScanned.toLocaleString()} of{" "}
            {job.totalCollections.toLocaleString()} collections.
          </s-paragraph>
          <s-paragraph>
            Updated {job.productsUpdated.toLocaleString()} product images and{" "}
            {job.collectionsUpdated.toLocaleString()} collection images.
          </s-paragraph>
        </s-section>
      ) : null}

      {job?.status === "completed" ? (
        <s-banner tone="success" heading="Bulk update complete">
          <s-paragraph>
            {job.productsUpdated + job.collectionsUpdated === 0
              ? "No images were missing alt text."
              : `Updated ${job.productsUpdated.toLocaleString()} product images and ${job.collectionsUpdated.toLocaleString()} collection images.`}
          </s-paragraph>
        </s-banner>
      ) : null}

      {job?.status === "failed" || responseError ? (
        <s-banner tone="critical" heading="Bulk update failed">
          <s-paragraph>
            {responseError ||
              job.errorMessage ||
              "The update could not be completed."}
          </s-paragraph>
        </s-banner>
      ) : null}
    </s-page>
  );
}
