/**
 * コードスメルの基準（Fowler『リファクタリング』第 3 章）。
 *
 * 保守性の観点は「責務・命名・重複・変更局所性」という粗い切り口だけだと、
 * レビューする側の語彙に依存して見落ちる。名前の付いた症状として並べておくと、
 * 「これは Feature Envy だ」と指させるようになる。
 *
 * 2 つの拘束をかける。
 *
 * 1. **リポジトリの規約が優先する。** README・ADR・lint 設定が是としている書き方を
 *    スメルとして挙げない。このリポジトリの規約は機械化してあるので、
 *    衝突したら規約側が正しい
 * 2. **すべて判断であって違反ではない。** 「Feature Envy の疑い」までしか言えない。
 *    確実に落とせるものは既にゲートが落としている（③ 重複率・⑤ 複雑度・⑥ デッドコード・
 *    ⑦ 層の境界）ので、それらと重ねて指摘しない
 */

export type Smell = {
  /** 症状の名前。指摘のときにそのまま使う。 */
  readonly name: string;
  /** どういう状態か。 */
  readonly symptom: string;
  /** どう直すか。 */
  readonly fix: string;
};

export const CODE_SMELLS: readonly Smell[] = [
  {
    name: 'Mysterious Name',
    symptom: '関数・変数・型の名前が、何をするか／何を持つかを表していない',
    fix: '名前を変える。正直な名前が出てこないなら設計が曖昧',
  },
  {
    name: 'Duplicated Code',
    symptom: '同じ形のロジックが複数のファイル・hunk に現れている',
    fix: '共通の形を抽出して両方から呼ぶ（文字列としての重複は ③ が見る）',
  },
  {
    name: 'Feature Envy',
    symptom: '自分のデータより他のオブジェクトのデータを多く触っている',
    fix: 'その処理を、欲しているデータの側へ移す',
  },
  {
    name: 'Data Clumps',
    symptom: '同じ数個のフィールドや引数がいつも一緒に連れ立っている',
    fix: '1 つの型にまとめて、それを渡す',
  },
  {
    name: 'Primitive Obsession',
    symptom: 'ドメインの概念を string や number のまま扱っている',
    fix: '小さな型を与える（このリポジトリなら zod の branded type）',
  },
  {
    name: 'Repeated Switches',
    symptom: '同じ型に対する switch / if の連鎖が複数箇所に現れる',
    fix: '多態にするか、両者が共有する 1 つの対応表にする',
  },
  {
    name: 'Shotgun Surgery',
    symptom: '1 つの仕様変更が多くのファイルへの散らばった修正を強いる',
    fix: '一緒に変わるものを 1 つのモジュールに集める',
  },
  {
    name: 'Divergent Change',
    symptom: '1 つのファイルが互いに無関係な複数の理由で編集されている',
    fix: '各モジュールが 1 つの理由でだけ変わるように分ける',
  },
  {
    name: 'Speculative Generality',
    symptom: '仕様が求めていない抽象・引数・拡張点が足されている',
    fix: '消してインライン化する。実際に必要になってから作る',
  },
  {
    name: 'Message Chains',
    symptom: '`a.b().c().d()` のように、呼び出し側が内部構造を辿っている',
    fix: '最初のオブジェクトの 1 メソッドの裏に隠す',
  },
  {
    name: 'Middle Man',
    symptom: 'ほとんど委譲しかしていないクラス・関数がある',
    fix: '消して本来の相手を直接呼ぶ',
  },
  {
    name: 'Refused Bequest',
    symptom: '継承・実装したもののほとんどを無視または上書きしている',
    fix: '継承をやめて合成にする',
  },
];
