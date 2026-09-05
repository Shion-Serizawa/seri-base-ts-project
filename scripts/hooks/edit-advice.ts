/**
 * Claude Code の `PostToolUse` フック（Edit / Write）の判定。
 *
 * 生成物の再生成忘れは、既に適応度関数 ⑫（OpenAPI 乖離）と ⑩（スキーマ乖離）が
 * 検出する。ただし気づくのは pre-push なので、原因の編集から数十分離れることがある。
 * ここでは編集した直後に、必要な後続手順をその場で知らせる。
 *
 * 判定を入出力のない関数に切り出しているのは、`uncommitted.ts` と同じ理由。
 * 「促すべきなのに黙る」はゲートが黙って緑になるのと同じ壊れ方なので、テスト対象にする。
 */

/** 編集に対して促す後続手順。 */
export type Advice = {
  /** 促す理由。何を変えたから必要なのか。 */
  readonly reason: string;
  /** 実行すべきコマンド、または取るべき行動。 */
  readonly action: string;
};

type Rule = {
  /** 正規化済みパス（`/` 区切り）に対して照合する。 */
  readonly matches: RegExp;
  readonly advice: Advice;
};

const RULES: readonly Rule[] = [
  {
    matches: /(^|\/)packages\/contract\/src\/.+\.ts$/u,
    advice: {
      reason: 'API 契約を変更しました',
      action:
        '`bun run openapi:generate` を実行し、docs/openapi.json も一緒にコミットしてください（適応度関数 ⑫ が乖離を検出します）',
    },
  },
  {
    matches: /(^|\/)packages\/db\/src\/.+\.ts$/u,
    advice: {
      reason: 'DB スキーマを変更しました',
      action:
        '`bun run --filter @seri/db db:generate` を実行し、生成されたマイグレーションもコミットしてください（適応度関数 ⑩ が乖離を検出します）',
    },
  },
  {
    matches: /(^|\/)tooling\/quality-gates\/src\/.+\.ts$/u,
    advice: {
      reason: '品質ゲートのしきい値かポリシーを変更しました',
      action:
        'README.md の品質ゲートの表と docs/adr/0002-fitness-functions.md に、変更した理由と牽制関係を追記してください',
    },
  },
];

/** Windows の `\` 区切りとドライブレターを吸収し、`/` 区切りに揃える。 */
function normalize(filePath: string): string {
  return filePath.replaceAll('\\', '/');
}

/** テストとテスト用フィクスチャは生成物に影響しないので促さない。 */
function isTestFile(normalized: string): boolean {
  return /\.test(-d)?\.ts$/u.test(normalized);
}

/**
 * 編集されたファイルから、促すべき後続手順を返す。
 *
 * 同じ助言が複数ファイルから出ても 1 件にまとめる（1 回の編集で契約を複数触っても
 * `openapi:generate` は 1 回で足りる）。
 */
export function adviceFor(filePaths: readonly string[]): Advice[] {
  const matched = new Map<string, Advice>();

  for (const filePath of filePaths) {
    const normalized = normalize(filePath);
    if (isTestFile(normalized)) {
      continue;
    }
    for (const rule of RULES) {
      if (rule.matches.test(normalized)) {
        matched.set(rule.advice.reason, rule.advice);
      }
    }
  }

  return [...matched.values()];
}

/** 未知の値を、キー参照だけできる形に落とす。型アサーションを使わないための踏み台。 */
function recordOf(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  return Object.fromEntries(Object.entries(value));
}

/**
 * stdin の JSON から編集されたファイルパスを取り出す。壊れていても例外にしない。
 *
 * `uncommitted.ts` と同じく、解釈できない入力は「促すものが無い」側に倒す。
 * フックが落ちても Claude Code は素通しするので、例外にする利点が無い。
 */
export function parseEditedPaths(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    const filePath = recordOf(recordOf(parsed)?.['tool_input'])?.['file_path'];
    return typeof filePath === 'string' && filePath.length > 0 ? [filePath] : [];
  } catch {
    return [];
  }
}

/** 助言を Claude に渡す 1 本のメッセージにまとめる。 */
export function formatAdvice(advice: readonly Advice[]): string {
  return advice.map((item) => `${item.reason}。${item.action}`).join('\n');
}
