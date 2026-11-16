import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  Outlet,
  redirect,
  useLoaderData,
  useRouteError,
} from "react-router";
import { hasShopifyRequestContext } from "../shopify-request-context.server";
import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  if (!hasShopifyRequestContext(request)) {
    return redirect("/auth/login");
  }

  await authenticate.admin(request);
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
}

export default function EmbeddedApp() {
  const { apiKey } = useLoaderData();

  return (
    <AppProvider apiKey={apiKey}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <nav aria-label="App navigation">
        <s-app-nav>
          <s-link href="/app">Home</s-link>
        </s-app-nav>
      </nav>
      <main id="main-content">
        <Outlet />
      </main>
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export function headers(args) {
  return boundary.headers(args);
}
