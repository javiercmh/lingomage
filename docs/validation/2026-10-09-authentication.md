# Authentication implementation checks — 2026-10-09

## Environment

Local Android SDK platform 37; Android Studio JDK 25. Connected device:
Samsung SM-S921B, Android 16 / API 36. Device serial and account identifiers
are deliberately omitted from this record.

## Results so far

- Debug assembly and unit tests passed; lint has warnings but no errors.
- Documentation local links and whitespace checks passed.
- The user completed browser authentication and reached the local callback page.
- The app did not complete sign-in: it reported a network connection failure.
  The original build did not expose the exception category, so the exact cause
  is unverified. This is not a successful authentication gate.
- Anonymous discovery GET and anonymous invalid-grant token POST passed over
  verified TLS on the physical device. They establish endpoint reachability,
  not successful credential exchange.
- The isolated Keystore round-trip, rotating-value replacement, ciphertext
  corruption rejection, and explicit reset test passed.
- The first Compose device attempt failed while the phone was locked. Both
  authentication UI tests subsequently passed after the user unlocked it.
- The updated app categorizes network failures using exception class names without
  exposing raw exceptions, tokens, codes, or request URLs.
- A subsequent user attempt reported `UnknownHostException`. DNS resolution is
  therefore the observed failure category; the failing hostname was not shown
  in that build. Successful anonymous probes do not establish that the real
  sign-in request used the same network conditions.
- A new build waits for the activity to return to the foreground before token
  exchange and identifies the service hostname in safe connection errors.
  Background network restrictions are a hypothesis, not a verified cause.
  This build passed debug assembly, unit tests, and lint and was installed in
  place. The user reported successful sign-in after retrying. A regression test
  also passed: an accepted callback cannot trigger exchange while the activity
  is in the background and does trigger it after the activity returns.
  This improvement supports investigating request timing, but does not establish
  the underlying Android DNS or network restriction responsible for the failure.

The Gradle connected-test runner removed its temporary app installation after
tests. The app was reinstalled for another sign-in attempt. Future device tests
on an installation containing real credentials must use an in-place test APK
and `am instrument`, avoiding target-app uninstall and credential loss.

## Pending

The model list loaded. The subsequent inference error was isolated to HTTP 200
with an absent Content-Type header. The reader now recognizes bounded SSE framing
when that header is absent, while still rejecting non-SSE bodies and requiring
`response.completed`. After the fix, both the user and a restricted UI read
confirmed `Inference completed` and `Hello, LingoMage!` on the physical device.
The authentication + inference gate passed before story implementation began.

Manual reauthorization, refresh, logout, rotation, and cancellation checks remain.
Saved account restoration worked across in-place app updates and model reloads.
These observations do not replace the remaining session lifecycle checklist.
