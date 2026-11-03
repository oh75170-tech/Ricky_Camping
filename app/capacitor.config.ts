import type { CapacitorConfig } from '@capacitor/cli';

// 안드로이드 앱(APK) 설정 – 웹 빌드(dist)를 앱 안에 그대로 담아 오프라인으로 실행
const config: CapacitorConfig = {
  appId: 'com.rickcamping.campcanvas',
  appName: 'CampCanvas',
  webDir: 'dist',
  android: { backgroundColor: '#f7f7f6' },
};

export default config;
