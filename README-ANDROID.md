# Running MyKitchen on Android Studio & Phone

When you download this project from Google AI Studio, the `node_modules` folder is excluded to keep the download fast and lightweight. Capacitor needs these native modules to build the Android app.

---

## Quick Setup (Windows)

1. **Option A (One-Click):**
   - Double-click `setup-android.bat` in this folder.
   - It will automatically run `npm install`, `npm run build`, and `npx cap sync android`.

2. **Option B (Terminal / PowerShell / Command Prompt):**
   - Open Command Prompt or PowerShell in this project folder:
     ```cmd
     npm install
     npm run build
     npx cap sync android
     ```

---

## Opening in Android Studio

1. Open **Android Studio**.
2. Select **File -> Open...** and choose the `android` folder (e.g., `C:\Users\Abdulrahman\Downloads\mykitchen\android`).
3. Click the **Sync Project with Gradle Files** icon (the elephant button) in the top toolbar.
4. Plug in your Android phone (with USB Debugging enabled) or start an emulator.
5. Click the green **Run (Play)** button (`Shift + F10`) to install the app on your phone!

---

## Troubleshooting

- **Error: `projectDirectory '...node_modules\@capacitor\android\capacitor' does not exist`**
  - **Cause:** You opened Android Studio before running `npm install`.
  - **Fix:** Run `npm install && npx cap sync android` in the project root, then re-sync Gradle in Android Studio.

- **Error: `No matching variant of project :capacitor-android was found` or Gradle Version errors**
  - **Cause:** Android Studio attempted to build before Capacitor's Android module was installed or Gradle version mismatch.
  - **Fix:** Run `npm install` and re-sync Gradle. The project uses Gradle 8.11.1 with Android Gradle Plugin 8.7.2. In Android Studio, click **File -> Sync Project with Gradle Files**.
