export function hasShopifyRequestContext(request) {
  const url = new URL(request.url);
  return (
    url.searchParams.has("shop") || request.headers.has("authorization")
  );
}
