# LingoMage

Android application project. The Android Studio project lives in `android/`.

## Getting started

1. Open the `android/` directory in Android Studio.
2. Install the Android SDK components requested by the project and let Gradle sync.
3. Run the `app` module on an emulator or connected Android device.

Android Studio creates `android/local.properties` for your local SDK path. This file, build outputs, IDE state, and signing keys are excluded from Git.

## Command-line build

With a compatible Java installation and the Android SDK configured:

```sh
cd android
./gradlew assembleDebug
./gradlew testDebugUnitTest
```

## Push to GitHub

Create an empty GitHub repository without adding a README, license, or `.gitignore`, then run these commands from the repository root (replace `YOUR_USERNAME`):

```sh
git remote add origin https://github.com/YOUR_USERNAME/lingomage.git
git push -u origin main
```
