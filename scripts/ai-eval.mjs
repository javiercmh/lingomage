// Development-only entry point for learning-quality evaluations (AI evals). Offline help/plan unless --live is passed.
// Never run by scripts/check.py, hooks, CI or the packaged app. See docs/validation/generation-evaluation/README.md.
import {main} from './evaluation/ai-evals/cli.mjs';

process.exitCode = await main(process.argv.slice(2));
