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
  if (!base?.id) {
    throw new Error('No local Mochi base found. Run `make sqlite.init` first.');
  }

  const tables = await getJson(`${origin}/api/mochi/bases/${base.id}/tables`);
  const table = tables[0];
  if (!table?.id) {
    throw new Error(`No table found in local base ${base.id}.`);
  }

  const [views, fields] = await Promise.all([
    getJson(`${origin}/api/table/${table.id}/view`),
    getJson(`${origin}/api/table/${table.id}/field`),
  ]);
  const view = views[0];
  const field = fields[0];
  if (!view?.id || !field?.id) {
    throw new Error(`Table ${table.id} needs at least one view and one field.`);
  }

  return {
    baseId: base.id,
    tableId: table.id,
    viewId: view.id,
    fieldId: field.id,
  };
}

async function getView(origin, tableId, viewId) {
  const views = await getJson(`${origin}/api/table/${tableId}/view`);
  return views.find((view) => view.id === viewId);
}

async function getFields(origin, tableId) {
  return getJson(`${origin}/api/table/${tableId}/field`);
}

function getOrderedFields(fields, columnMeta = {}) {
  return [...fields].sort((a, b) => {
    const leftOrder = columnMeta[a.id]?.order ?? fields.findIndex((field) => field.id === a.id);
    const rightOrder = columnMeta[b.id]?.order ?? fields.findIndex((field) => field.id === b.id);
    return leftOrder - rightOrder;
  });
}

function getColumnLayout(fields, columnMeta = {}) {
  const gridLeft = 369;
  const defaultWidth = 150;
  let cursor = gridLeft;
  return getOrderedFields(fields, columnMeta).map((field) => {
    const width = columnMeta[field.id]?.width ?? defaultWidth;
    const layout = {
      field,
      left: cursor,
      right: cursor + width,
      center: cursor + width / 2,
      width,
    };
    cursor += width;
    return layout;
  });
}

async function assertNoNavigation(page, action) {
  const beforeUrl = page.url();
  const beforeTitle = await page.title();
  await action();
  await page.waitForTimeout(500);
  return page.url() === beforeUrl && (await page.title()) === beforeTitle;
}

async function openToolbarPopover(page, name, expectedText) {
  const samePage = await assertNoNavigation(page, async () => {
    await page.getByRole('button', { name }).click();
    await page.getByText(expectedText).first().waitFor({ timeout: 5000 });
  });
  await page.keyboard.press('Escape');
  return samePage;
}

