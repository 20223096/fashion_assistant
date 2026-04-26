import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp", "@imgly/background-removal-node"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  // Capacitor iOS WebView(capacitor://localhost, ionic://localhost)와
  // 개발 중 LAN IP에서 dev server에 붙을 수 있게 허용.
  // Next.js 16 의 allowedDevOrigins 는 hostname(호스트 부분)만 받아서
  // CIDR 표기는 매칭이 안 되므로 와일드카드·개별 LAN IP 를 같이 나열.
  allowedDevOrigins: [
    "localhost",
    "capacitor://localhost",
    "ionic://localhost",
    // 가정용 공유기 대역 와일드카드
    "192.168.0.*",
    "192.168.1.*",
    "192.168.35.*",
    "10.0.0.*",
    "10.0.1.*",
    "172.30.*.*",
  ],
  async headers() {
    // Capacitor WebView의 origin은 capacitor://localhost 이므로 API 라우트에
    // CORS 허용 헤더를 달아야 fetch가 동작합니다.
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin", value: "*" },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET,POST,PUT,PATCH,DELETE,OPTIONS",
          },
          {
            key: "Access-Control-Allow-Headers",
            value:
              "Content-Type, Authorization, X-Requested-With, X-Supabase-Auth",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
