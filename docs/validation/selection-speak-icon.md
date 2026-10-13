# Selection Speak icon validation

- Replaced the selected-text Speak label with the shared speaker SVG and icon-button styling; order is Translate, Explain, Speak. Accessible label: Speak selected text.
- Ran `python3 scripts/check.py`: passed (rerun outside the sandbox after its Node-to-Python subprocess was blocked).
- Visually inspected the deterministic development server at desktop 1280×720 and narrow mobile 360×800 with story text selected. Desktop toolbar floats above the selection; mobile toolbar sits at the bottom. Speaker icon is right-most, spacing is clear and no controls clip or wrap. Translate and Speak correctly appear disabled in the browser.
- Measured mobile controls: Translate and Explain are at least 82×48px; Speak is 48×48px.
- Native Android selection, speech playback and host safe areas remain pending device verification.
