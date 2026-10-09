# Android authentication proof of concept

Status: physical-device sign-in and completed inference verified on 2026-10-09.

## Protocol

The implementation follows OpenAI's documented public-client flow, not the
commercial website flow. [Registration contract](https://developers.openai.com/siwc/token-sharing-open-source/sign-in).

A new registration starts with `dynamic_agent_client`, a stable per-installation
host UUID, and the app name. Returning sign-in reuses the issued client ID. Each
attempt has fresh PKCE, state, and nonce. Code exchange uses the issued ID and
exact callback URI; signed identity, audience, issuer, expiry, and nonce are checked
before saving credentials. Missing plan permission preserves sign-in but prevents inference.

## Android lifecycle and callback

`AuthRepository` owns the pending attempt in the application coroutine scope.
Rotation does not destroy it; process death requires a new attempt. Custom Tabs
uses the system browser. `LoopbackListener` binds only to `127.0.0.1` on an available
port and retains `/auth/callback`. Invalid/unrelated requests do not consume the
pending attempt. Header size and socket reads are bounded. Completion, cancellation,
and a ten-minute timeout close the port. The browser shows a static return message;
the user returns to the app manually. No deep-link replacement is registered.
After accepting the callback, token exchange waits until the activity is in the
foreground, with a bounded ten-minute wait. This avoids starting the exchange
while the browser is in front. Activity rotation preserves the pending attempt;
cancellation remains available while waiting. Connection failures identify only
the service hostname and exception class, never the code or full request URL.

## Credentials and sessions

AES-GCM encryption uses an Android Keystore key and an authenticated format version.
Records are atomically written in `noBackupFilesDir`; backup and transfer are disabled.
Unreadable records produce an explicit recovery action instead of silent deletion.
Tokens and authorization URLs are not logged. Credential objects redact `toString`.

Registrations are distinct by issued client ID and verified identity, not by email.
Refresh is serialized; rotating tokens and expiry are replaced together. Logout
attempts revocation, removes local tokens, and retains registration/host mappings.
Unconfirmed remote revocation is disclosed. [Session contract](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions).

## Inference check

The account's visible model catalog populates a picker. One minimal request sends
`Say exactly: Hello, LingoMage!` to the public Responses API with `store:false`
and `stream:true`. It is successful only after `response.completed`; partial
output does not count. Redirects and automatic HTTP retries are disabled.
[Inference contract](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference).

## Gate and subsequent work

The physical-device gate passed before story features were implemented. The
connection check remains available in Settings. See [generation and storage](generation.md)
and [furigana rendering](furigana.md) for the subsequent implementation.
An absent Content-Type header is tolerated only when a bounded body prefix has
SSE framing; arbitrary JSON/HTML cannot count as completed inference.
