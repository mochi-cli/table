#!/usr/bin/env node
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(dirname, '..');
const runtimeRoot = path.join(packageRoot, 'runtime');
const defaultStateDir = path.join(os.homedir(), '.mochi', 'table-runtime');
const stateDir = process.env.MOCHI_TABLE_STATE_DIR || defaultStateDir;
const statePath = path.join(stateDir, 'runtimes.json');
const logDir = path.join(stateDir, 'logs');
const defaultHost = process.env.MOCHI_TABLE_HOST || '127.0.0.1';
const defaultFrontendPort = Number(process.env.MOCHI_TABLE_FRONTEND_PORT || 3910);
const defaultBackendPort = Number(process.env.MOCHI_TABLE_BACKEND_PORT || 3911);

const usage = `Mochi Table Runtime

Usage:
  mochi-table open [--db <workspace.mochi>] [--keep-existing] [--frontend-port <port>] [--backend-port <port>] [--foreground]
  mochi-table list
  mochi-table stop|close [--db <workspace.mochi>]
  mochi-table stop-all|close-all
  mochi-table doctor

Environment:
  MOCHI_PROFILE_DB            Workspace path used by open when --db is omitted.
  MOCHI_TABLE_STATE_DIR       Runtime state directory. Defaults to ~/.mochi/table-runtime.
  MOCHI_TABLE_FRONTEND_PORT   Preferred frontend port. Defaults to 3910.
  MOCHI_TABLE_BACKEND_PORT    Preferred backend port. Defaults to 3911.
`;

const parseArgs = (argv) => {
  const [command = '--help', ...rest] = argv;
  const options = { _: [] };
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--db') options.db = rest[++index];
    else if (arg === '--frontend-port') options.frontendPort = Number(rest[++index]);
    else if (arg === '--backend-port') options.backendPort = Number(rest[++index]);
    else if (arg === '--keep-existing') options.keepExisting = true;
    else if (arg === '--foreground') options.foreground = true;
    else if (arg === '--json') options.json = true;
    else options._.push(arg);
  }
  return { command, options };
};

const ensureStateDir = () => {
  fs.mkdirSync(stateDir, { recursive: true });
  fs.mkdirSync(logDir, { recursive: true });
};

const readState = () => {
  ensureStateDir();
  if (!fs.existsSync(statePath)) return { runtimes: {} };
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    return { runtimes: {} };
  }
};

const writeState = (state) => {
  ensureStateDir();
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
};

const normalizeWorkspacePath = (value) => {
  const input = value || process.env.MOCHI_PROFILE_DB;
  if (!input) throw new Error('Missing workspace path. Pass --db or set MOCHI_PROFILE_DB.');
  return path.resolve(input);
};

const getPidStatus = (pid) => {
  if (!pid) return 'missing';
  try {
    process.kill(pid, 0);
    return 'alive';
  } catch (error) {
    return error?.code === 'ESRCH' ? 'dead' : 'unknown';
  }
};

const isAlive = (pid) => getPidStatus(pid) === 'alive';

const backendHealthUrl = (backendUrl) => `${backendUrl}/api/mochi/bases?spaceId=spc_local`;

const isHealthyHttpStatus = (status) =>
  Boolean(status?.ok && status.statusCode >= 200 && status.statusCode < 300);

const isInconclusiveHttpStatus = (status) =>
  Boolean(!status?.ok && ['EPERM', 'EACCES'].includes(status?.error?.code));

const shouldKeepRuntime = async (runtime) => {
  const pidStatuses = [getPidStatus(runtime.backendPid), getPidStatus(runtime.frontendPid)];
  if (pidStatuses.includes('alive') || pidStatuses.includes('unknown')) return true;

  const [frontendStatus, backendStatus] = await Promise.all([
    requestStatus(runtime.url),
    requestStatus(backendHealthUrl(runtime.backendUrl)),
  ]);
  if (isHealthyHttpStatus(frontendStatus) && isHealthyHttpStatus(backendStatus)) return true;
  return isInconclusiveHttpStatus(frontendStatus) || isInconclusiveHttpStatus(backendStatus);
};

const pruneState = async (state) => {
  const runtimes = {};
  for (const [workspacePath, runtime] of Object.entries(state.runtimes || {})) {
    if (await shouldKeepRuntime(runtime)) {
      runtimes[workspacePath] = runtime;
    }
  }
  return { runtimes };
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isPortFree = (port, host = defaultHost) =>
  new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });

