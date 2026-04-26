#!/usr/bin/env bash
#
# ios/App/App/Info.plist 에 my-closet 에 필요한 권한 키들을 한 번에 추가합니다.
# macOS 기본 내장 도구 `plutil` 만 사용하므로 별도 설치가 필요 없습니다.
#
# 사용법: npm run ios:plist   (혹은)   bash scripts/ios-plist-setup.sh
#
# 이미 존재하는 키는 덮어쓰기 때문에 여러 번 실행해도 안전합니다.

set -euo pipefail

PLIST="ios/App/App/Info.plist"

if [[ ! -f "$PLIST" ]]; then
  echo "❌ $PLIST 이 없습니다. 먼저 'npm run ios:add' 를 실행해서 iOS 프로젝트를 만들어 주세요." >&2
  exit 1
fi

echo "🔧 $PLIST 에 권한 키 추가 중..."

# 문자열 키들 (-string)
plutil -replace NSCameraUsageDescription \
  -string "내 옷과 얼굴 사진을 촬영해 옷장에 등록하고 코디 추천에 사용합니다." "$PLIST"

plutil -replace NSPhotoLibraryUsageDescription \
  -string "사진 라이브러리에서 옷 사진을 선택해 옷장에 등록합니다." "$PLIST"

plutil -replace NSPhotoLibraryAddUsageDescription \
  -string "가상 피팅 결과 이미지를 사진 라이브러리에 저장합니다." "$PLIST"

plutil -replace NSMicrophoneUsageDescription \
  -string "영상 촬영 시 마이크가 필요할 수 있습니다." "$PLIST"

plutil -replace NSLocalNetworkUsageDescription \
  -string "개발 중 로컬 개발 서버와 통신하기 위해 필요합니다." "$PLIST"

# App Transport Security (dict 로 교체)
plutil -replace NSAppTransportSecurity -xml \
'<dict>
  <key>NSAllowsLocalNetworking</key>
  <true/>
  <key>NSAllowsArbitraryLoadsInWebContent</key>
  <true/>
</dict>' "$PLIST"

# 커스텀 URL 스킴 (mycloset://... OAuth 콜백용)
plutil -replace CFBundleURLTypes -xml \
'<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>mycloset</string>
    </array>
  </dict>
</array>' "$PLIST"

echo "✅ 완료! 추가된 키 확인:"
plutil -p "$PLIST" | grep -E "NSCameraUsageDescription|NSPhotoLibrary|NSAppTransportSecurity|NSLocalNetwork|CFBundleURLTypes" || true
