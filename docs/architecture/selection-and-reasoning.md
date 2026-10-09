# Text selection and reasoning preferences

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

API references: [OpenAI reasoning guide](https://developers.openai.com/api/docs/guides/reasoning)
and [SIWC inference contract](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference).
