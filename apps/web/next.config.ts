import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  transpilePackages: ["@madrasty/contracts"],
  async redirects() {
    return [{ source: "/", destination: "/ar", permanent: false }];
  },
};

export default config;
