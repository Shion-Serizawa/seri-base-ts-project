import { describe, expect, it } from 'vitest';

import { allowedOrigin } from './cors.ts';

describe('allowedOrigin', () => {
  it('許可リストにあるオリジンはそのまま返す', () => {
    expect(
      allowedOrigin('https://app.example.test', 'http://localhost:5173,https://app.example.test'),
    ).toBe('https://app.example.test');
  });

  it('許可リストに無いオリジンは拒否する（反射しない）', () => {
    expect(allowedOrigin('https://evil.example.test', 'http://localhost:5173')).toBeNull();
  });

  it('空白を含む設定でも判定できる', () => {
    expect(
      allowedOrigin('http://localhost:5173', ' http://localhost:5173 , https://app.example.test '),
    ).toBe('http://localhost:5173');
  });

  it('許可リストが空なら全て拒否する', () => {
    expect(allowedOrigin('http://localhost:5173', '')).toBeNull();
  });
});
