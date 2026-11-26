import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: '/:path*', headers: [{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'strict-origin-when-cross-origin'}] },
      { source: '/resources/phd-essay-bundle/thanks', headers: [{key:'X-Robots-Tag',value:'noindex, nofollow'},{key:'Referrer-Policy',value:'no-referrer'},{key:'Cache-Control',value:'private, no-store'}] },
      { source: '/downloads/:path*', headers: [{key:'X-Robots-Tag',value:'noindex'}] },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'i.ytimg.com', pathname: '/vi/**' },
      {
        protocol: 'https',
        hostname: 'covers.openlibrary.org',
      },
      {
        protocol: 'https',
        hostname: 'images.isbndb.com',
      },
    ],
  },
};

export default nextConfig;
