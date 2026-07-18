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

const findNode = (tree, nodeId) => tree?.nodes?.find?.((node) => node?.id === nodeId);
const findTableNode = (tree, tableId) =>
  tree?.nodes?.find?.((node) => node?.resourceType === 'table' && node?.resourceId === tableId);

async function main() {
  const origin = process.env.MOCHI_BACKEND_ORIGIN ?? 'http://127.0.0.1:3001';
  const target =
    process.argv[2] && process.argv[3]
      ? { baseId: process.argv[2], tableId: process.argv[3] }
      : await discoverTarget(origin);
  const { baseId, tableId } = target;
  const marker = `base-node-${Date.now()}`;
  const createdNodeIds = new Set();
  const results = [];

  try {
    const base = await getJson(`${origin}/api/base/${baseId}`);
    results.push({
      name: 'local-base-owner-no-login',
      ok: base.id === baseId && base.role === 'owner' && base.createdUser?.id === 'usr_mochi_local',
    });

    const basePermission = await getJson(`${origin}/api/base/${baseId}/permission`);
    const tablePermission = await getJson(
      `${origin}/api/base/${baseId}/table/${tableId}/permission`
    );
    results.push({
      name: 'local-permissions-disable-login-features',
      ok:
        basePermission['table|read'] === true &&
        basePermission['view|share'] === false &&
        basePermission['record|comment'] === false &&
        tablePermission.view?.['view|share'] === false &&
        tablePermission.record?.['record|comment'] === false,
    });

    const created = await postJson(`${origin}/api/base/${baseId}/node`, {
      resourceType: 'table',
      name: `Node ${marker}`,
      icon: 'table-2',
    });
    createdNodeIds.add(created.id);
    const createTree = await getJson(`${origin}/api/base/${baseId}/node/tree`);
    const createdNode = findNode(createTree, created.id);
    results.push({
      name: 'base-node-create-table',
      ok:
        created.resourceType === 'table' &&
        created.resourceMeta?.name === `Node ${marker}` &&
        created.defaultUrl?.includes(`/mochi/local?tableId=${created.id}`) &&
        createdNode?.resourceMeta?.defaultViewId === created.resourceMeta?.defaultViewId,
    });

    const renamed = await putJson(`${origin}/api/base/${baseId}/node/${created.id}`, {
      name: `Node renamed ${marker}`,
      icon: 'building-2',
    });
    results.push({
      name: 'base-node-rename-icon',
      ok:
        renamed.resourceMeta?.name === `Node renamed ${marker}` &&
        renamed.resourceMeta?.icon === 'building-2',
    });

    const moved = await putJson(`${origin}/api/base/${baseId}/node/${created.id}/move`, {
      anchorId: tableId,
      position: 'after',
    });
    results.push({
      name: 'base-node-move-after-anchor',
      ok: moved.id === created.id && typeof moved.order === 'number',
    });

    const duplicated = await postJson(`${origin}/api/base/${baseId}/node/${created.id}/duplicate`, {
      name: `Node duplicate ${marker}`,
      includeRecords: false,
    });
    createdNodeIds.add(duplicated.id);
    const duplicateTree = await getJson(`${origin}/api/base/${baseId}/node/tree`);
    results.push({
      name: 'base-node-duplicate',
      ok:
        duplicated.id !== created.id &&
        duplicated.resourceMeta?.name === `Node duplicate ${marker}` &&
        Boolean(findTableNode(duplicateTree, duplicated.id)),
    });

    await deleteJson(`${origin}/api/base/${baseId}/node/${duplicated.id}`);
    createdNodeIds.delete(duplicated.id);
    await deleteJson(`${origin}/api/base/${baseId}/node/${created.id}`);
    createdNodeIds.delete(created.id);
    const deleteTree = await getJson(`${origin}/api/base/${baseId}/node/tree`);
    results.push({
      name: 'base-node-delete-removes-active-tree-nodes',
      ok: [created.id, duplicated.id].every((nodeId) => !findTableNode(deleteTree, nodeId)),
    });

    const [shareList, publicSetting, commentCounts, recordCommentCount, aiConfig, disabledAi] =
      await Promise.all([
        getJson(`${origin}/api/base/${baseId}/share`),
        getJson(`${origin}/api/admin/setting/public`),
        getJson(`${origin}/api/comment/${tableId}/count`),
        getJson(`${origin}/api/comment/${tableId}/rec_missing/count`),
        getJson(`${origin}/api/${baseId}/ai/config`),
        getJson(`${origin}/api/${baseId}/ai/disable-ai-actions`),
      ]);
    results.push({
      name: 'local-safe-share-admin-comment-ai-stubs',
      ok:
        Array.isArray(shareList) &&
        shareList.length === 0 &&
        publicSetting.instanceId === 'mochi-local' &&
        publicSetting.disallowSignUp === true &&
        Array.isArray(commentCounts) &&
        commentCounts.length === 0 &&
        recordCommentCount.count === 0 &&
        aiConfig.enable === false &&
        Array.isArray(disabledAi.disableActions),
    });

    const lastVisitPayload = {
      resourceType: 'table',
      resourceId: tableId,
      parentResourceId: baseId,
    };
    const [lastVisitEcho, lastVisit, lastVisitMap, baseNodeVisit, listBaseVisit] =
      await Promise.all([
        postJson(`${origin}/api/user/last-visit`, lastVisitPayload),
        getJson(`${origin}/api/user/last-visit`),
        getJson(`${origin}/api/user/last-visit/map`),
        getJson(`${origin}/api/user/last-visit/base-node`),
        getJson(`${origin}/api/user/last-visit/list-base`),
      ]);
    results.push({
      name: 'local-safe-last-visit-fallbacks',
      ok:
        lastVisitEcho.resourceId === tableId &&
        lastVisit === null &&
        Object.keys(lastVisitMap).length === 0 &&
        baseNodeVisit === null &&
        Object.keys(listBaseVisit).length === 0,
    });

    const result = {
      ok: results.every((item) => item.ok),
      target,
      marker,
      results,
    };
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) {
      process.exitCode = 1;
    }
  } finally {
    for (const nodeId of [...createdNodeIds].reverse()) {
      await deleteJson(`${origin}/api/base/${baseId}/node/${nodeId}`).catch(() => undefined);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
