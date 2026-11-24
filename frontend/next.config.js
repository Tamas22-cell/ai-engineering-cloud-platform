/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const backendUrl = (
      process.env.BACKEND_URL || 'https://ai-engineering-api.onrender.com'
    ).replace(/\/$/, '');
    return [{ source: '/backend/:path*', destination: `${backendUrl}/:path*` }];
  },
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
