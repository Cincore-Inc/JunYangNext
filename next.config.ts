import type { NextConfig } from "next";

const nextConfig: NextConfig = { output: "standalone", serverExternalPackages: ["mysql2", "ali-oss"] };

export default nextConfig;
