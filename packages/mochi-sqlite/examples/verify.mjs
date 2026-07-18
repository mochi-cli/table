import { run as runComputedJob } from './verify/computed-job.verify.mjs';
import { run as runCrud } from './verify/crud.verify.mjs';
import { run as runFieldConversion } from './verify/field-conversion.verify.mjs';
import { run as runFormula } from './verify/formula.verify.mjs';
import { run as runImportSqlite } from './verify/import-sqlite.verify.mjs';
import { run as runLookupRollup } from './verify/lookup-rollup.verify.mjs';
import { run as runSearchFilter } from './verify/search-filter.verify.mjs';
import { run as runUndoRedoTrash } from './verify/undo-redo-trash.verify.mjs';

const checks = [
  runCrud,
  runSearchFilter,
  runUndoRedoTrash,
  runLookupRollup,
  runFormula,
  runImportSqlite,
  runComputedJob,
  runFieldConversion,
];

const results = checks.map((run) => run());

console.log(
  JSON.stringify({
    ok: true,
    checked: results.map((result) => result.name),
    results,
  })
);
