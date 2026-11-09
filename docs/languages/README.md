# Language-specific decisions

| Language | File | Level scale (PED-004) |
| --- | --- | --- |
| German | [german.md](german.md) | CEFR A1–C2 |
| Japanese | [japanese.md](japanese.md) | JLPT N5–N1 |
| Russian | [russian.md](russian.md) | Elementary, Basic, TORFL-I–IV (with A1–C2 references) |
| Spanish | [spanish-chile.md](spanish-chile.md) | CEFR A1–C2 |

## Shared rules (all languages)

- English interface and English glossary meanings.
- Generation follows [PED-004](../pedagogy/PED-004-level-guided-generation.md): a self-selected standardized reading target, narrative scope (Scene or Chapter) instead of numeric length quotas, an optional language-planning stage, and learner preferences (regional variety, register) from My languages. Level definitions and app-authored guides live in `data/learning-profiles.json`. A self-selected level is orientation, not certified alignment or evidence of individual vocabulary knowledge.
- Every chapter needs useful integrated English learning notes, validated target-script forms and technical bounds. Correct orthography and natural grammar are requested; the retired beginner curriculum (fixed word counts, tense limits, regional defaults) is not reinstated. Adopted, adapted and rejected legacy rules are in the [safeguard audit](../architecture/safeguards.md).
- Validators check structure and script; they cannot establish that an inflected form belongs to a lemma, that a reading is correct in context, or that usage is natural. Qualified human language review remains a requirement for every language.
- Saved stories keep their original text and prompt provenance; new rules never rewrite them.

## Maintaining these files

- Keep only language-specific rules here; link shared rationale (PED IDs) instead of repeating it. Do not copy a rule between languages without checking it applies (Japanese ruby is not German noun capitalization).
- For each rule, state whether it is a confirmed requirement, product assumption, research-supported finding or open question, with evidence or an explicit "product assumption".
- When a rule changes, replace it and add one line under "Earlier designs" saying what changed and why. Source records follow the [research policy](../research/README.md).
- Legacy Android prompt sources are pinned at commit `f8fef12` (`android/app/src/main/assets/prompts/`).
