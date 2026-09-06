import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { z } from 'zod';

const objectSchema = z.record(z.string(), z.unknown());
const arraySchema = z.array(z.unknown());

type JsonObject = z.infer<typeof objectSchema>;

/** `.oxlintrc.json` は JSONC（行コメント可）。 */
function readJsonc(path: string): JsonObject {
  const raw: string = readFileSync(path, 'utf8');
  return objectSchema.parse(JSON.parse(raw.replaceAll(/^\s*\/\/.*$/gmu, '')));
}

function objectAt(config: JsonObject, key: string): JsonObject {
  const parsed = objectSchema.safeParse(config[key]);
  return parsed.success ? parsed.data : {};
}

function arrayAt(config: JsonObject, key: string): unknown[] {
  const parsed = arraySchema.safeParse(config[key]);
  return parsed.success ? parsed.data : [];
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
