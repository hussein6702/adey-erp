/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      'html2canvas': 'html2canvas-pro',
    };
    return config;
  },
  experimental: {
    turbo: {
      resolveAlias: {
        'html2canvas': 'html2canvas-pro',
      },
    },
  },
};

export default nextConfig;
