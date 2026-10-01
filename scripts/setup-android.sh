#!/usr/bin/env bash
set -e

# Always operate from project root directory
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "=== 1. Cleaning Duplicate Files (-1) ==="
node scripts/clean-duplicates.js

echo "=== 2. Installing Dependencies ==="
if [ ! -d "node_modules" ]; then
  if command -v bun >/dev/null 2>&1; then
    bun install
  else
    npm install
  fi
else
  echo "node_modules already present."
fi

echo "=== 3. Building Web Assets ==="
if command -v bun >/dev/null 2>&1; then
  bun run build
else
  npm run build
fi

echo "=== 4. Generating App Icons ==="
node scripts/generate-icons.js

echo "=== 5. Syncing Capacitor Android ==="
if command -v bunx >/dev/null 2>&1; then
  bunx cap sync android
else
  npx cap sync android
fi

echo "=== 6. Configuring JDK & Building Android APK ==="
if [ -n "$JAVA_HOME" ] && [ -d "$JAVA_HOME" ]; then
  echo "Setting org.gradle.java.home=$JAVA_HOME in android/gradle.properties..."
  if ! grep -q "^org.gradle.java.home=" android/gradle.properties; then
    echo "org.gradle.java.home=$JAVA_HOME" >> android/gradle.properties
  fi
fi

if command -v java >/dev/null 2>&1 || [ -n "$JAVA_HOME" ]; then
  (
    cd android
    chmod +x gradlew
    ./gradlew assembleDebug
  )
  echo "=== Android Build Completed Successfully! APK at android/app/build/outputs/apk/debug/app-debug.apk ==="
else
  echo "Note: Java/JDK is not installed on this environment. Capacitor sync complete!"
  echo "To build APK locally on your machine, run: cd android && ./gradlew assembleDebug"
fi
