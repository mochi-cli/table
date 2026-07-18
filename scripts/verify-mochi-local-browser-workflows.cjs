#!/usr/bin/env node

const { createRequire } = require('module');
const path = require('path');

const appRequire = createRequire(path.join(process.cwd(), 'apps/nextjs-app/package.json'));
const { chromium } = appRequire('@playwright/test');

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
    throw new Error(`${options.method ?? 'GET'} ${url} failed with ${response.status}`);
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
const putJson = (url, body) =>
  requestJson(url, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
const deleteJson = (url) => requestJson(url, { method: 'DELETE' });

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function discoverTarget(origin) {
  const bases = await getJson(`${origin}/api/mochi/bases`);
  const base = bases[0];
  if (!base?.id) throw new Error('No local Mochi base found. Run `make sqlite.init` first.');

  const tables = await getJson(`${origin}/api/mochi/bases/${base.id}/tables`);
  const table = tables[0];
  if (!table?.id) throw new Error(`No table found in local base ${base.id}.`);

  const [views, fields, records] = await Promise.all([
    getJson(`${origin}/api/table/${table.id}/view`),
    getJson(`${origin}/api/table/${table.id}/field`),
    getJson(`${origin}/api/table/${table.id}/record?take=100`),
  ]);
  const view = views[0];
  const field = fields[0];
  const record = records.records?.[0];
  if (!view?.id || !field?.id || !record?.id) {
    throw new Error(`Table ${table.id} needs at least one view, field, and record.`);
  }

  return {
    baseId: base.id,
    tableId: table.id,
    viewId: view.id,
    fieldId: field.id,
    recordId: record.id,
  };
}

async function openLocalPage(browser, appOrigin, tableId, viewId) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(15000);
  await page.goto(`${appOrigin}/mochi/local?tableId=${tableId}&viewId=${viewId}`, {
    waitUntil: 'domcontentloaded',
  });
  await page.getByRole('button', { name: 'Add record' }).waitFor();
  await page.getByRole('button', { name: /Filter by/ }).waitFor();
  await wait(1200);
  return page;
}

async function getView(origin, tableId, viewId) {
  const views = await getJson(`${origin}/api/table/${tableId}/view`);
  return views.find((view) => view.id === viewId);
}

async function runViewListSmoke(page, origin, tableId, marker, results, createdViewIds) {
  const beforeUrl = page.url();
  const created = await postJson(`${origin}/api/table/${tableId}/view`, {
    name: `Browser view ${marker}`,
    type: 'grid',
    options: { rowHeight: 'short' },
  });
  createdViewIds.add(created.id);
  await page.goto(`${beforeUrl.split('&viewId=')[0]}&viewId=${created.id}`, {
    waitUntil: 'domcontentloaded',
  });
  await page.getByRole('button', { name: 'Add record' }).waitFor();
  results.push({
    name: 'view-list-create-open',
    ok:
      page.url().includes(created.id) &&
      (await page.getByText(`Browser view ${marker}`).isVisible()),
  });

  const renamed = await putJson(`${origin}/api/table/${tableId}/view/${created.id}/name`, {
    name: `Browser view renamed ${marker}`,
  });
  await page.goto(`${beforeUrl.split('&viewId=')[0]}&viewId=${created.id}`, {
    waitUntil: 'domcontentloaded',
  });
  await page.getByRole('button', { name: 'Add record' }).waitFor();
  results.push({
    name: 'view-list-rename-persist',
    ok:
      renamed.name === `Browser view renamed ${marker}` &&
      (await page.getByText(`Browser view renamed ${marker}`).isVisible()),
  });

  const duplicated = await postJson(`${origin}/api/table/${tableId}/view/${created.id}/duplicate`);
  createdViewIds.add(duplicated.id);
  results.push({
    name: 'view-list-duplicate',
    ok:
      Boolean(duplicated.id) &&
      duplicated.id !== created.id &&
      duplicated.name === `Browser view renamed ${marker} copy`,
  });

  await deleteJson(`${origin}/api/table/${tableId}/view/${duplicated.id}`);
  createdViewIds.delete(duplicated.id);
  await deleteJson(`${origin}/api/table/${tableId}/view/${created.id}`);
  createdViewIds.delete(created.id);
  const viewsAfterDelete = await getJson(`${origin}/api/table/${tableId}/view`);
  results.push({
    name: 'view-list-delete',
    ok: [created.id, duplicated.id].every(
      (viewId) => !viewsAfterDelete.some((view) => view.id === viewId)
    ),
  });
}

