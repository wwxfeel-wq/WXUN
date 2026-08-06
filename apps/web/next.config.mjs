import path from 'path';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  transpilePackages: ['@echolife/shared'],
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    optimizePackageImports: ['lucide-react', 'framer-motion'],
  },
  webpack(config) {
    config.resolve.alias['@'] = path.resolve('./src');
    config.resolve.alias['@echolife/shared'] = path.resolve('../../packages/shared/index.ts');
    return config;
  },
  async rewrites() {
    // In Docker, API_INTERNAL_URL is set to http://api:3001 (service name).
    // In local dev, it falls back to http://localhost:3001.
    // Note: In production with Nginx, /api/ requests bypass Next.js entirely
    // and go directly to the API container. This rewrite only matters for SSR.
    const apiTarget = process.env.API_INTERNAL_URL || 'http://localhost:3001';
    return [
      {
        source: '/api/v1/:path*',
        destination: `${apiTarget}/api/v1/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
        ],
      },
    ];
  },
};

export default nextConfig;
