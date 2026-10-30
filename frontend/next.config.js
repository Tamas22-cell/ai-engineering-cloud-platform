/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [{ source: '/backend/:path*', destination: 'https://ai-engineering-api.onrender.com/:path*' }];
  },
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