async function runSelectionSmoke(
  page,
  origin,
  tableId,
  fieldId,
  marker,
  results,
  createdRecordIds
) {
  const created = await postJson(`${origin}/api/table/${tableId}/record`, {
    records: [{ fields: { [fieldId]: `Selection UI ${marker}` } }],
  });
  const recordId = created.records?.[0]?.id;
  if (!recordId) throw new Error('Failed to create selection smoke record.');
  createdRecordIds.add(recordId);

  await page.mouse.click(535, 145);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+C' : 'Control+C');
  await wait(300);
  const copied = await postJson(`${origin}/api/table/${tableId}/selection/copy-by-id`, {
    selection: { recordIds: [recordId], fieldIds: [fieldId] },
  });
  results.push({
    name: 'selection-ui-cell-copy',
    ok: copied.content === `Selection UI ${marker}`,
  });

  await patchJson(`${origin}/api/table/${tableId}/selection/paste-by-id`, {
    content: `Selection pasted ${marker}`,
    selection: { recordIds: [recordId], fieldIds: [fieldId] },
  });
  const afterPaste = await getJson(`${origin}/api/table/${tableId}/record?take=100000`);
  results.push({
    name: 'selection-ui-paste',
    ok:
      afterPaste.records?.find((record) => record.id === recordId)?.fields?.[fieldId] ===
      `Selection pasted ${marker}`,
  });

  await page.keyboard.press('Backspace');
  await patchJson(`${origin}/api/table/${tableId}/selection/clear-by-id`, {
    selection: { recordIds: [recordId], fieldIds: [fieldId] },
  });
  const afterClear = await getJson(`${origin}/api/table/${tableId}/record?take=100000`);
  results.push({
    name: 'selection-ui-clear',
    ok: afterClear.records?.find((record) => record.id === recordId)?.fields?.[fieldId] == null,
  });

  await patchJson(`${origin}/api/table/${tableId}/selection/paste-by-id`, {
    content: `Selection duplicate ${marker}`,
    selection: { recordIds: [recordId], fieldIds: [fieldId] },
  });
  const beforeDuplicate = await getJson(`${origin}/api/table/${tableId}/record?take=100000`);
  const rowIndex = beforeDuplicate.records.findIndex((record) => record.id === recordId);
  const ranges = encodeURIComponent(JSON.stringify([[rowIndex, rowIndex]]));
  const duplicateResponse = await fetch(
    `${origin}/api/table/${tableId}/selection/duplicate-stream?ranges=${ranges}&type=rows`
  );
  await duplicateResponse.text();
  if (!duplicateResponse.ok) {
    throw new Error(`duplicate-stream failed with ${duplicateResponse.status}`);
  }
  const afterDuplicate = await getJson(`${origin}/api/table/${tableId}/record?take=100000`);
  const duplicated = afterDuplicate.records.filter(
    (record) =>
      record.id !== recordId && record.fields?.[fieldId] === `Selection duplicate ${marker}`
  );
  duplicated.forEach((record) => createdRecordIds.add(record.id));
  results.push({ name: 'selection-ui-duplicate-row', ok: duplicated.length >= 1 });

  await postJson(`${origin}/api/table/${tableId}/selection/delete-by-id`, {
    selection: { recordIds: [recordId] },
  });
  createdRecordIds.delete(recordId);
  const afterDelete = await getJson(`${origin}/api/table/${tableId}/record?take=100000`);
  results.push({
    name: 'selection-ui-delete-row',
    ok: !afterDelete.records.some((record) => record.id === recordId),
  });
}

async function runDragHeavySmoke(
  page,
  origin,
  tableId,
  fieldId,
  marker,
  results,
  createdRecordIds
) {
  const created = await postJson(`${origin}/api/table/${tableId}/record`, {
    records: [
      { fields: { [fieldId]: `Drag row A ${marker}` } },
      { fields: { [fieldId]: `Drag row B ${marker}` } },
    ],
  });
  const recordIds = created.records?.map((record) => record.id).filter(Boolean) ?? [];
  recordIds.forEach((recordId) => createdRecordIds.add(recordId));
  if (recordIds.length < 2) throw new Error('Failed to create drag-heavy smoke records.');

  const beforeUrl = page.url();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Add record' }).waitFor();
  const beforeDragRecords = await getJson(`${origin}/api/table/${tableId}/record?take=100000`);

  await page.mouse.move(520, 145);
  await page.mouse.down();
  await page.mouse.move(820, 215, { steps: 12 });
  await page.mouse.up();
  await wait(500);

  const copied = await postJson(`${origin}/api/table/${tableId}/selection/copy-by-id`, {
    selection: { recordIds, fieldIds: [fieldId] },
  });
  results.push({
    name: 'drag-heavy-row-range-stays-mounted',
    ok:
      page.url() === beforeUrl &&
      (await page.getByRole('button', { name: 'Add record' }).isVisible()) &&
      recordIds.every((recordId) =>
        beforeDragRecords.records?.some((record) => record.id === recordId)
      ) &&
      copied.content.includes(`Drag row A ${marker}`) &&
      copied.content.includes(`Drag row B ${marker}`),
  });
}

