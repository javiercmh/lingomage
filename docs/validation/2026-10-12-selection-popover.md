# Floating selection popover (2026-10-12)

Replaced the fixed bottom selection bar in the reader with a floating popover above the selection.

Inspected (Chromium via `python3 dev_server.py --mock-ai`, seeded Spanish story, screenshots): desktop 1000×700 and mobile 390×760 with touch emulation. Popover sits above the selection, is clamped to the viewport edges, and the Translate, Explain, Copy, Select all and Speak buttons render at 44px height. `python3 scripts/check.py` passes.

Not verified: Android WebView native handles and selection menu overlap, popover placement below the selection when there is no room above, and a light theme (the app is dark-only). Pending on App² for Android.
