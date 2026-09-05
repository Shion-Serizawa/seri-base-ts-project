import { collectChecks } from './collect.ts';
import { printReport } from './lib/report.ts';

const passed = printReport(await collectChecks());
process.exit(passed ? 0 : 1);
