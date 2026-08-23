import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// vitest の globals を無効にしているため、Testing Library の自動クリーンアップが
// 登録されない。明示的に登録する。
afterEach(() => {
  cleanup();
});
