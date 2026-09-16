import { randomUUID } from "node:crypto";
import { createSerwistRoute } from "@serwist/turbopack";
export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute(
  {
    swSrc: "src/app/sw.ts",
    useNativeEsbuild: true,
    additionalPrecacheEntries: [
      { url: "/offline", revision: process.env.SHELF_BUILD_ID ?? randomUUID() },
    ],
    maximumFileSizeToCacheInBytes: 12 * 1024 ** 2,
    manifestTransforms: [
      async (entries) => ({
        manifest: entries.filter(
          (entry) => !entry.url.endsWith(".map") && !entry.url.startsWith("/api/"),
        ),
        warnings: [],
      }),
    ],
  },
);
