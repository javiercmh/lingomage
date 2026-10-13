# Reader speech and floating status validation

Inspected development-server screenshots at the default desktop viewport (1280 × 720) during examples generation and at 360 × 780 after an invalid mock examples response. Floating status, safe bottom spacing, wrapping, dismissal and 44px controls were visible without horizontal clipping. The existing deterministic examples response was rejected by validation; the floating error correctly matched the inline error. No completed result was saved by that browser check.

JavaScript regression suites cover reader lifecycle, canonical speech locales, story management and memory. Python development-server tests passed (10 tests). Native speech, Android selection menus, keyboard and host safe areas remain pending. Ready/result navigation is covered by code-level checks; a browser screenshot of saved completion remains pending.
