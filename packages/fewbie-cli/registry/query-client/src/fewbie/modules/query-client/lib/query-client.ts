import { isServer, QueryClient } from "@tanstack/react-query";

// Conservative defaults; tune per project. retry:1 tolerates transient
// network blips without long stalls against a dead backend; staleTime:30s
// avoids refetch storms when navigating between pages that share queries.
function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        staleTime: 30_000,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

// Official TanStack Query pattern for the App Router: the server must never
// share a client across requests, while the browser reuses one singleton so
// the cache survives navigations. Do NOT inline `new QueryClient()` in a
// client component body — every re-render would discard the cache.
export function getQueryClient(): QueryClient {
  if (isServer) return createQueryClient();
  if (!browserQueryClient) browserQueryClient = createQueryClient();
  return browserQueryClient;
}
