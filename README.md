# MyKitchen

## Android Build Instructions

To build the Android project from a fresh clone, run the automated bootstrap script:

```bash
bun run android:build
# or
npm run android:build
# or
bash scripts/setup-android.sh
```

### Dependency Chain

The `android:build` script automatically executes the required build pipeline:

1. **Dependencies Installation**: Runs `bun install` (or `npm install`) to ensure all npm packages and `@capacitor/*` CLI dependencies are present.
2. **Web Assets Compilation**: Runs `bun run build` to build production web assets into `dist/`.
3. **Capacitor Sync**: Runs `bunx cap sync android` to copy the web assets into `android/app/src/main/assets/public/` and synchronize Capacitor plugins.
4. **Android Gradle Build**: Runs `cd android && ./gradlew assembleDebug` to compile the debug APK (`app-debug.apk`).

### Prerequisites
- Java JDK 17 or higher (`JAVA_HOME` configured)
- Android SDK (for building APKs via Gradle)
