import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
export function contextOf(
  root: string,
  run: RunCommand = stubRun(),
  ci = false,
  baseRef = 'main',
): FitnessContext {
  return { root, run, ci, baseRef };
}

const REPO_ROOT = join(import.meta.dirname, '..', '..');

/**
 * 実物の設定ファイル。⑪ は「宣言したポリシーとの完全一致」を見るので、
 * 手書きのフィクスチャを置くと実物とは別のポリシーを検査することになる。
 */
export function repositoryConfigFiles(): Record<string, string> {
  return Object.fromEntries(
    [
      '.oxlintrc.json',
      'tooling/quality-gates/oxlint-base.json',
      'stryker.config.json',
      '.jscpd.json',
    ].map((path) => [path, readFileSync(join(REPO_ROOT, path), 'utf8')]),
  );
}

/**
 * A 層の検査（`collectBaseChecks`）がすべて PASS になる擬似リポジトリ。
 *
 * 契約・マイグレーション・`docs/openapi.json` を置いていないのは、それらを読むのが
 * `project/checks.ts` の側だから（ADR 0010 の C 層）。ここに置く必要が出たら、
 * A 層に「リポジトリの形」の知識が漏れているということになる。
 */
export function makeHealthyBaseRepo(): string {
  return makeTempRepo({
    ...repositoryConfigFiles(),
    'package.json': JSON.stringify({ name: 'root', devDependencies: { knip: '6.32.2' } }),
    'bunfig.toml': '[install]\nexact = true\nminimumReleaseAge = 604800\n',
    'bun.lock': '',
    'mise.lock': '',
    '.github/workflows/ci.yml': `      - uses: actions/checkout@${'a'.repeat(40)}\n`,
    'apps/api/dist/worker.js': 'console.log(1);',
    'apps/web/dist/main.js': 'console.log(2);',
    'packages/domain/src/todo.ts': 'const a = 1;\n',
    'CLAUDE.md': '`packages/domain/src/todo.ts` を見る。\n',
  });
}
