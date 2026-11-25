import type { NextConfig } from "next";

const pages = process.env.NEXT_PUBLIC_GITHUB_PAGES === "1";

const config: NextConfig = {
  devIndicators: false,
  agentRules: false,
  ...(pages && {
    pageExtensions: ["tsx", "jsx"],
    output: "export",
    basePath: "/validador-local-schema-markup",
    trailingSlash: true,
  }),
};

export default config;
