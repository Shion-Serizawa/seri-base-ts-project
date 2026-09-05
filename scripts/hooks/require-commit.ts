import { runCommand } from '../fitness/lib/exec.ts';
import { decide, parseStopInput } from './uncommitted.ts';

/**
 * Claude Code の `Stop` フック本体。
 *
 * 終了コード 2 が「停止をブロックし、stderr を Claude に理由として渡す」意味を持つ。
 * それ以外の非 0 は非ブロックのエラー扱いなので、判定を間違えるより落ちる方が安全。
 */
const decision = decide(
  parseStopInput(await new Response(process.stdin).text()),
  runCommand('git status --porcelain').stdout,
);

if (decision.block) {
  console.error(decision.reason);
  process.exit(2);
}
