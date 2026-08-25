import { spawnSync } from 'node:child_process';

import { localBin } from '../lib/bin.ts';
import type { CheckResult } from '../lib/report.ts';

type ToolSpec = {
  readonly name: string;
  readonly command: string;
  readonly expected: string;
};

function runTool({ name, command, expected }: ToolSpec): CheckResult {
  const result = spawnSync(command, { shell: true, encoding: 'utf8' });
  const output = `${result.stdout}${result.stderr}`;
  const ok = result.status === 0;
  const lines = output
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);

  return {
    name,
    ok,
    actual: ok ? '違反なし' : '違反あり',
    expected,
    details: ok ? [] : lines.slice(0, 12),
  };
}

/**
 * 適応度関数 ③ 重複率 / ⑥ デッドコード。
 * ⑦ アーキテクチャ依存制約は oxlint の no-restricted-imports / import/no-cycle 側で
 * 強制している（dependency-cruiser は TypeScript 7 の API 非対応で走査できない）。
 */
export function checkExternalTools(): CheckResult[] {
  return [
    runTool({
      name: 'dead code (knip)',
      command: `${localBin('knip')} --no-config-hints`,
      expected: '未使用の export / 依存が無い',
    }),
    // テストからしか使われていない実装コードを検出する。
    // 通常モードはテストファイルもエントリなので、「テストを1本足せば
    // デッドコード判定を回避できる」という抜け道がある。
    // production モードは `!` を付けたエントリ（本番の入口）だけから到達性を見る。
    runTool({
      name: 'dead code (production)',
      command: `${localBin('knip')} --production --no-config-hints`,
      expected: '本番から到達しない export が無い',
    }),
    runTool({
      name: 'duplication (jscpd)',
      command: localBin('jscpd'),
      expected: '重複率が閾値以下',
    }),
  ];
}
