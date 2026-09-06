import { runCommand } from '@seri/base-tooling/fitness/exec';

import { decide, parseStopInput } from './uncommitted.ts';

/**
 * Claude Code の `Stop` フック本体。
 *
 * 終了コード 2 が「停止をブロックし、stderr を Claude に理由として渡す」意味を持つ。
 * それ以外の非 0 は非ブロックのエラー扱いなので、判定を間違えるより落ちる方が安全。
 *
 * `runCommand` の結果を丸ごと `decide` に渡すのは、git が起動できなかった場合の
 * 空の stdout を「変更なし」と読ませないため（安全装置が黙って無効になる）。
 */
const decision = decide(
  parseStopInput(await new Response(process.stdin).text()),
  runCommand('git status --porcelain'),
);

if (decision.block) {
  console.error(decision.reason);
  // process.exit だと Windows のパイプで stderr が切り捨てられうる。
  // 理由が消えると「理由なしでブロックされた」という分かりにくい壊れ方になる。
  process.exitCode = 2;
}
