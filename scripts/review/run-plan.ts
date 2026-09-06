import { runCommand } from '../fitness/lib/exec.ts';
import { changedFiles } from '../mutation/changed.ts';
import { formatPlan } from './plan.ts';
import { routeReview } from './route.ts';

/**
 * `bun run review:plan` の入口。
 *
 * 判定は `route.ts`、整形は `plan.ts` にある。ここは引数と出力の結線だけ。
 */
const baseRef = process.env['FITNESS_BASE_REF'] ?? 'main';
const changed = changedFiles(runCommand, baseRef);

console.log(formatPlan(routeReview(changed), changed).join('\n'));
process.exit(0);
