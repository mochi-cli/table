#!/usr/bin/env node

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...options.headers,
    },
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${options.method ?? 'GET'} ${url} failed with ${response.status}: ${text}`);
  }
  return json;
}

const getJson = (url) => requestJson(url);
const postJson = (url, body) =>
  requestJson(url, {
    method: 'POST',
    body: JSON.stringify(body),
  });
const patchJson = (url, body) =>
  requestJson(url, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
const deleteJson = (url) => requestJson(url, { method: 'DELETE' });

async function discoverTarget(origin) {
  const bases = await getJson(`${origin}/api/mochi/bases`);
  const base = bases[0];
  if (!base?.id) throw new Error('No local Mochi base found. Run `make sqlite.init` first.');

  const tables = await getJson(`${origin}/api/mochi/bases/${base.id}/tables`);
  const table = tables[0];
  if (!table?.id) throw new Error(`No table found in local base ${base.id}.`);

  return { baseId: base.id, tableId: table.id };
}

async function createField(origin, tableId, input) {
  return postJson(`${origin}/api/mochi/tables/${tableId}/fields`, input);
}

const fieldValue = (record, fieldId) => record?.fields?.[fieldId];

async function main() {
  const origin = process.env.MOCHI_BACKEND_ORIGIN ?? 'http://127.0.0.1:3001';
  const target = await discoverTarget(origin);
  const { tableId } = target;
  const marker = `computed-${Date.now()}`;
  const createdFieldIds = [];
  const createdRecordIds = [];
  const results = [];

  try {
    const item = await createField(origin, tableId, {
      name: `Item ${marker}`,
      type: 'singleLineText',
      cellValueType: 'string',
    });
    const qty = await createField(origin, tableId, {
      name: `Qty ${marker}`,
      type: 'number',
      cellValueType: 'number',
    });
    const price = await createField(origin, tableId, {
      name: `Price ${marker}`,
      type: 'number',
      cellValueType: 'number',
    });
    const total = await createField(origin, tableId, {
      name: `Total ${marker}`,
      type: 'formula',
      cellValueType: 'number',
      isComputed: true,
      options: { expression: `{${qty.id}} * {${price.id}}` },
    });
    const label = await createField(origin, tableId, {
      name: `Label ${marker}`,
      type: 'formula',
      cellValueType: 'string',
      isComputed: true,
      options: { expression: `CONCATENATE({${item.id}}, " x", {${qty.id}})` },
    });
    const upperItem = await createField(origin, tableId, {
      name: `Upper item ${marker}`,
      type: 'formula',
      cellValueType: 'string',
      isComputed: true,
      options: { expression: `UPPER({${item.id}})` },
    });
    const lowerItem = await createField(origin, tableId, {
      name: `Lower item ${marker}`,
      type: 'formula',
      cellValueType: 'string',
      isComputed: true,
      options: { expression: `LOWER({${item.id}})` },
    });
    const itemLength = await createField(origin, tableId, {
      name: `Item length ${marker}`,
      type: 'formula',
      cellValueType: 'number',
      isComputed: true,
      options: { expression: `LEN({${item.id}})` },
    });
    const adjustedTotal = await createField(origin, tableId, {
      name: `Adjusted total ${marker}`,
      type: 'formula',
      cellValueType: 'number',
      isComputed: true,
      options: { expression: `({${qty.id}} + 2) * ({${price.id}} - 2.5)` },
    });
    const trimmedLeft = await createField(origin, tableId, {
      name: `Trimmed left ${marker}`,
      type: 'formula',
      cellValueType: 'string',
      isComputed: true,
      options: { expression: 'LEFT(TRIM("  Mochi  "), 3)' },
    });
    const rightRepeat = await createField(origin, tableId, {
      name: `Right repeat ${marker}`,
      type: 'formula',
      cellValueType: 'string',
      isComputed: true,
      options: { expression: `REPT(RIGHT({${item.id}}, 1), 3)` },
    });
    const roundedAverage = await createField(origin, tableId, {
      name: `Rounded average ${marker}`,
      type: 'formula',
      cellValueType: 'number',
      isComputed: true,
      options: { expression: `ROUND(AVERAGE({${qty.id}}, {${price.id}}, 10), 1)` },
    });
    const minMaxSpread = await createField(origin, tableId, {
      name: `Min max spread ${marker}`,
      type: 'formula',
      cellValueType: 'number',
      isComputed: true,
      options: {
        expression: `MAX({${qty.id}}, {${price.id}}, 10) - MIN({${qty.id}}, {${price.id}}, 10)`,
      },
    });
    const absIf = await createField(origin, tableId, {
      name: `Abs if ${marker}`,
      type: 'formula',
      cellValueType: 'number',
      isComputed: true,
      options: { expression: `IF({${qty.id}}, ABS(-7), SUM(1, 2))` },
    });
    createdFieldIds.push(
      item.id,
      qty.id,
      price.id,
      total.id,
      label.id,
      upperItem.id,
      lowerItem.id,
      itemLength.id,
      adjustedTotal.id,
      trimmedLeft.id,
      rightRepeat.id,
      roundedAverage.id,
      minMaxSpread.id,
      absIf.id
    );

    const formulaRecord = await postJson(`${origin}/api/mochi/tables/${tableId}/records`, {
      fields: { [item.id]: 'Tea', [qty.id]: 3, [price.id]: 12.5 },
    });
    createdRecordIds.push(formulaRecord.id);
    const firstFormulaResolve = await postJson(
      `${origin}/api/mochi/tables/${tableId}/formulas/resolve`,
      { recordId: formulaRecord.id }
    );
    const firstFormulaRecord = await getJson(`${origin}/api/mochi/records/${formulaRecord.id}`);
    results.push({
      name: 'formula-resolve-api',
      ok:
        firstFormulaResolve.fields >= 2 &&
        firstFormulaResolve.records === 1 &&
        firstFormulaResolve.updatedRecords === 1 &&
        fieldValue(firstFormulaRecord, total.id) === 37.5 &&
        fieldValue(firstFormulaRecord, label.id) === 'Tea x3',
    });
    results.push({
      name: 'formula-text-and-grouping-parity',
      ok:
        fieldValue(firstFormulaRecord, upperItem.id) === 'TEA' &&
        fieldValue(firstFormulaRecord, lowerItem.id) === 'tea' &&
        fieldValue(firstFormulaRecord, itemLength.id) === 3 &&
        fieldValue(firstFormulaRecord, adjustedTotal.id) === 50 &&
        fieldValue(firstFormulaRecord, trimmedLeft.id) === 'Moc' &&
        fieldValue(firstFormulaRecord, rightRepeat.id) === 'aaa' &&
        fieldValue(firstFormulaRecord, roundedAverage.id) === 8.5 &&
        fieldValue(firstFormulaRecord, minMaxSpread.id) === 9.5 &&
        fieldValue(firstFormulaRecord, absIf.id) === 7,
    });

    await patchJson(`${origin}/api/mochi/records/${formulaRecord.id}`, {
      fields: { [qty.id]: 4 },
    });
    const refreshedFormulaResolve = await postJson(
      `${origin}/api/mochi/tables/${tableId}/formulas/resolve`,
      { recordId: formulaRecord.id }
    );
    const refreshedFormulaRecord = await getJson(`${origin}/api/mochi/records/${formulaRecord.id}`);
    results.push({
      name: 'formula-refresh-api',
      ok:
        refreshedFormulaResolve.records === 1 &&
        refreshedFormulaResolve.updatedRecords === 1 &&
        fieldValue(refreshedFormulaRecord, total.id) === 50 &&
        fieldValue(refreshedFormulaRecord, label.id) === 'Tea x4',
    });

    const phone = await createField(origin, tableId, {
      name: `Phone ${marker}`,
      type: 'singleLineText',
      cellValueType: 'string',
    });
    const score = await createField(origin, tableId, {
      name: `Score ${marker}`,
      type: 'number',
      cellValueType: 'number',
    });
    const link = await createField(origin, tableId, {
      name: `Linked customer ${marker}`,
      type: 'link',
    });
    const lookup = await createField(origin, tableId, {
      name: `Linked phone ${marker}`,
      type: 'lookup',
      isLookup: true,
      options: { linkFieldId: link.id, valueFieldId: phone.id },
    });
    const rollup = await createField(origin, tableId, {
      name: `Linked score sum ${marker}`,
      type: 'rollup',
      isLookup: true,
      options: { linkFieldId: link.id, valueFieldId: score.id, aggregate: 'sum' },
    });
    createdFieldIds.push(phone.id, score.id, link.id, lookup.id, rollup.id);

    const linkedRecord = await postJson(`${origin}/api/mochi/tables/${tableId}/records`, {
      fields: { [phone.id]: '+84 555', [score.id]: 25 },
    });
    const lookupRecord = await postJson(`${origin}/api/mochi/tables/${tableId}/records`, {
      fields: { [link.id]: linkedRecord.id },
    });
    createdRecordIds.push(linkedRecord.id, lookupRecord.id);

    const lookupResolve = await postJson(
      `${origin}/api/mochi/tables/${tableId}/lookup-rollup/resolve`,
      { recordId: lookupRecord.id }
    );
    const resolvedLookupRecord = await getJson(`${origin}/api/mochi/records/${lookupRecord.id}`);
    results.push({
      name: 'lookup-rollup-resolve-api',
      ok:
        lookupResolve.fields >= 2 &&
        lookupResolve.records === 1 &&
        lookupResolve.updatedRecords === 1 &&
        fieldValue(resolvedLookupRecord, lookup.id) === '+84 555' &&
        fieldValue(resolvedLookupRecord, rollup.id) === 25,
    });

    const job = await postJson(`${origin}/api/mochi/computed/jobs`, {
      tableId,
      recordId: formulaRecord.id,
      fieldId: total.id,
    });
    const claimed = await postJson(`${origin}/api/mochi/computed/jobs/claim`, {});
    const completed = await postJson(
      `${origin}/api/mochi/computed/jobs/${claimed.id}/complete`,
      {}
    );
    results.push({
      name: 'computed-job-api',
      ok:
        Boolean(job.id) &&
        claimed.id === job.id &&
        claimed.status === 'running' &&
        completed.status === 'completed',
    });

    const result = {
      ok: results.every((item) => item.ok),
      target,
      marker,
      results,
    };
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } finally {
    for (const recordId of createdRecordIds.reverse()) {
      await deleteJson(`${origin}/api/mochi/records/${recordId}`).catch(() => undefined);
    }
    for (const fieldId of createdFieldIds.reverse()) {
      await deleteJson(`${origin}/api/table/${tableId}/field/${fieldId}`).catch(() => undefined);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
