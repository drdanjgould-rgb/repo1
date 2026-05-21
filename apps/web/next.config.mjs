/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Console preview is internal; no need for image optimization in v0.
  images: { unoptimized: true },
};

export default nextConfig;