const findPort = async (preferred, used) => {
  for (let port = preferred; port < preferred + 200; port += 1) {
    if (used.has(port)) continue;
    if (await isPortFree(port)) return port;
  }
  throw new Error(`No free port found near ${preferred}`);
};

const requestStatus = (url) =>
  new Promise((resolve) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve({ ok: true, statusCode: response.statusCode ?? 0 });
    });
    request.on('error', (error) => resolve({ ok: false, error }));
    request.setTimeout(1000, () => {
      request.destroy();
      resolve({ ok: false, error: new Error(`Timed out requesting ${url}`) });
    });
  });

const waitForHttpOk = async (url, timeoutMs = 30000, isProcessHealthy = () => true) => {
  const start = Date.now();
  let lastStatus;
  while (Date.now() - start < timeoutMs) {
    if (!isProcessHealthy()) return { ok: false, reason: 'process-exited', lastStatus };
    const status = await requestStatus(url);
    lastStatus = status;
    if (status.ok && status.statusCode >= 200 && status.statusCode < 300) {
      return { ok: true, status };
    }
    await wait(500);
  }
  return { ok: false, reason: 'timeout', lastStatus };
};

const runtimePaths = () => ({
  backendEntry: path.join(runtimeRoot, 'backend', 'mochi-local.js'),
  frontendEntry: [
    path.join(runtimeRoot, 'frontend', 'server.js'),
    path.join(runtimeRoot, 'frontend', 'apps', 'nextjs-app', 'server.js'),
  ].find((filePath) => fs.existsSync(filePath)),
  sqliteModule: path.join(runtimeRoot, 'mochi-sqlite', 'src', 'index.mjs'),
});

const assertRuntimeFiles = () => {
  const paths = runtimePaths();
  const missing = Object.entries(paths)
    .filter(([, filePath]) => !filePath || !fs.existsSync(filePath))
    .map(([name, filePath]) => `${name}: ${filePath ?? 'not found'}`);
  if (missing.length) {
    throw new Error(
      `Runtime package is missing built files:\n${missing.map((entry) => `- ${entry}`).join('\n')}`
    );
  }
  return paths;
};

const frontendManifestPaths = () => [
  path.join(runtimeRoot, 'frontend', 'apps', 'nextjs-app', '.next', 'routes-manifest.json'),
  path.join(runtimeRoot, 'frontend', 'apps', 'nextjs-app', '.next', 'required-server-files.json'),
];

const rewriteBuiltBackendUrls = (value, backendUrl) => {
  if (typeof value === 'string') {
    return value
      .replaceAll(/http:\/\/localhost:\d+\//g, `${backendUrl}/`)
      .replaceAll(/http:\/\/127\.0\.0\.1:\d+\//g, `${backendUrl}/`);
  }
  if (Array.isArray(value)) return value.map((entry) => rewriteBuiltBackendUrls(entry, backendUrl));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, rewriteBuiltBackendUrls(entry, backendUrl)])
    );
  }
  return value;
};

const patchFrontendBackendUrl = (backendUrl) => {
  for (const manifestPath of frontendManifestPaths()) {
    if (!fs.existsSync(manifestPath)) continue;
    const before = fs.readFileSync(manifestPath, 'utf8');
    const patched =
      JSON.stringify(rewriteBuiltBackendUrls(JSON.parse(before), backendUrl), null, 2) + '\n';
    if (patched !== before) {
      fs.writeFileSync(manifestPath, patched);
    }
  }
};

const openLog = (workspacePath, name) => {
  const safeName = workspacePath.replaceAll(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '');
  return fs.openSync(path.join(logDir, `${safeName}.${name}.log`), 'a');
};

const logPath = (workspacePath, name) => {
  const safeName = workspacePath.replaceAll(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '');
  return path.join(logDir, `${safeName}.${name}.log`);
};

const stopRuntime = async (runtime) => {
  const signalPid = (pid, signal) => {
    if (!pid) return;
    try {
      process.kill(-pid, signal);
    } catch {
      // process group may already be gone
    }
    try {
      process.kill(pid, signal);
    } catch {
      // leader may already be gone
    }
  };

  for (const pid of [runtime.frontendPid, runtime.backendPid]) {
    signalPid(pid, 'SIGTERM');
  }
  await wait(500);
  for (const pid of [runtime.frontendPid, runtime.backendPid]) {
    signalPid(pid, 'SIGKILL');
  }
};

