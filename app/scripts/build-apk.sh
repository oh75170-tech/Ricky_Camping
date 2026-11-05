#!/usr/bin/env bash
# 안드로이드 APK 빌드 (GitHub Actions에서 app/ 폴더 기준으로 실행)
# - 항상 같은 서명 키(android-res/debug.keystore)로 서명 → 기존 앱 위에 업데이트 설치 가능
# - 버전 번호는 빌드 시각 기준으로 항상 증가
# - 서명 인증서가 고정 키와 다르면 실패시켜 잘못된 APK가 배포되지 않게 함
set -euo pipefail

EXPECTED_SHA256="11d2540131a6ddc9323e4b886e60d2da3774fbe19487f7a5e237a4ad5d0eee2c"
VERSION_CODE=$(( $(date +%s) / 60 - 29000000 ))   # 분 단위, 항상 증가

npx cap add android
rm -rf android/app/src/main/res/mipmap-anydpi-v26
cp -r android-res/mipmap-* android/app/src/main/res/
sed -i -E "s/versionCode( =)? [0-9]+/versionCode ${VERSION_CODE}/; s/versionName( =)? \"[^\"]*\"/versionName \"1.${VERSION_CODE}\"/" android/app/build.gradle
cat >> android/app/build.gradle <<'GRADLE'

// CampCanvas: 고정 서명 키 (업데이트 설치 호환)
android {
    signingConfigs {
        campcanvas {
            storeFile file("../../android-res/debug.keystore")
            storePassword "android"
            keyAlias "androiddebugkey"
            keyPassword "android"
        }
    }
    buildTypes {
        debug { signingConfig signingConfigs.campcanvas }
        release { signingConfig signingConfigs.campcanvas }
    }
}
GRADLE
grep -E "versionCode|versionName" android/app/build.gradle | head -2
npx cap sync android
(cd android && chmod +x gradlew && ./gradlew assembleDebug --no-daemon)

APK=android/app/build/outputs/apk/debug/app-debug.apk
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
BT=$(ls -d "$SDK"/build-tools/* | sort -V | tail -1)
"$BT/apksigner" verify --print-certs "$APK" | tee apk-cert.txt
if ! grep -qi "SHA-256 digest: ${EXPECTED_SHA256}" apk-cert.txt; then
  echo "::error::APK 서명 인증서가 고정 키와 다릅니다. 업데이트 설치가 깨지므로 배포를 중단합니다."
  exit 1
fi
echo "서명 확인 OK (고정 키), versionCode=${VERSION_CODE}"
cp "$APK" CampCanvas.apk