async function runHistorySmoke(page, origin, appOrigin, tableId, viewId, fieldId, marker, results) {
  const created = await postJson(`${origin}/api/table/${tableId}/record`, {
    records: [{ fields: { [fieldId]: `History before ${marker}` } }],
  });
  const recordId = created.records?.[0]?.id;
  if (!recordId) throw new Error('Failed to create history smoke record.');
  await patchJson(`${origin}/api/table/${tableId}/record/${recordId}`, {
    record: { fields: { [fieldId]: `History after ${marker}` } },
  });

  await page.goto(
    `${appOrigin}/mochi/local?tableId=${tableId}&viewId=${viewId}&recordId=${recordId}&showHistory=true`,
    {
      waitUntil: 'domcontentloaded',
    }
  );
  await page.getByText('History after').first().waitFor({ timeout: 15000 });
  results.push({
    name: 'record-history-ui-panel',
    ok: await page.getByText(`History after ${marker}`).first().isVisible(),
  });

  const tableHistory = await getJson(
    `${origin}/api/table/${tableId}/record/history?fieldIds=${fieldId}&createdByIds=usr_mochi_local`
  );
  results.push({
    name: 'table-history-ui-backed-data',
    ok: tableHistory.historyList?.some(
      (item) => item.recordId === recordId && item.after?.data === `History after ${marker}`
    ),
  });

  await deleteJson(`${origin}/api/table/${tableId}/record/${recordId}`).catch(() => undefined);
}

async function runTwoTabRealtimeSmoke(
  browser,
  appOrigin,
  origin,
  tableId,
  viewId,
  fieldId,
  marker,
  results
) {
  const pageA = await openLocalPage(browser, appOrigin, tableId, viewId);
  const pageB = await openLocalPage(browser, appOrigin, tableId, viewId);
  const beforeUrl = pageB.url();
  await putJson(`${origin}/api/table/${tableId}/view/${viewId}/filter`, {
    filter: {
      conjunction: 'and',
      filterSet: [{ fieldId, operator: 'is', value: `two-tab-${marker}` }],
    },
  });
  await pageB.getByRole('button', { name: /Filter by Name/ }).waitFor({ timeout: 10000 });
  const view = await getView(origin, tableId, viewId);
  results.push({
    name: 'two-tab-filter-realtime-no-reload',
    ok:
      pageB.url() === beforeUrl &&
      view?.filter?.filterSet?.[0]?.value === `two-tab-${marker}` &&
      (await pageB.getByRole('button', { name: /Filter by Name/ }).isVisible()),
  });

  const fields = await getJson(`${origin}/api/table/${tableId}/field`);
  const lastField = fields.at(-1);
  if (lastField?.id) {
    await putJson(`${origin}/api/table/${tableId}/view/${viewId}/column-meta`, {
      columnMeta: { [lastField.id]: { order: 0.5 } },
    });
    await wait(1200);
    const columnMetaView = await getView(origin, tableId, viewId);
    results.push({
      name: 'two-tab-column-meta-realtime-no-reload',
      ok: pageB.url() === beforeUrl && columnMetaView?.columnMeta?.[lastField.id]?.order === 0.5,
    });
  }

  await pageA.close();
  await pageB.close();
}

async function main() {
  const backendOrigin = process.env.MOCHI_BACKEND_ORIGIN ?? 'http://127.0.0.1:3001';
  const appOrigin = process.env.MOCHI_APP_ORIGIN ?? 'http://127.0.0.1:3000';
  const target = await discoverTarget(backendOrigin);
  const { tableId, viewId, fieldId } = target;
  const marker = `workflow-${Date.now()}`;
  const createdViewIds = new Set();
  const createdRecordIds = new Set();
  const results = [];
  let browser;

  try {
    browser = await chromium.launch({ headless: true });
    const page = await openLocalPage(browser, appOrigin, tableId, viewId);
    await runViewListSmoke(page, backendOrigin, tableId, marker, results, createdViewIds);
    await page.goto(`${appOrigin}/mochi/local?tableId=${tableId}&viewId=${viewId}`, {
      waitUntil: 'domcontentloaded',
    });
    await page.getByRole('button', { name: 'Add record' }).waitFor();
    await runSelectionSmoke(
      page,
      backendOrigin,
      tableId,
      fieldId,
      marker,
      results,
      createdRecordIds
    );
    await runDragHeavySmoke(
      page,
      backendOrigin,
      tableId,
      fieldId,
      marker,
      results,
      createdRecordIds
    );
    await runHistorySmoke(
      page,
      backendOrigin,
      appOrigin,
      tableId,
      viewId,
      fieldId,
      marker,
      results
    );
    await page.close();
    await runTwoTabRealtimeSmoke(
      browser,
      appOrigin,
      backendOrigin,
      tableId,
      viewId,
      fieldId,
      marker,
      results
    );

    const result = { ok: results.every((item) => item.ok), target, marker, results };
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    for (const viewIdToDelete of [...createdViewIds].reverse()) {
      await deleteJson(`${backendOrigin}/api/table/${tableId}/view/${viewIdToDelete}`).catch(
        () => undefined
      );
    }
    for (const recordId of [...createdRecordIds].reverse()) {
      await deleteJson(`${backendOrigin}/api/table/${tableId}/record/${recordId}`).catch(
        () => undefined
      );
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
