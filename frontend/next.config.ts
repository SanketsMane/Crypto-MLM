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

  /**
   * Devices on the local network may request dev assets.
   *
   * Next blocks cross-origin requests to dev-only assets by default, so opening
   * the site from a phone on the same wifi loaded the HTML and then 403'd every
   * script — a black page with no error to explain it.
   *
   * Private ranges only, and this key has no effect outside `next dev`.
   *
   * Written as dot-segment globs rather than CIDR: Next matches these against
   * the request's *hostname*, segment by segment, so `192.168.0.0/16` is read
   * as a literal name and never matches anything. An IPv4 address is
   * dot-separated, which is why `192.168.*.*` works where the CIDR did not.
   */
  allowedDevOrigins: [
    '*.local',
    '10.*.*.*',
    '172.*.*.*',
    '192.168.*.*',
  ],

  /**
   * The Roaming Club was renamed the Flyers Club and moved with it. Members
   * hold bookmarks, and notifications sent before the rename still carry the
   * old link, so the old path keeps resolving rather than 404ing.
   */
  async redirects() {
    return [
      { source: '/roaming-club', destination: '/flyers-club', permanent: true },
    ];
  },
};

export default nextConfig;
