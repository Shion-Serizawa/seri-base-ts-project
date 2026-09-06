/**
 * ISO/IEC 25010:2023 の品質特性を、このリポジトリのレビュー観点に落としたもの。
 *
 * ここが「レビューの単一情報源」で、[docs/quality/iso25010.md](../../docs/quality/iso25010.md)
 * と `.claude/skills/quality-review/SKILL.md` はここを参照する側に徹する。
 *
 * **決定論的ゲートで検出できるものをここに書かない。** 複雑度・`any`・層の境界・
 * 重複・シークレット・生成物の乖離は既に落ちるので、レビューで二重に見ると
 * 指摘がノイズで埋まり、レビューごと回されなくなる（CLAUDE.md の「二重にやらない」）。
 */

export type DimensionKey =
  | 'functional-suitability'
  | 'performance-efficiency'
  | 'compatibility'
  | 'interaction-capability'
  | 'reliability'
  | 'security'
  | 'maintainability'
  | 'flexibility'
  | 'safety';

export type Dimension = {
  readonly key: DimensionKey;
  readonly name: string;
  /** 変更の内容によらず常に起動するか。 */
  readonly always: boolean;
  /** サブエージェントに見せる観点。 */
  readonly focus: readonly string[];
  /** 「主張」ではなく「証拠」として要求するもの。 */
  readonly evidence: readonly string[];
  /** この観点で既に落ちるゲート。ここに挙げたものは指摘しない。 */
  readonly coveredByGates: readonly string[];
};

export const DIMENSIONS: readonly Dimension[] = [
  {
    key: 'functional-suitability',
    name: '機能適合性',
    always: true,
    focus: [
      '依頼された振る舞いと実装が一致しているか。頼まれていない仕様を足していないか',
      '正常系だけになっていないか（空・0・境界・重複・並行・部分失敗）',
      'packages/domain の不変条件が守られているか。時刻と乱数を引数で受けているか',
      '型テスト（*.test-d.ts）が守っている性質を実装が崩していないか',
    ],
    evidence: [
      '該当するテストの名前と、それが失敗する変更を1つ挙げる（挙げられないなら牽制していない）',
      '境界値のうちテストが無いものを列挙する',
    ],
    coveredByGates: ['① カバレッジ', '④ ミューテーションスコア'],
  },
  {
    key: 'maintainability',
    name: '保守性',
    always: true,
    focus: [
      '責務の置き場所が層の意図と合っているか（contract / domain / db / api / web）',
      '名前がドメイン用語と一致しているか。実装詳細が名前に漏れていないか',
      '意味上の重複（同じ規則が2箇所に書かれている）。文字列としての重複は ③ が見る',
      '変更局所性。1つの仕様変更に対して触ったファイルが多すぎないか',
    ],
    evidence: [
      '重複している規則について、両方のファイルと行を示す',
      '触ったファイル数と、その内訳（本質的な変更 / 追随した変更）',
    ],
    coveredByGates: ['③ 重複率', '⑤ 複雑度', '⑥⑥′ デッドコード', '⑦ 層の境界', '⑪ Lint 設定'],
  },
  {
    key: 'compatibility',
    name: '互換性',
    always: false,
    focus: [
      '契約の変更が既存クライアントを壊さないか（web の呼び出し側が追随しているか）',
      'マイグレーションが Blue/Green の途中で成立するか（旧コード × 新スキーマ）',
      'エラーコードの意味を変えていないか（同じコードで別の理由を返していないか）',
    ],
    evidence: ['docs/openapi.json の差分', 'apps/web 側の呼び出し箇所の追随状況'],
    coveredByGates: ['⑫ 契約と OpenAPI の乖離', '⑯ 破壊的変更の宣言', '⑩ スキーマ乖離'],
  },
  {
    key: 'security',
    name: 'セキュリティ',
    always: false,
    focus: [
      'リポジトリ層のクエリがセッションのユーザーでスコープされているか',
      '他人のリソースに対して存在を漏らしていないか（NOT_FOUND を返しているか）',
      '入力が zod で検証されてから使われているか。検証前の値が DB やログに届いていないか',
      'ログとエラーメッセージに認証情報・個人情報が載っていないか',
      'CORS のオリジンを反射していないか',
    ],
    evidence: [
      '認可を外した場合に落ちるテストの名前（無いなら穴）',
      '他人の id を指定したときの応答を確認したテスト',
    ],
    coveredByGates: [
      '⑨ シークレット',
      '⑭ 認可スコープの型強制',
      'os ビルダーの型強制',
      'bun audit',
      '依存の固定',
    ],
  },
  {
    key: 'reliability',
    name: '信頼性',
    always: false,
    focus: [
      '外部 I/O に明示的なタイムアウトがあるか',
      '再試行するなら上限と待ち時間があるか。再試行してはいけないエラーを再試行していないか',
      '同じ要求が2回届いたときに壊れないか（冪等性）',
      'トランザクションの境界の中に外部通信が入っていないか',
      '失敗したときに握りつぶしていないか（catch してログだけで続行していないか）',
    ],
    evidence: ['タイムアウトの設定箇所', '重複実行を再現したテスト（無いなら穴として挙げる）'],
    coveredByGates: [],
  },
  {
    key: 'performance-efficiency',
    name: '性能効率性',
    always: false,
    focus: [
      'ループの中でクエリを発行していないか（N+1）',
      '件数の上限が無い取得をしていないか（ページングの有無）',
      '必要のない列・行を取っていないか',
      'Workers の起動時に重い初期化をしていないか',
    ],
    evidence: ['1リクエストあたりのクエリ発行回数', '取得件数の上限がどこで効いているか'],
    coveredByGates: ['⑧ バンドルサイズ予算'],
  },
  {
    key: 'safety',
    name: '安全性',
    always: false,
    focus: [
      '取り返しのつかない操作か（D1 に巻き戻しは無い）',
      '一括操作に絞り込みがあるか',
      '失敗したときに安全側（拒否）に倒れるか',
      '削除が論理削除で足りないか',
    ],
    evidence: ['破壊的な文の一覧と、その承認理由', '失敗時にどちらへ倒れるかを示すテスト'],
    coveredByGates: ['⑰ 破壊的マイグレーション'],
  },
  {
    key: 'interaction-capability',
    name: '相互作用能力',
    always: false,
    focus: [
      'エラーが利用者にとって次の行動が分かる文言になっているか',
      '読み込み中・失敗・空の状態が UI にあるか',
      'キーボードで操作できるか。ラベルが要素と結び付いているか',
    ],
    evidence: ['エラー時に画面に出る文言', '空・失敗状態を確認したテスト'],
    coveredByGates: ['⑱ a11y（jsx-a11y と実行時 axe）'],
  },
  {
    key: 'flexibility',
    name: '柔軟性',
    always: false,
    focus: [
      '環境ごとの値がコードに埋め込まれていないか（バインディングで受けているか）',
      'Workers に載らない前提（ローカルのファイル・プロセス内の可変状態）を持ち込んでいないか',
      '置き換える予定の無いものを抽象化していないか（過剰な抽象化も指摘対象）',
    ],
    evidence: ['追加した設定値の受け取り経路', 'プロセス内に持っている状態の一覧'],
    coveredByGates: ['process.env 禁止（oxlint）'],
  },
];
