import { adviceFor, formatAdvice, parseEditedPaths } from './edit-advice.ts';

/**
 * Claude Code の `PostToolUse`（Edit / Write）フック本体。
 *
 * 終了コード 2 が「stderr を Claude に渡す」意味を持つ。編集は既に適用済みなので
 * 取り消しはされない。促すコマンドはどれも冪等なので、複数回出ても害は無い。
 */
const advice = adviceFor(parseEditedPaths(await new Response(process.stdin).text()));

if (advice.length > 0) {
  console.error(formatAdvice(advice));
  process.exitCode = 2;
}
