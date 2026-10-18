// Command-line behavior. Without --live this module only prints help or an offline plan.
import {createBridge} from './bridge.mjs';
import {buildPlan, formatPlan, HELP, parseArgs, UsageError} from './plan.mjs';
import {runLive} from './runner.mjs';

export const EXIT = {noIssues: 0, flagged: 1, usage: 2, incomplete: 3};

export async function main(argv, deps = {}) {
  const stdout = deps.stdout || (line => console.log(line));
  const stderr = deps.stderr || (line => console.error(line));
  try {
    const options = parseArgs(argv);
    if (options.help || !argv.length) { stdout(HELP); return EXIT.noIssues; }
    if (!options.live) {
      const plan = buildPlan(options, {root: deps.root, fsImpl: deps.fs});
      stdout(formatPlan(plan, options));
      return plan.problems.length ? EXIT.usage : EXIT.noIssues;
    }
    const bridge = deps.bridge || createBridge({endpoint: options.endpoint});
    const report = await runLive(options, {...deps, bridge, stdout});
    return report.status === 'flagged' ? EXIT.flagged : report.status === 'incomplete' ? EXIT.incomplete : EXIT.noIssues;
  } catch (error) {
    stderr(error.message);
    return error instanceof UsageError ? EXIT.usage : EXIT.incomplete;
  }
}
