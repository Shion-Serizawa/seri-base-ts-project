import { spawnSync } from 'node:child_process';

import type { CheckResult } from '../lib/report.ts';

/**
 * gitleaks の呼び出し方を解決する。
 * mise 管理なので PATH に無い環境（フックのシェル等）では `mise exec` 経由を試す。
 */
function resolveGitleaks(): string | undefined {
  for (const command of ['gitleaks', 'mise exec -- gitleaks']) {
    const probe = spawnSync(`${command} version`, { shell: true, encoding: 'utf8' });
    if (probe.status === 0) {
      return command;
    }
  }
  return undefined;
}

/**
 * 適応度関数 ⑨ シークレットの混入検査。
 *
 * 作業ツリーと git 履歴の両方を見る。履歴に一度入った鍵は
 * ファイルを消しても残るため、コミット前に止めることが重要。
 */
export function checkSecretScan(): CheckResult {
  const gitleaks = resolveGitleaks();
  const inCi = process.env['CI'] !== undefined;

  if (gitleaks === undefined) {
    return {
      name: 'secret scan',
      // CI では必須。ローカルで未導入なら案内だけ出す
      ok: !inCi,
      actual: 'gitleaks 未検出',
      expected: 'シークレットの混入が無い',
      details: ['`mise install` で導入できる（mise.toml と mise.lock に固定済み）'],
    };
  }

  const targets = [
    { label: '作業ツリー', args: 'dir .' },
    { label: 'git 履歴', args: 'git' },
  ];
  const failures = targets
    .map((target) => ({
      target,
      result: spawnSync(`${gitleaks} ${target.args} --no-banner --redact --exit-code 1`, {
        shell: true,
        encoding: 'utf8',
      }),
    }))
    .filter(({ result }) => result.status !== 0);

  return {
    name: 'secret scan',
    ok: failures.length === 0,
    actual: failures.length === 0 ? '混入なし' : `${failures.length} 箇所で検出`,
    expected: 'シークレットの混入が無い',
    details: failures.flatMap(({ target, result }) =>
      `${target.label}:\n${result.stdout}${result.stderr}`
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .slice(0, 8),
    ),
  };
}
