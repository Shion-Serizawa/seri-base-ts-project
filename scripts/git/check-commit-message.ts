import { readFileSync } from 'node:fs';

/**
 * Conventional Commits 形式の簡易チェック。
 * `head` / `grep` に依存しないよう Node で実装している（Windows の Git フックでも動く）。
 */
const TYPES = [
  'feat',
  'fix',
  'docs',
  'style',
  'refactor',
  'perf',
  'test',
  'build',
  'ci',
  'chore',
  'revert',
];
const SCOPE = String.raw`(?:\([a-z0-9/-]+\))?`;
const PATTERN = new RegExp(`^(?:${TYPES.join('|')})${SCOPE}!?: .+`, 'u');

const messagePath = process.argv[2];
if (messagePath === undefined) {
  console.error('コミットメッセージのファイルパスが渡されていません');
  process.exit(1);
}

const firstLine = readFileSync(messagePath, 'utf8').split('\n')[0] ?? '';

// マージコミットとリバートの自動生成メッセージは対象外
if (firstLine.startsWith('Merge ') || firstLine.startsWith('Revert ')) {
  process.exit(0);
}

if (!PATTERN.test(firstLine)) {
  console.error('コミットメッセージを Conventional Commits 形式にしてください。');
  console.error(`  例: feat(api): ユーザー検索を追加`);
  console.error(`  使える type: ${TYPES.join(', ')}`);
  console.error(`  実際の 1 行目: ${firstLine}`);
  process.exit(1);
}
