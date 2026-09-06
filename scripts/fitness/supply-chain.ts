import { checkSupplyChain } from '@seri/base-tooling/fitness/checks/supply-chain';
import { printReport } from '@seri/base-tooling/fitness/report';

// サプライチェーン関連のみを高速に検証する（pre-push / CI の最初に置く）。
const passed = printReport(checkSupplyChain());
process.exit(passed ? 0 : 1);
