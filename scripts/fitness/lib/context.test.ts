import { describe, expect, it } from 'vitest';

import { defaultContext } from './context.ts';
import { runCommand } from './exec.ts';

describe('defaultContext', () => {
  it('cwd を root にする', () => {
    expect(defaultContext().root).toBe(process.cwd());
  });

  it('実プロセスを起動する runCommand を使う', () => {
    expect(defaultContext().run).toBe(runCommand);
  });

  it('CI 環境変数の有無を ci に反映する', () => {
    expect(defaultContext().ci).toBe(process.env['CI'] !== undefined);
  });
});
