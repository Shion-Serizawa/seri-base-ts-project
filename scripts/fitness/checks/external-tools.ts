import { spawnSync } from 'node:child_process';

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
 * いずれも「複雑度を下げるための小細工」を牽制する側の指標。
 */
export function checkExternalTools(): CheckResult[] {
  return [
    runTool({
      name: 'dead code (knip)',
      command: 'knip --no-config-hints',
      expected: '未使用の export / 依存が無い',
    }),
    runTool({
      name: 'duplication (jscpd)',
      command: 'jscpd',
      expected: '重複率が閾値以下',
    }),
  ];
}
