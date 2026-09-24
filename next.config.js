/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // O compartilhamento de tela e o acesso a câmera/microfone exigem HTTPS.
  // A Vercel já serve tudo em produção via HTTPS por padrão.
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(self), display-capture=(self)',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
