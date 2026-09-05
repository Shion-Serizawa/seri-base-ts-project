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
};

export function defaultContext(): FitnessContext {
  return { root: process.cwd(), run: runCommand, ci: process.env['CI'] !== undefined };
}