const removeRuntimeFromState = (workspacePath) => {
  const state = readState();
  delete state.runtimes?.[workspacePath];
  writeState(state);
};

const describeHttpFailure = (result) => {
  if (result.reason === 'process-exited') return 'process exited before becoming healthy';
  const lastStatus = result.lastStatus;
  if (!lastStatus) return result.reason || 'unknown failure';
  if (lastStatus.ok) return `last HTTP status was ${lastStatus.statusCode}`;
  return lastStatus.error?.message || result.reason || 'request failed';
};

const waitForeground = (runtime) =>
  new Promise((resolve) => {
    let stopping = false;
    let checking = false;
    let monitor;
    const stop = async (signal) => {
      if (stopping) return;
      stopping = true;
      if (monitor) clearInterval(monitor);
      console.log(`\nStopping Mochi table runtime for ${runtime.workspacePath} (${signal})...`);
      await stopRuntime(runtime);
      removeRuntimeFromState(runtime.workspacePath);
      resolve();
    };

    const monitorRuntime = async () => {
      if (stopping || checking) return;
      checking = true;
      try {
        if (await shouldKeepRuntime(runtime)) return;
        if (monitor) clearInterval(monitor);
        removeRuntimeFromState(runtime.workspacePath);
        console.log(`\nMochi table runtime stopped for ${runtime.workspacePath}.`);
        resolve();
      } finally {
        checking = false;
      }
    };

    process.once('SIGINT', () => void stop('SIGINT'));
    process.once('SIGTERM', () => void stop('SIGTERM'));
    process.once('SIGHUP', () => void stop('SIGHUP'));
    console.log('Runtime is running in foreground. Press Ctrl+C to stop frontend and backend.');
    monitor = setInterval(() => void monitorRuntime(), 1000);
  });

const commandOpen = async (options) => {
  const workspacePath = normalizeWorkspacePath(options.db);
  const paths = assertRuntimeFiles();
  let state = await pruneState(readState());
  const existing = state.runtimes[workspacePath];
  if (existing) {
    const frontendHealth = await waitForHttpOk(existing.url, 3000);
    const backendHealth = await waitForHttpOk(backendHealthUrl(existing.backendUrl), 3000);
    if (frontendHealth.ok && backendHealth.ok) {
      writeState(state);
      console.log(existing.url);
      return;
    }
    await stopRuntime(existing);
    delete state.runtimes[workspacePath];
    writeState(state);
  }

  if (!options.keepExisting) {
    for (const runtime of Object.values(state.runtimes)) {
      await stopRuntime(runtime);
    }
    state = { runtimes: {} };
  }

  const usedPorts = new Set(
    Object.values(state.runtimes).flatMap((runtime) => [runtime.frontendPort, runtime.backendPort])
  );
  const frontendPort = await findPort(options.frontendPort || defaultFrontendPort, usedPorts);
  usedPorts.add(frontendPort);
  const backendPort = await findPort(options.backendPort || defaultBackendPort, usedPorts);
  const backendUrl = `http://${defaultHost}:${backendPort}`;
  const url = `http://${defaultHost}:${frontendPort}/mochi/local`;
  patchFrontendBackendUrl(backendUrl);
  const backendLog = openLog(workspacePath, 'backend');
  const frontendLog = openLog(workspacePath, 'frontend');
  let backendExit;
  let frontendExit;

  const backend = spawn(process.execPath, [paths.backendEntry], {
    detached: true,
    stdio: ['ignore', backendLog, backendLog],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOSTNAME: defaultHost,
      PORT: String(backendPort),
      SOCKET_PORT: String(backendPort),
      PUBLIC_ORIGIN: `http://${defaultHost}:${frontendPort}`,
      MOCHI_PROFILE_DB: workspacePath,
      MOCHI_SQLITE_RUNTIME_MODULE_PATH: paths.sqliteModule,
      MOCHI_LOCAL_AUTH_DISABLED: 'true',
      NEXT_PUBLIC_MOCHI_LOCAL_AUTH_DISABLED: 'true',
      MOCHI_SQLITE_ENABLED: 'true',
    },
  });
  backend.once('exit', (code, signal) => {
    backendExit = { code, signal };
  });
  backend.unref();

  const frontend = spawn(process.execPath, [paths.frontendEntry], {
    detached: true,
    stdio: ['ignore', frontendLog, frontendLog],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      MOCHI_LOCAL_RUNTIME: 'true',
      HOSTNAME: defaultHost,
      PORT: String(frontendPort),
      SOCKET_PORT: String(backendPort),
      MOCHI_BACKEND_API_URL: backendUrl,
      NEXT_BUILD_ENV_OUTPUT: 'standalone',
      NEXT_PUBLIC_MOCHI_LOCAL_AUTH_DISABLED: 'true',
    },
  });
  frontend.once('exit', (code, signal) => {
    frontendExit = { code, signal };
  });
  frontend.unref();

  const runtime = {
    workspacePath,
    frontendPort,
    backendPort,
    url,
    backendUrl,
    backendPid: backend.pid,
    frontendPid: frontend.pid,
    backendLogPath: logPath(workspacePath, 'backend'),
    frontendLogPath: logPath(workspacePath, 'frontend'),
    startedAt: new Date().toISOString(),
  };
  state.runtimes[workspacePath] = runtime;
  writeState(state);

  const backendHealth = await waitForHttpOk(backendHealthUrl(backendUrl), 30000);
  if (!backendHealth.ok) {
    await stopRuntime(runtime);
    removeRuntimeFromState(workspacePath);
    throw new Error(
      `Backend failed to start: ${describeHttpFailure(backendHealth)}.\n` +
        `Backend log: ${runtime.backendLogPath}`
    );
  }

  const frontendHealth = await waitForHttpOk(url, 30000);
  if (!frontendHealth.ok) {
    await stopRuntime(runtime);
    removeRuntimeFromState(workspacePath);
    throw new Error(
      `Frontend failed to start: ${describeHttpFailure(frontendHealth)}.\n` +
        `Frontend log: ${runtime.frontendLogPath}\n` +
        `Backend log: ${runtime.backendLogPath}`
    );
  }

  console.log(url);
  if (options.foreground) {
    await waitForeground(runtime);
  }
};

