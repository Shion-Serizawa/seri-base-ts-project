import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { onTestFinished } from 'vitest';

import type { FitnessContext } from '../fitness/lib/context.ts';
import type { CommandOutcome, RunCommand } from '../fitness/lib/exec.ts';

/**
 * 一時ディレクトリに擬似リポジトリを作る。テスト終了時に自動で削除される。
 *
 * 適応度関数はファイルの有無と内容で判定するため、
 * 「bunfig.toml が無い」「dist が無い」といった壊れ方を実際に再現して検証する。
 */
export function makeTempRepo(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(join(tmpdir(), 'seri-fitness-'));
  onTestFinished(() => {
    rmSync(root, { recursive: true, force: true });
  });
  for (const [relativePath, content] of Object.entries(files)) {
    const target = join(root, relativePath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, 'utf8');
  }
  return root;
}

export type StubbedRun = RunCommand & { readonly calls: string[] };

/**
 * 外部コマンドを実際には起動しない `RunCommand`。
 * `reply` が返した値で既定（成功・出力なし）を上書きする。
 */
export function stubRun(
  reply: (command: string) => Partial<CommandOutcome> = () => ({}),
): StubbedRun {
  const calls: string[] = [];
  const run: RunCommand = (command) => {
    calls.push(command);
    return { status: 0, stdout: '', stderr: '', ...reply(command) };
  };
  return Object.assign(run, { calls });
}

/** 検査に渡す `FitnessContext`。既定では外部コマンドを起動せず CI 扱いにしない。 */
export function contextOf(root: string, run: RunCommand = stubRun(), ci = false): FitnessContext {
  return { root, run, ci };
}
