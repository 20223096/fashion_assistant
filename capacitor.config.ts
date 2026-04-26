import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor iOS 설정.
 *
 * 이 프로젝트는 Next.js 서버 API(라우트 핸들러)와 sharp / background-removal-node
 * 등 Node 전용 패키지에 의존하기 때문에 정적 export(`output: "export"`)로 네이티브
 * 번들에 말아 넣을 수 없습니다. 대신 Capacitor의 `server.url` 기능을 사용해서
 * iOS 앱이 "이미 실행 중인 Next.js 서버"를 가리키도록 합니다.
 *
 *  - 개발 중:   CAPACITOR_SERVER_URL=http://<맥의-LAN-IP>:3000 npx cap sync ios
 *  - 배포 버전: CAPACITOR_SERVER_URL=https://my-closet.example.com npx cap sync ios
 *
 * 환경 변수를 지정하지 않으면 `public/capacitor-fallback/index.html`이 로딩되며,
 * 실제로는 서버 URL을 항상 지정해서 빌드하는 걸 권장합니다.
 */

const serverUrl = process.env.CAPACITOR_SERVER_URL?.trim();

const config: CapacitorConfig = {
  appId: "com.mycloset.app",
  appName: "my-closet",
  webDir: "public/capacitor-fallback",
  ios: {
    contentInset: "always",
    limitsNavigationsToAppBoundDomains: false,
    scrollEnabled: true,
  },
  server: serverUrl
    ? {
        url: serverUrl,
        // http://<LAN-IP>:3000 처럼 평문 URL을 개발용으로 사용할 때 필요.
        cleartext: serverUrl.startsWith("http://"),
        // OAuth 콜백·Supabase 스토리지 등으로 빠져나갔다가 돌아오는 경로 허용.
        allowNavigation: [
          "*.supabase.co",
          "*.supabase.in",
          "accounts.google.com",
          "appleid.apple.com",
        ],
      }
    : {
        // 개발 중 Live Reload를 쓸 때만 iOS 시뮬레이터/기기에서 로컬 서버에 붙도록 허용.
        // (CAPACITOR_SERVER_URL을 지정하지 않은 경우의 기본값)
        androidScheme: "https",
        iosScheme: "capacitor",
        allowNavigation: [
          "*.supabase.co",
          "*.supabase.in",
          "accounts.google.com",
          "appleid.apple.com",
        ],
      },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1000,
      backgroundColor: "#0a0a0a",
      launchAutoHide: true,
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;
