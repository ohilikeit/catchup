/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Build-less internal packages: Next compiles their raw src directly.
  transpilePackages: ['@app/ui', '@app/core'],
};

export default nextConfig;
