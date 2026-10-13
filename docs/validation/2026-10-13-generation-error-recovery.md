# Generation error recovery

The AI can return glossary forms absent from its prose. LANG-003 continues to reject these results; no safeguard or prompt changes were made. Clarified the error as an AI-output problem, labelled failed-stage recovery Retry, and removed the blocked resubmission instruction when a checkpoint exists. Reader checkpoint recovery now appears after the edit panel instead of above the title.

Verification: `python3 scripts/check.py` passed. Recovery assertions cover Retry copy, removal of duplicate guidance, and Save / finish for completed stages. Desktop (1200px) and narrow mobile (360px) screenshots of a temporary static reader error fixture served by `python3 dev_server.py --mock-ai` were visually inspected: title precedes chapter, recovery follows chapter actions, message wraps without clipping, and buttons retain 44px targets. The fixture was removed; no learner records were used. Live Android rendering and native AI remain pending.
