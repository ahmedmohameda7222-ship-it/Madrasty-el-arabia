import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  // Hide only Next.js development badge in disposable screenshot QA; leave runtime errors visible.
  devIndicators: process.env.QA_SCREENSHOTS_ONLY === "1" ? false : undefined,
  transpilePackages: ["@madrasty/contracts"],
  async redirects() {
    return [{ source: "/", destination: "/ar", permanent: false }];
  },
};

export default config;
