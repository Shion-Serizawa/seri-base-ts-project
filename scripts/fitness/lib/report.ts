export type CheckResult = {
  readonly name: string;
  readonly ok: boolean;
  /** 実測値の表示用文字列 */
  readonly actual: string;
  /** 期待条件の表示用文字列 */
  readonly expected: string;
  readonly details?: readonly string[];
};

const GREEN = '\u001B[32m';
const RED = '\u001B[31m';
const DIM = '\u001B[2m';
const RESET = '\u001B[0m';

export function printReport(results: readonly CheckResult[]): boolean {
  const nameWidth = Math.max(...results.map((result) => result.name.length), 4);
  const actualWidth = Math.max(...results.map((result) => result.actual.length), 6);

  console.log('');
  console.log(`${DIM}適応度関数 (fitness functions)${RESET}`);
  console.log('');

  for (const result of results) {
    const mark = result.ok ? `${GREEN}PASS${RESET}` : `${RED}FAIL${RESET}`;
    const name = result.name.padEnd(nameWidth);
    const actual = result.actual.padEnd(actualWidth);
    console.log(`  ${mark}  ${name}  ${actual}  ${DIM}期待: ${result.expected}${RESET}`);
    for (const line of result.details ?? []) {
      console.log(`        ${DIM}${line}${RESET}`);
    }
  }

  const failed = results.filter((result) => !result.ok);
  console.log('');
  if (failed.length === 0) {
    console.log(`${GREEN}すべての適応度関数を満たしています (${results.length} 件)${RESET}`);
    return true;
  }
  console.log(
    `${RED}${failed.length} / ${results.length} 件の適応度関数が閾値を外れています${RESET}`,
  );
  return false;
}
