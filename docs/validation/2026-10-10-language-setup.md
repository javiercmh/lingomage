# Language setup and pedagogical documentation

Date: 2026-10-10. Scope: English ability examples, PED-001, BibTeX bibliography, Reading starting point / Story difficulty labels, and explicit language setup.

## Checks performed

- JavaScript syntax: `node --input-type=module --check < js/app.js` completed successfully.
- Patch whitespace: `git diff --check` completed successfully before staging.
- Source inspection: no enabled-language fallback remains; an empty selection disables language, difficulty and generation controls; submission rejects a missing enabled language before provider discovery. Open Settings opens the dialog and focuses the first language checkbox.

## Pending

No browser or Android check was performed for this change. Keyboard/screen-reader behavior, enabling/disabling the final language, reload persistence, and physical-device layout remain to be checked. Scientific validity and learner interpretation of the exact examples remain unverified; see [PED-001](../pedagogy/PED-001-learner-self-report.md).

Committed settings use empty targets and the normal preferred model. Local development selections and mock-model preferences are preserved in the working file and excluded from the commit.
