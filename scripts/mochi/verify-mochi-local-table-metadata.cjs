#!/usr/bin/env node

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GET ${url} failed with ${response.status}`);
  }
  return response.json();
}

async function putJson(url, body) {
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(`PUT ${url} failed with ${response.status}`);
  }
  return json;
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

  return { baseId: base.id, tableId: table.id };
}

const findTableNode = (tree, tableId) =>
  tree?.nodes?.find?.((node) => node?.resourceType === 'table' && node?.resourceId === tableId);

async function verifyTableMetadata(origin, baseId, tableId) {
  const original = await getJson(`${origin}/api/mochi/tables/${tableId}`);
  const marker = `metadata-${Date.now()}`;
  const next = {
    name: `Local ${marker}`,
    icon: 'table-2',
    description: `Verified ${marker}`,
  };

  const results = [];
  try {
    const nameResponse = await putJson(`${origin}/api/base/${baseId}/table/${tableId}/name`, {
      name: next.name,
    });
    const iconResponse = await putJson(`${origin}/api/base/${baseId}/table/${tableId}/icon`, {
      icon: next.icon,
    });
    const descriptionResponse = await putJson(
      `${origin}/api/base/${baseId}/table/${tableId}/description`,
      { description: next.description }
    );

    const updatedTable = await getJson(`${origin}/api/mochi/tables/${tableId}`);
    const tree = await getJson(`${origin}/api/base/${baseId}/node/tree`);
    const node = findTableNode(tree, tableId);

    results.push(
      {
        name: 'name',
        ok:
          nameResponse.name === next.name &&
          updatedTable.name === next.name &&
          node?.resourceMeta?.name === next.name,
      },
      {
        name: 'icon',
        ok:
          iconResponse.icon === next.icon &&
          updatedTable.icon === next.icon &&
          node?.resourceMeta?.icon === next.icon,
      },
      {
        name: 'description',
        ok:
          descriptionResponse.description === next.description &&
          updatedTable.description === next.description,
      }
    );

    return {
      ok: results.every((result) => result.ok),
      target: { baseId, tableId },
      marker,
      results,
      node: node
        ? {
            id: node.id,
            resourceId: node.resourceId,
            resourceMeta: node.resourceMeta,
          }
        : null,
      table: updatedTable,
    };
  } finally {
    await putJson(`${origin}/api/base/${baseId}/table/${tableId}/name`, {
      name: original.name,
    }).catch(() => undefined);
    await putJson(`${origin}/api/base/${baseId}/table/${tableId}/icon`, {
      icon: original.icon ?? null,
    }).catch(() => undefined);
    await putJson(`${origin}/api/base/${baseId}/table/${tableId}/description`, {
      description: original.description ?? null,
    }).catch(() => undefined);
  }
}

async function main() {
  const origin = process.env.MOCHI_BACKEND_ORIGIN ?? 'http://127.0.0.1:3001';
  const target =
    process.argv[2] && process.argv[3]
      ? { baseId: process.argv[2], tableId: process.argv[3] }
      : await discoverTarget(origin);
  const result = await verifyTableMetadata(origin, target.baseId, target.tableId);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
