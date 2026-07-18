#!/usr/bin/env node

const { createRequire } = require('module');
const path = require('path');

const backendRequire = createRequire(path.join(process.cwd(), 'apps/nestjs-backend/package.json'));
const WebSocket = backendRequire('ws');
const ShareDB = backendRequire('sharedb/lib/client');

class SockJsWsBridge {
  constructor(url) {
    this.readyState = 0;
    this.ws = new WebSocket(url);
    this.ws.on('message', (buf) => {
      const frame = buf.toString();
      if (frame === 'o') {
        this.readyState = 1;
        this.onopen?.({ type: 'open' });
        return;
      }
      if (frame === 'h') return;
      if (frame.startsWith('a')) {
        for (const data of JSON.parse(frame.slice(1))) {
          this.onmessage?.({ data });
        }
        return;
      }
      if (frame.startsWith('c')) {
        this.readyState = 3;
        this.onclose?.({ type: 'close', data: frame });
      }
    });
    this.ws.on('error', (error) => this.onerror?.(error));
    this.ws.on('close', () => {
      this.readyState = 3;
      this.onclose?.({ type: 'close' });
    });
  }

  send(data) {
    const message = typeof data === 'string' ? data : JSON.stringify(data);
    this.ws.send(JSON.stringify([message]));
  }

  close() {
    this.readyState = 2;
    this.ws.close();
  }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitFor = (setup, timeoutMs, label) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timeout`)), timeoutMs);
    setup(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });

const hasSetViewAction = (batch, tableId, viewId, property) =>
  batch?.some?.(
    (item) =>
      item?.actionKey === 'setView' &&
      item?.payload?.tableId === tableId &&
      item?.payload?.viewId === viewId &&
      item?.payload?.skipRealtime === true &&
      item?.payload?.updatedProperties?.includes?.(property)
  );

async function waitForSetView(received, tableId, viewId, property, fromIndex) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 5000) {
    const match = received
      .slice(fromIndex)
      .find((batch) => hasSetViewAction(batch, tableId, viewId, property));
    if (match) return match;
    await wait(50);
  }
  throw new Error(`setView presence for ${property} timeout`);
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GET ${url} failed with ${response.status}`);
  }
  return response.json();
}

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
    getJson(`${origin}/api/mochi/tables/${table.id}/views`),
    getJson(`${origin}/api/mochi/tables/${table.id}/fields`),
  ]);
  const view = views[0];
  const field = fields[0];
  if (!view?.id || !field?.id) {
    throw new Error(`Table ${table.id} needs at least one view and one field.`);
  }

  return {
    tableId: table.id,
    viewId: view.id,
    fieldId: field.id,
  };
}

async function main() {
  const origin = process.env.MOCHI_BACKEND_ORIGIN ?? 'http://127.0.0.1:3001';
  const discovered =
    process.argv[2] && process.argv[3] && process.argv[4]
      ? {
          tableId: process.argv[2],
          viewId: process.argv[3],
          fieldId: process.argv[4],
        }
      : await discoverTarget(origin);
  const { tableId, viewId, fieldId } = discovered;

  const wsOrigin = origin.replace(/^http/, 'ws');
  const sock = new SockJsWsBridge(
    `${wsOrigin}/socket/000/${Math.random().toString(36).slice(2)}/websocket`
  );
  await waitFor(
    (resolve, reject) => {
      sock.onopen = resolve;
      sock.onerror = reject;
    },
    8000,
    'socket open'
  );

  const connection = new ShareDB.Connection(sock);
  const received = [];
  const presence = connection.getPresence(`__action_trigger_${tableId}`);
  await new Promise((resolve, reject) =>
    presence.subscribe((error) => (error ? reject(error) : resolve()))
  );
  presence.addListener('receive', (_id, batch) => received.push(batch));

  const query = connection.createSubscribeQuery(`viw_${tableId}`, {});
  await waitFor(
    (resolve, reject) => {
      query.once('ready', resolve);
      query.once('error', reject);
    },
    8000,
    'view query ready'
  );

  const marker = `rt-${Date.now()}`;
  const operations = [
    {
      name: 'name',
      method: 'PUT',
      path: 'name',
      body: { name: `Grid view ${marker}` },
      property: 'name',
      responseValue: (json) => json.name,
      expectedValue: `Grid view ${marker}`,
    },
    {
      name: 'filter',
      method: 'PUT',
      path: 'filter',
      body: {
        filter: {
          conjunction: 'and',
          filterSet: [{ fieldId, operator: 'is', value: marker }],
        },
      },
      property: 'filter',
      responseValue: (json) => json.filter?.filterSet?.[0]?.value,
      expectedValue: marker,
    },
    {
      name: 'sort',
      method: 'PUT',
      path: 'sort',
      body: { sort: [{ fieldId, order: 'asc' }] },
      property: 'sort',
      responseValue: (json) => json.sort?.sortObjs?.[0]?.fieldId,
      expectedValue: fieldId,
    },
    {
      name: 'group',
      method: 'PUT',
      path: 'group',
      body: { group: [{ fieldId, order: 'asc' }] },
      property: 'group',
      responseValue: (json) => json.group?.[0]?.fieldId,
      expectedValue: fieldId,
    },
    {
      name: 'columnMeta',
      method: 'PUT',
      path: 'column-meta',
      body: { columnMeta: { [fieldId]: { width: 240 } } },
      property: 'columnMeta',
      responseValue: (json) => json.columnMeta?.[fieldId]?.width,
      expectedValue: 240,
    },
    {
      name: 'options',
      method: 'PATCH',
      path: 'options',
      body: { options: { rowHeight: 'medium' } },
      property: 'options',
      responseValue: (json) => json.options?.rowHeight,
      expectedValue: 'medium',
    },
  ];

  const results = [];
  for (const operation of operations) {
    const fromIndex = received.length;
    const response = await fetch(
      `${origin}/api/table/${tableId}/view/${viewId}/${operation.path}`,
      {
        method: operation.method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(operation.body),
      }
    );
    const responseJson = await response.json();
    const presenceBatch = await waitForSetView(
      received,
      tableId,
      viewId,
      operation.property,
      fromIndex
    );
    results.push({
      name: operation.name,
      ok: response.ok && operation.responseValue(responseJson) === operation.expectedValue,
      status: response.status,
      updatedProperties: presenceBatch[0]?.payload?.updatedProperties,
    });
  }

  connection.close();
  sock.close();

  console.log(
    JSON.stringify(
      {
        ok: results.every((result) => result.ok),
        target: discovered,
        marker,
        results,
        received,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
