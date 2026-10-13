# Correction-menu scope

- Added `spellcheck="false"` only to the canonical reader story body and title. No suppression is applied to editable fields or their ancestors; native selection actions are unchanged.
- `node tests/reader-regression.cjs`: passed, including the scope check for both canonical containers and absence of app-level spellcheck overrides.
- Browser DOM inspection through `python3 dev_server.py --mock-ai` at `http://localhost:8888`: the only elements with `spellcheck="false"` were `reader-title` and `reader-story`.
- Visually inspected Create screenshots at desktop (1280px wide) and narrow mobile (390px wide). Checked field/helper grouping, spacing, wrapping, hierarchy, clipping and visible button targets; no layout problem observed. The markup change adds no layout styles. Reader screenshots were not inspected: this workspace had no saved stories, and no story was generated during this check.
- Pending: App² Android verification of native correction actions on title/body and normal correction/editing menus in Create, Settings, chapter prompts and explanation follow-up inputs. HTML spellcheck scope does not establish that the host's native menu honors it. If the host filters correction actions globally, it needs a corresponding host-side change; host source is not present here.
