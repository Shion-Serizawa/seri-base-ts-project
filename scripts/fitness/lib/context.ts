import type { RunCommand } from './exec.ts';
import { runCommand } from './exec.ts';

/**
 * 適応度関数の実行環境。
 *
 * `root`（リポジトリのルート）・`run`（外部コマンドの実行）・`ci`（CI 上かどうか）を
 * 引数として渡すことで、各検査が `process.cwd()` / プロセス起動 / 環境変数に
 * 直接依存しないようにしている。テストは一時ディレクトリと差し替えた `run` に対して
 * 検査を走らせられる。
 */
export type FitnessContext = {
  readonly root: string;
  readonly run: RunCommand;
  /** CI 上では「ツールが入っていない」を PASS に倒さない */
  readonly ci: boolean;
  /**
   * 差分を取る基準リビジョン（⑯ が使う）。
   *
   * 既定を `main` にしているのは、フィーチャブランチからの push で
   * 「そのブランチが加えた変更すべて」が対象になるため。リモートを設定していない
   * ローカルでも解決できるよう、`origin/main` ではなくローカルの `main` を見る。
   * CI では `FITNESS_BASE_REF` で PR のベースブランチ（push なら `HEAD~1`）に切り替える。
   * 基準が HEAD と同じコミットになる場合（main の上での作業）は ⑯ 側が
   * `HEAD~1` に落として、落としたことを結果に出す。
   */
  readonly baseRef: string;
};

export function defaultContext(): FitnessContext {
  return {
    root: process.cwd(),
    run: runCommand,
    ci: process.env['CI'] !== undefined,
    baseRef: process.env['FITNESS_BASE_REF'] ?? 'main',
  };
}
