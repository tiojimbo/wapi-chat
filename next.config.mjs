/** @type {import('next').NextConfig} */
const nextConfig = {};

export default {
  async rewrites() {
    return [
      {
        source: '/api/whatsapp/:path*',
        destination: 'http://localhost:3001/api/whatsapp/:path*', // ajuste a porta se necessário
      },
    ];
  },
};
