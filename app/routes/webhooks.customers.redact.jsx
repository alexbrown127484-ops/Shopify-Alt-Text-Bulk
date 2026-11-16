import { authenticate } from "../shopify.server";

export async function action({ request }) {
  await authenticate.webhook(request);
  return new Response(null, { status: 200 });
}

