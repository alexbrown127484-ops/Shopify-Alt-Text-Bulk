# Shopify Alt Text Bulk Filler

An embedded Shopify Admin app that fills missing product-image and collection featured-image alt text from the parent title. Existing non-empty alt text is never overwritten. Shopify Admin API calls are authenticated with Shopify's React Router app package, and both sessions and resumable job state are stored in Postgres.

## Requirements

- Node.js 22.12 or newer
- Shopify CLI
- A Shopify development store and app
- Polaris web components, loaded from Shopify's CDN as used by the current Shopify app template
- Hosted PostgreSQL with pooled and direct connection strings
- Vercel project on a plan that supports a 60-second function duration for the bulk-update route

## Local development

1. Install dependencies:

   ```sh
   npm install
   ```

2. Copy `.env.example` to `.env` and set `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SCOPES`, `SHOPIFY_APP_URL`, `DATABASE_URL`, and `DIRECT_URL`.
   - Use a pooled Postgres URL for `DATABASE_URL`.
   - Use a direct/unpooled URL for `DIRECT_URL`.
   - Do not commit `.env` or put secrets in client-side code.
3. Create/link the Shopify app configuration with the CLI:

   ```sh
   shopify app config link
   ```

   For local development, Shopify CLI manages the development URL and OAuth tunnel. Keep the production URL in `shopify.app.toml` pointed at the stable production domain.
4. Generate the Prisma client and apply migrations:

   ```sh
   npx prisma generate
   npx prisma migrate deploy
   ```

5. Start Shopify CLI development:

   ```sh
   npm run dev
   ```

Requested access scopes are `read_products` and `write_files`. A merchant account must have permission to edit files for Shopify's `fileUpdate` mutation to succeed.

## GitHub and Vercel deployment

1. Push this project to a GitHub repository.
2. Import the repository in Vercel. Use `main` for production deployments and enable preview deployments for pull requests/branches.
3. Configure the Vercel build command as `npm run vercel-build` (also set in `vercel.json`). It generates Prisma Client, runs `prisma migrate deploy`, then builds React Router. It recognizes explicit `DATABASE_URL`/`DIRECT_URL`, the Storage integration variables `STORAGE_PRISMA_DATABASE_URL` (pooled) and `STORAGE_DATABASE_URL` (direct), Neon `DATABASE_URL_UNPOOLED`, and Vercel Postgres `POSTGRES_PRISMA_URL`/`POSTGRES_URL` plus `POSTGRES_URL_NON_POOLING`.
4. Add these environment variables in Vercel project settings:

   | Variable | Purpose |
   | --- | --- |
   | `SHOPIFY_API_KEY` | Shopify app client ID |
   | `SHOPIFY_API_SECRET` | Shopify app secret; mark sensitive |
   | `SCOPES` | `read_products,write_files` |
   | `SHOPIFY_APP_URL` | Stable production HTTPS URL (for this project, `https://shopify-alt-text-bulk-fix.vercel.app`; do not leave the scaffold placeholder) |
   | `DATABASE_URL` | Pooled Postgres connection string; mark sensitive. The build can also use `STORAGE_PRISMA_DATABASE_URL` or `STORAGE_DATABASE_URL_POOLED`. |
   | `DIRECT_URL` | Direct/unpooled Postgres connection string for migrations; mark sensitive. The build can also use `STORAGE_DATABASE_URL`, `DATABASE_URL_UNPOOLED`, or `POSTGRES_URL_NON_POOLING`. |

5. Use a separate Postgres database for Vercel Preview deployments, and set its pooled and direct URLs in the Preview environment. Do not let preview builds run schema migrations against production.
6. `shopify.app.toml` is configured for `https://shopify-alt-text-bulk-fix.vercel.app`. If your Vercel production domain differs, replace it with the stable production URL (or custom domain). Keep the app URL and OAuth redirect URL pointed at production, never a per-deployment preview URL:

   ```toml
   application_url = "https://<production-domain>"
   redirect_urls = ["https://<production-domain>/auth/callback"]
   ```

7. Deploy the Shopify app configuration and reinstall/update the app on a development store:

   ```sh
   shopify app deploy
   ```

   Confirm the OAuth flow and webhook delivery against the deployed URL. Preview deployments do not change the Shopify production app URL.

The server uses Vercel's `VERCEL_PROJECT_PRODUCTION_URL` if `SHOPIFY_APP_URL` is still the scaffold placeholder, and maps the Storage integration's pooled/direct database variable names for Prisma at runtime. Still replace the placeholder in Vercel and `shopify.app.toml`, and set the Shopify API key/secret to the correct app credentials before merchant requests can authenticate.

Opening the public production URL redirects to `/auth/login`. Shopify Admin requests with shop/session context open the embedded `/app`; direct `/app` visits without Shopify context return to the login form.

## Resumable bulk-update behavior

- A new job records the shop, catalog counts, independent product and collection cursors, scan/update counts, heartbeat, and a short-lived processing lease in Postgres.
- Before creating a job, the action checks for a running job for that shop. An active job produces HTTP 409 with its current progress. A job with no heartbeat for two minutes is marked failed before a replacement job is created.
- Each POST claims the job lease, processes product and collection pages for at most eight seconds, and persists each completed page's cursor and counters before returning. The UI posts again while the job remains active. A lease prevents concurrent posts from processing the same page; abandoned leases expire.
- Product pages fetch at most three products and up to 250 media items per product to keep requested query cost bounded. Shopify's documented input-array maximum for `fileUpdate` is 250, so updates are chunked at that size.
- Only ready `MediaImage` files with missing/blank alt text are updated. Collections with an image are handled similarly. Shopify mutation `userErrors` fail the current job visibly; successful earlier changes remain safe to retry because they are no longer missing alt text.
- The Vercel route is configured for a 60-second maximum duration while its normal page-processing budget is eight seconds. Vercel must be configured on a plan/runtime that honors this duration.
- If an image is still processing, its media status is not `READY` and it is skipped; starting a later job will check it again. A product with more than 250 media items fails explicitly rather than silently skipping media pagination.

The Prisma generator uses `binaryTargets = ["native"]`; Vercel runs `prisma generate` in the deployment build environment so Prisma selects the build runtime's native engine. Verify Prisma's deployment requirements if changing the Vercel build/runtime or moving generation to another platform.

## Testing checklist

- [ ] Fresh Vercel deployment applies committed migrations with `prisma migrate deploy`.
- [ ] Prisma session storage persists an authenticated session across two separate requests/instances.
- [ ] Missing, null, and blank product image alt text is filled from the product title.
- [ ] Missing collection featured-image alt text is filled from the collection title.
- [ ] Existing non-empty alt text remains unchanged; a second run makes no duplicate changes.
- [ ] Empty catalogs and catalogs with no missing alt text complete successfully with a zero-result message.
- [ ] More than one product/collection page completes through automatic polling, with persisted cursors and counters between requests.
- [ ] A job that exceeds one function invocation resumes without losing progress.
- [ ] A second start request for an active job returns HTTP 409 with current progress; stale jobs can be restarted.
- [ ] Shopify throttling retries with backoff, and `fileUpdate` batches stay at or below 250.
- [ ] Shopify `userErrors` are visible as a failed job rather than silently advancing cursors.
- [ ] Webhook requests with invalid signatures are rejected by Shopify SDK authentication; valid uninstall and shop-redact requests remove stored shop data.
- [ ] Preview deployment URLs do not change production OAuth or webhook URLs.
- [ ] Concurrent invocations use the pooled `DATABASE_URL` and do not exhaust Postgres connections.
