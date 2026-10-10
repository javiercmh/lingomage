# Physical-device authentication gate

This checklist applies only to the earlier native Android proof of concept. The
current App² workspace uses the host-managed provider setup in **Settings → AI**;
it does not use this sign-in flow.

Use the connection-test app before implementing dependent story features.
Do not record credentials, authorization codes, raw authorization URLs, or token bodies.

## Run

1. Enable USB debugging and approve this computer on the phone.
2. Build with `cd android && ./gradlew assembleDebug`.
3. Install `android/app/build/outputs/apk/debug/app-debug.apk` using Android Studio
   or `adb install -r` and open LingoMage.
4. Tap **Continue with ChatGPT**, complete consent in the browser, and manually
   return to LingoMage after the callback page appears.
5. Confirm the app shows the account as signed in with plan permission.
6. Tap **Load available models**, choose a model, and tap **Run inference check**.
7. Record whether **Inference completed** appears and the returned text.

This request uses the selected account's ChatGPT plan. No developer API key is required.

## Additional acceptance checks

- Cancel sign-in and retry; deny consent; let an attempt time out.
- Rotate during browser authentication, then complete sign-in.
- Restart the app and confirm saved-account recovery.
- Add/switch accounts without overwriting another registration.
- Verify refresh after access-token expiry and reauthorization of a saved account.
- Sign out; confirm local token deletion and report revocation status.
- Terminate the process during authentication; a new attempt must be required.

## Result record fields

Date, device model, Android/API version, browser/version, app version/commit,
step outcomes, sanitized error category, and whether callback, identity validation,
and completed inference all passed. Keep unchecked steps explicitly pending.

Passing the connection check establishes protocol feasibility on that device/browser,
not compatibility on all Android versions or evidence of learning effectiveness.
