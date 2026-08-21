import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  /**
   * Standalone output for the container.
   *
   * Traces the modules the server actually reaches and copies just those, so
   * the runtime image carries a few dozen megabytes instead of the whole
   * node_modules tree. Without it the image ships development dependencies it
   * will never load.
   */
  output: 'standalone',

  /**
   * The response header identifying the framework and its version is free
   * reconnaissance for anyone scanning.
   */
  poweredByHeader: false,
};

export default nextConfig;
