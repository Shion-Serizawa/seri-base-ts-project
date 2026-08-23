// グローバルの ImportMeta を拡張する（import / export を書かないこと。書くとモジュール宣言になる）
interface ImportMeta {
  /** Node 20.11+ / Bun が提供する。vitest.config.ts でのパス解決に使う。 */
  readonly dirname: string;
}
