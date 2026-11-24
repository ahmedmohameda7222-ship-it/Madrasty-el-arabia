import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  // Hide only Next.js development badge in disposable screenshot QA; leave runtime errors visible.
  devIndicators: process.env.QA_SCREENSHOTS_ONLY === "1" ? false : undefined,
  transpilePackages: ["@madrasty/contracts"],
  outputFileTracingIncludes: {"/api/v1/finance/**/pdf": ["./public/school-192.png", "./node_modules/@fontsource/ibm-plex-sans-arabic/package.json", "./node_modules/@fontsource/ibm-plex-sans-arabic/files/*400-normal.woff2"]},
  async redirects() {
    return [{ source: "/", destination: "/ar", permanent: false }];
  },
};

export default config;
