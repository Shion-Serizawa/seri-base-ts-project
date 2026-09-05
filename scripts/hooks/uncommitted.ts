import type { CommandOutcome } from '../fitness/lib/exec.ts';

/**
 * Claude Code の `Stop` フックの判定。
 *
 * 既定では「明示的に頼まれたときだけコミットする」ため、作業だけして終わることがある。
 * 応答を終える直前に未コミットの変更を検出し、あれば停止をブロックして続行させる。
 *
 * 判定を入出力のない関数に切り出しているのは、「未コミットがあるのに素通しする」
 * という壊れ方を検証できるようにするため。これはゲートが黙って緑になるのと同じ種類の
 * 事故なので、フックの実装自体がテスト対象でなければならない。
 */

/** Claude Code が stdin に渡す JSON のうち、判定に使う部分。 */
export type StopHookInput = {
  /**
   * このフックが原因で継続している最中は true になる。
   * 見ないと「ブロック → 停止 → ブロック」で無限ループする。
   */
  readonly stopHookActive: boolean;
};

export type Decision =
  | { readonly block: false }
  | { readonly block: true; readonly reason: string };

/** details に並べる変更ファイルの上限。 */
const MAX_LISTED = 20;

/**
 * stdin の JSON を読む。壊れていても例外にしない。
 *
 * フックが落ちると Claude Code は「非ブロックのエラー」として素通しするので、
 * 解釈できない入力は「継続中ではない」= 通常どおり判定する側に倒す。
 */
export function parseStopInput(raw: string): StopHookInput {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return { stopHookActive: false };
    }
    const record: Record<string, unknown> = Object.fromEntries(Object.entries(parsed));
    return { stopHookActive: record['stop_hook_active'] === true };
  } catch {
    return { stopHookActive: false };
  }
}

/** `git status --porcelain` の出力から変更ファイルの行を取り出す。 */
function changedEntries(porcelain: string): string[] {
  return porcelain
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);
}

export function decide(input: StopHookInput, status: CommandOutcome): Decision {
  // 2 周目（このフックで継続した後）は必ず通す。ここを外すと無限ループになる
  if (input.stopHookActive) {
    return { block: false };
  }

  // git を実行できなかった場合の空出力を「変更なし」と読むと、git が壊れた瞬間に
  // この安全装置が黙って無効になる。判定できないならブロック側に倒す。
  if (status.status !== 0) {
    return {
      block: true,
      reason: [
        'git の状態を確認できませんでした（`git status --porcelain` が失敗）。',
        '未コミットの変更が残っていないか手動で確認してから終了してください。',
        ...(status.stderr.trim().length > 0 ? [status.stderr.trim()] : []),
      ].join('\n'),
    };
  }

  const entries = changedEntries(status.stdout);
  if (entries.length === 0) {
    return { block: false };
  }

  return {
    block: true,
    reason: [
      `未コミットの変更が ${entries.length} 件あります。`,
      '作業単位ごとに Conventional Commits 形式でコミットしてから終了してください。',
      '意図的に残す場合は、その理由をユーザーに伝えてから終了してください。',
      ...entries.slice(0, MAX_LISTED),
      ...(entries.length > MAX_LISTED ? [`… 他 ${entries.length - MAX_LISTED} 件`] : []),
    ].join('\n'),
  };
}
