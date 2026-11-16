export function hasShopifyRequestContext(request) {
  const url = new URL(request.url);
  return (
    url.searchParams.has("shop") || request.headers.has("authorization")
  );
}

export function getShopifyAppEntryPath(request) {
  if (!hasShopifyRequestContext(request)) return "/auth/login";

  const url = new URL(request.url);
  return `/app${url.search}`;
}
