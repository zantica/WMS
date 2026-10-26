// apps/web/next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@wms/shared-types"],
};

export default nextConfig;
