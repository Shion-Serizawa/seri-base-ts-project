import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export type JsonObject = Record<string, unknown>;

export function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/** `.oxlintrc.json` は JSONC（行コメント可）。 */
function readJsonc(path: string): JsonObject {
  const raw: string = readFileSync(path, 'utf8');
  const parsed: unknown = JSON.parse(raw.replaceAll(/^\s*\/\/.*$/gmu, ''));
  if (!isRecord(parsed)) {
    throw new Error(`${path} が JSON オブジェクトではない`);
  }
  return parsed;
}

export function objectAt(config: JsonObject, key: string): JsonObject {
  const value = config[key];
  return isRecord(value) ? { ...value } : {};
}

function arrayAt(config: JsonObject, key: string): unknown[] {
  const value = config[key];
  return isArray(value) ? [...value] : [];
}

/**
 * oxlint 1.79.0 で実測したマージ意味論に合わせて、親の設定に自分の設定を重ねる。
 *
 * | フィールド       | 挙動                               |
 * | ---------------- | ---------------------------------- |
 * | rules / categories / options | 継承され、自分の側が後勝ち |
 * | plugins          | 継承される（自分の側を書いても親のものは消えない） |
 * | overrides        | 連結される（extends 側が先）       |
 * | ignorePatterns   | **継承されない**                   |
 *
 * `ignorePatterns` を継承する実装にすると、base 側にだけ適用範囲を書いた設定を
 * 「除外が効いている」と誤認する。実際の oxlint は効かせないので、
 * ⑪ が緑のまま lint が広範囲を素通りする（false green）。
 */
function inherit(parent: JsonObject, own: JsonObject): JsonObject {
  const plugins: unknown[] = [
    ...new Set([...arrayAt(parent, 'plugins'), ...arrayAt(own, 'plugins')]),
  ];
  return {
    ...parent,
    ...own,
    plugins,
    options: { ...objectAt(parent, 'options'), ...objectAt(own, 'options') },
    categories: { ...objectAt(parent, 'categories'), ...objectAt(own, 'categories') },
    rules: { ...objectAt(parent, 'rules'), ...objectAt(own, 'rules') },
    overrides: [...arrayAt(parent, 'overrides'), ...arrayAt(own, 'overrides')],
    ignorePatterns: arrayAt(own, 'ignorePatterns'),
  };
}

/**
 * `extends` を再帰的に解決した**実効設定**を返す。
 *
 * ADR 0010 の決定 6。`.oxlintrc.json` を薄いラッパにした以上、ファイルをそのまま
 * 読んでポリシーと突き合わせると、カテゴリもルールも「検査対象に無い」状態になり、
 * `"correctness": "off"` を足しても検出できなくなる。⑪ は必ずここを通す。
 *
 * 解決後に `extends` は落とす。ラッパから `extends` を消せばルール本体が丸ごと
 * 消えるので、消したこと自体はポリシーの不一致として検出される。
 */
export function loadEffectiveOxlintConfig(configPath: string): JsonObject {
  const own = readJsonc(configPath);
  const parents = arrayAt(own, 'extends').filter(
    (entry): entry is string => typeof entry === 'string',
  );

  const merged = parents.reduce<JsonObject>(
    (accumulated, entry) =>
      inherit(accumulated, loadEffectiveOxlintConfig(resolve(dirname(configPath), entry))),
    {},
  );

  const { extends: _resolved, ...rest } = inherit(merged, own);
  return rest;
}

/** 文字列だけを取り出す（設定ファイルは手書きなので型が崩れうる）。 */
export function stringsAt(config: JsonObject, key: string): string[] {
  return arrayAt(config, key).filter((entry): entry is string => typeof entry === 'string');
}

/**
 * `extends` 先が宣言している `ignorePatterns` を集める。
 *
 * 実測どおり oxlint はこれを継承しない。つまり書いても効かないのに、書いた側は
 * 「除外できている」と思い込む。1 件でもあれば違反として報告する。
 */
export function ignorePatternsInExtends(configPath: string): string[] {
  const own = readJsonc(configPath);
  return stringsAt(own, 'extends').flatMap((entry) => {
    const target = resolve(dirname(configPath), entry);
    return stringsAt(readJsonc(target), 'ignorePatterns').concat(ignorePatternsInExtends(target));
  });
}

export type OxlintOverride = { readonly files: readonly string[]; readonly rules: JsonObject };

/** `overrides` を、出現順のまま扱いやすい形で取り出す。 */
export function overridesOf(config: JsonObject): OxlintOverride[] {
  return arrayAt(config, 'overrides')
    .filter((entry): entry is JsonObject => isRecord(entry))
    .map((entry) => ({ files: stringsAt(entry, 'files'), rules: objectAt(entry, 'rules') }));
}
