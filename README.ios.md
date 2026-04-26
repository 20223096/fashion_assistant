# my-closet iOS 앱 실행 가이드

이 프로젝트는 Next.js 서버 API(라우트 핸들러)와 Node 전용 패키지(`sharp`,
`@imgly/background-removal-node`, `openai`, Supabase SSR)를 사용하기 때문에
정적 export로 말아 넣을 수 없습니다. 따라서 **[Capacitor](https://capacitorjs.com/)의
`server.url` 기능**을 사용해 iOS 네이티브 쉘이 "이미 실행 중인 Next.js 서버"를
WebView로 로드하는 방식을 채택했습니다.

> 정리하면: iOS 앱 껍데기 + 서버(Next.js, Vercel 등) = App Store에 올릴 수 있는
> 네이티브 앱이 됩니다. 서버는 개발 땐 로컬, 운영 땐 Vercel 같은 호스팅입니다.

## 0. 사전 준비 (최초 1회)

맥에서 다음이 필요합니다.

```bash
# (1) Xcode를 Command Line Tools가 아니라 정식 Xcode로 전환
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -license accept

# (2) CocoaPods 설치 (Homebrew 권장, Ruby gem도 가능)
brew install cocoapods
# 또는:  sudo gem install cocoapods
pod --version  # 1.15+ 정도면 OK
```

설치 후 한 번만:

```bash
npm install
npm run ios:add     # iOS 네이티브 프로젝트(/ios) 생성 + pod install
```

`ios/` 폴더가 생기면 성공입니다.

## 1. Info.plist에 권한 추가 (최초 1회)

`npm run ios:add` 로 생성된 `ios/App/App/Info.plist` 의 최상위 `<dict>` 안에
아래 파일의 내용을 붙여 넣으세요.

- [`ios-config/Info.plist.snippet.xml`](./ios-config/Info.plist.snippet.xml)

카메라/사진 라이브러리 접근, 로컬 네트워크(dev 중 맥 IP로 붙을 때),
OAuth 콜백용 커스텀 URL 스킴(`mycloset://...`) 설정이 포함돼 있습니다.

## 2. 개발 중 실행하기

시뮬레이터/실기기의 WebView가 **맥에서 돌고 있는 Next.js 서버**에 붙도록 합니다.

```bash
# 터미널 A: LAN에 공개된 dev 서버
npm run dev:lan
# ▶  http://0.0.0.0:3000 에서 대기

# 터미널 B: 맥의 LAN IP 확인 후 Capacitor 동기화 + Xcode 오픈
ipconfig getifaddr en0            # 예: 192.168.0.42
CAPACITOR_SERVER_URL=http://192.168.0.42:3000 npm run ios:sync
npm run ios:open
```

Xcode가 열리면 상단에서 시뮬레이터(예: iPhone 15)를 고르고 ▶ 버튼을 누르세요.
앱이 WebView로 Next.js를 그대로 로드합니다. Next.js를 고치면 앱에서도 바로 반영됩니다.

> **실기기 테스트**: 아이폰을 USB로 맥에 연결 → Xcode에서 기기 선택 → 서명(Team) 지정 후 실행.
> 아이폰과 맥은 **같은 Wi-Fi**에 있어야 하고, 맥 방화벽에서 3000 포트가 열려 있어야 합니다.

### 라이브 리로드 팁

- Next.js dev server는 소스 변경 시 자동으로 refresh 되기 때문에 별도 설정 없이도
  HMR이 iOS WebView에서 동작합니다.
- 네이티브 설정(`capacitor.config.ts`, Info.plist, 플러그인)을 바꿨을 때만
  `npm run ios:sync` 를 다시 실행하면 됩니다.

## 3. 배포(App Store) 빌드

운영 URL(예: `https://my-closet.vercel.app`)에 붙도록 한 번만 바꿔 굽고, 이후로는
Next.js 배포만 하면 됩니다.

```bash
CAPACITOR_SERVER_URL=https://my-closet.vercel.app npm run ios:sync
npm run ios:open
```

Xcode에서 `Product → Archive` → `Distribute App → App Store Connect` 플로우로 업로드합니다.

### 배포 전 체크리스트

- [ ] Supabase 프로젝트의 **Redirect URL**에 `mycloset://auth/callback`
      (또는 운영 도메인의 `/auth/callback`)을 등록했는지.
- [ ] `ios/App/App.xcodeproj` 의 Bundle Identifier(`com.mycloset.app`)가
      Apple Developer 포털의 App ID와 일치하는지.
- [ ] `ios/App/App/Info.plist` 에 카메라·사진 권한 설명 문자열이 있는지.
- [ ] App Store Connect에 App Icon, Launch Screen을 설정했는지.
      (Capacitor 기본 아이콘 대체 필요)

## 4. 아키텍처 요약

```
┌──────────────────────────────┐      HTTPS       ┌───────────────────────────┐
│   iOS App (Capacitor shell)  │  ───────────────►│   Next.js (Vercel/self)    │
│   ─ WKWebView                │                  │   ─ App Router pages        │
│   ─ Native plugins (Camera,  │  ◄───────────────│   ─ /api/* route handlers   │
│     Haptics, StatusBar, ...) │                  │   ─ Supabase / OpenAI       │
└──────────────────────────────┘                  └───────────────────────────┘
```

- **UI, 라우팅, 서버 API**: 기존 Next.js 그대로 (`src/app/**`).
- **iOS 네이티브 쉘**: `ios/` 에 Capacitor가 생성한 Xcode 프로젝트.
- **네이티브 ↔ 웹 브릿지**: `@capacitor/camera`, `@capacitor/haptics`,
  `@capacitor/status-bar`, `@capacitor/preferences`, `@capacitor/app` 플러그인 사용.
  필요할 때 클라이언트 컴포넌트에서 `import { Camera } from '@capacitor/camera'` 식으로 호출.

## 5. 자주 겪는 문제

| 증상 | 원인 / 해결 |
|---|---|
| 앱 열자마자 하얀/검은 화면 | `CAPACITOR_SERVER_URL`이 설정되지 않았거나 서버가 안 떠 있음. 터미널 A의 `npm run dev:lan` 확인. |
| `App Transport Security has blocked a cleartext HTTP connection` | `ios-config/Info.plist.snippet.xml`의 `NSAllowsLocalNetworking` 추가 확인. 운영은 HTTPS만 쓰세요. |
| Supabase 로그인 후 앱이 Safari로 빠져나감 | Supabase Redirect URL에 `mycloset://auth/callback` 등록 + `src/app/auth/callback/route.ts`에서 딥링크 처리. |
| `pod install` 에서 에러 | Xcode 전환(`sudo xcode-select -s ...`) 확인 후 `cd ios/App && pod install` 재실행. |
| 빌드가 옛날 웹 자산을 가리킴 | `npm run ios:sync`를 다시 실행하세요. |

## 6. 스크립트 레퍼런스

| 명령 | 설명 |
|---|---|
| `npm run dev` | 로컬 Next.js dev (localhost 전용) |
| `npm run dev:lan` | 0.0.0.0 바인딩 dev (시뮬레이터/실기기에서 붙기 위해) |
| `npm run ios:add` | 최초 1회, `ios/` 네이티브 프로젝트 생성 |
| `npm run ios:sync` | `capacitor.config.ts` + 플러그인 변경을 iOS 프로젝트에 반영 |
| `npm run ios:open` | Xcode 에서 워크스페이스 열기 |
| `npm run ios:run` | CLI에서 시뮬레이터 실행 (xcrun simctl 기반) |
| `npm run ios:dev` | dev 플로우 요약 출력 |
