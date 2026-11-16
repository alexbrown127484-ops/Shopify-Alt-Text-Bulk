import { redirect } from "react-router";
import { getShopifyAppEntryPath } from "../../shopify-request-context.server";

export function loader({ request }) {
  return redirect(getShopifyAppEntryPath(request));
}