const commandList = async (options) => {
  const state = await pruneState(readState());
  writeState(state);
  const runtimes = Object.values(state.runtimes);
  if (options.json) {
    console.log(JSON.stringify(runtimes, null, 2));
    return;
  }
  if (!runtimes.length) {
    console.log('No Mochi table runtimes are running.');
    return;
  }
  for (const runtime of runtimes) {
    console.log(`${runtime.workspacePath}`);
    console.log(`  URL: ${runtime.url}`);
    console.log(`  Backend: ${runtime.backendUrl}`);
    console.log(`  PIDs: frontend=${runtime.frontendPid} backend=${runtime.backendPid}`);
  }
};

const commandStop = async (options) => {
  const workspacePath = options.db
    ? normalizeWorkspacePath(options.db)
    : process.env.MOCHI_PROFILE_DB;
  let state = await pruneState(readState());
  const entries = workspacePath
    ? Object.entries(state.runtimes).filter(([key]) => key === path.resolve(workspacePath))
    : Object.entries(state.runtimes).slice(0, 1);
  for (const [, runtime] of entries) {
    await stopRuntime(runtime);
    delete state.runtimes[runtime.workspacePath];
  }
  writeState(state);
  console.log(`Stopped ${entries.length} runtime(s).`);
};

const commandStopAll = async () => {
  const state = await pruneState(readState());
  for (const runtime of Object.values(state.runtimes)) {
    await stopRuntime(runtime);
  }
  writeState({ runtimes: {} });
  console.log('Stopped all Mochi table runtimes.');
};

const commandDoctor = () => {
  const paths = runtimePaths();
  console.log(`Package: ${packageRoot}`);
  console.log(`State: ${statePath}`);
  for (const [name, filePath] of Object.entries(paths)) {
    console.log(`${name}: ${fs.existsSync(filePath) ? 'ok' : 'missing'} ${filePath}`);
  }
};

const main = async () => {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (command === '--help' || command === '-h' || command === 'help') {
    console.log(usage);
  } else if (command === 'open') {
    await commandOpen(options);
  } else if (command === 'list') {
    await commandList(options);
  } else if (command === 'stop' || command === 'close') {
    await commandStop(options);
  } else if (command === 'stop-all' || command === 'close-all') {
    await commandStopAll();
  } else if (command === 'doctor') {
    commandDoctor();
  } else {
    console.error(usage);
    process.exitCode = 1;
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
