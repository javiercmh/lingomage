# Text selection and reasoning preferences

> This records the earlier native Android implementation. The current App²
> settings and story-copy behavior are described in [App² runtime](app2-runtime.md).

Story titles, story text, glossary headwords and English explanations support
direct long-press selection. Japanese inline annotations use canonical surface
text as their alternate text; visual reading/base children are excluded from
selection registration. This keeps furigana visible for reading while selected
and copied text contains only the canonical characters. Saved story text and
annotations remain unchanged. Other languages use the same direct selection.

The Settings model picker includes a reasoning level selector. **Model default**
omits an explicit effort. Catalog-advertised `supported_reasoning_levels` are
used when present; unknown values are ignored. When that optional metadata is
absent, documented GPT-5/GPT-6 and o-series reasoning families expose the common
low/medium/high levels. Unknown families retain the default only. This fallback
is deliberately narrower than every possible model-specific setting.

Preferences are stored per account and model in DataStore. Requests use the
captured registration's preference, check it against the current catalog, and
send `reasoning.effort` on Responses requests. This applies to suggestions,
stories, the Japanese reading stage and connection checks. Returning to default
removes the preference. Account switching reloads model choices and preferences.
Higher effort can increase latency and usage; it does not certify language or
learning quality. Reasoning controls are disabled during story requests.

## Current App² reader selection

The full-screen reader keeps semantic ruby visible by default and offers a
learner-controlled furigana toggle. Its app-owned selection toolbar offers
Explain and Copy while retaining browser/WebView selection handles. Selection
offsets and copy text exclude `rt` reading nodes and use canonical chapter text.
Explain includes a contextual English translation and a brief profile-relative
difficulty estimate; it is not a proficiency judgment. App² Android selection
and native clipboard behavior remain pending device validation. See
[PED-002](../pedagogy/PED-002-contextual-reading-support.md).

API references: [OpenAI reasoning guide](https://developers.openai.com/api/docs/guides/reasoning)
and [SIWC inference contract](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference).

Canonical offsets handle both text-node boundaries and child-index boundaries on ruby or other elements. Reading nodes contribute no characters. Pointer interaction with the selection toolbar preserves the captured passage while focus changes. Automated boundary and request-recovery checks run with `node tests/reader-regression.cjs`; the harness uses isolated DOM and AI stubs, not an Android WebView.