async function main() {
  const backendOrigin = process.env.MOCHI_BACKEND_ORIGIN ?? 'http://127.0.0.1:3001';
  const appOrigin = process.env.MOCHI_APP_ORIGIN ?? 'http://127.0.0.1:3000';
  const target = await discoverTarget(backendOrigin);
  const { tableId, viewId, fieldId } = target;
  const marker = `browser-${Date.now()}`;
  let browser;
  let smokeField;
  const results = [];

  try {
    smokeField = await postJson(`${backendOrigin}/api/table/${tableId}/field`, {
      name: `Browser smoke ${marker}`,
      type: 'singleLineText',
      cellValueType: 'string',
    });

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.setDefaultTimeout(15000);
    await page.goto(`${appOrigin}/mochi/local?tableId=${tableId}&viewId=${viewId}`, {
      waitUntil: 'domcontentloaded',
    });
    await page.getByRole('button', { name: 'Add record' }).waitFor();
    await page.getByRole('button', { name: /Filter by/ }).waitFor();
    await wait(3000);

    results.push({
      name: 'filter-popover-no-reload',
      ok: await openToolbarPopover(page, /Filter by/, 'Meeting all conditions'),
    });
    results.push({
      name: 'sort-popover-no-reload',
      ok: await openToolbarPopover(page, /Sort by/, 'Add another sort'),
    });
    results.push({
      name: 'group-popover-no-reload',
      ok: await openToolbarPopover(page, /Group by/, 'Add subgroup'),
    });

    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    const headerMenuSamePage = await assertNoNavigation(page, async () => {
      await page.mouse.move(505, 112);
      await page.waitForTimeout(300);
      await page.mouse.click(505, 112);
      await page.waitForTimeout(500);
      if (!(await page.locator('text=Edit field').first().isVisible())) {
        await page.mouse.click(505, 112);
      }
      await page.locator('text=Edit field').first().waitFor({ timeout: 5000 });
      await page.locator('text=Duplicate field').first().waitFor({ timeout: 5000 });
      await page.locator('text=Filter by this field').first().waitFor({ timeout: 5000 });
      await page.locator('text=Sort by this field').first().waitFor({ timeout: 5000 });
      await page.locator('text=Group by this field').first().waitFor({ timeout: 5000 });
      await page.locator('text=Hide field').first().waitFor({ timeout: 5000 });
      await page.locator('text=Delete field').first().waitFor({ timeout: 5000 });
    });
    results.push({ name: 'field-header-menu-no-reload', ok: headerMenuSamePage });
    await page.keyboard.press('Escape');

    const fieldsBeforeResize = await getFields(backendOrigin, tableId);
    const beforeResize = await getView(backendOrigin, tableId, viewId);
    const beforeLayout = getColumnLayout(fieldsBeforeResize, beforeResize?.columnMeta);
    const firstColumn = beforeLayout.find((column) => column.field.id === fieldId);
    const beforeWidth = beforeResize?.columnMeta?.[fieldId]?.width;
    const resizeX = Math.round((firstColumn?.right ?? 519) - 2);
    await page.mouse.move(resizeX, 113);
    await page.mouse.down();
    await page.mouse.move(resizeX + 90, 113, { steps: 8 });
    await page.mouse.up();
    await wait(1200);
    const afterResize = await getView(backendOrigin, tableId, viewId);
    const afterWidth = afterResize?.columnMeta?.[fieldId]?.width;
    results.push({
      name: 'resize-column-persists',
      ok: typeof afterWidth === 'number' && afterWidth !== beforeWidth,
      beforeWidth,
      afterWidth,
    });

    const fieldsBeforeReorder = await getFields(backendOrigin, tableId);
    const beforeReorder = await getView(backendOrigin, tableId, viewId);
    const reorderLayout = getColumnLayout(fieldsBeforeReorder, beforeReorder?.columnMeta);
    const smokeColumn = reorderLayout.find((column) => column.field.id === smokeField.id);
    const dropColumn =
      reorderLayout.find(
        (column) => column.field.id !== fieldId && column.field.id !== smokeField.id
      ) ?? reorderLayout[0];
    const dragStartX = Math.round(smokeColumn?.center ?? 1045);
    const dragEndX = Math.round(dropColumn?.center ?? 745);
    await page.mouse.move(dragStartX, 113);
    await page.mouse.down();
    await page.mouse.move(dragEndX, 113, { steps: 10 });
    await page.mouse.up();
    await wait(1500);
    const afterReorder = await getView(backendOrigin, tableId, viewId);
    const smokeOrder = afterReorder?.columnMeta?.[smokeField.id]?.order;
    results.push({
      name: 'reorder-column-persists',
      ok: typeof smokeOrder === 'number',
      smokeOrder,
    });

    await page.goto(`${appOrigin}/mochi/local?tableId=${tableId}&viewId=${viewId}`, {
      waitUntil: 'domcontentloaded',
    });
    await page.getByRole('button', { name: 'Add record' }).waitFor();
    await wait(1500);
    results.push({
      name: 'reopen-after-reorder',
      ok:
        page.url().includes(`/mochi/local`) &&
        (await page.getByRole('button', { name: /Filter by/ }).isVisible()),
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
    if (browser) await browser.close().catch(() => undefined);
    if (smokeField?.id) {
      await deleteJson(`${backendOrigin}/api/table/${tableId}/field/${smokeField.id}`).catch(
        () => undefined
      );
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
