import type { NextConfig } from 'next';
const config: NextConfig = {
  transpilePackages: ['@poa/schemas', '@poa/domain'],
  poweredByHeader: false,
  webpack(config) {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};
export default config;
