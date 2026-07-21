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

const isAlive = (pid) => {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const pruneState = (state) => {
  const runtimes = {};
  for (const [workspacePath, runtime] of Object.entries(state.runtimes || {})) {
    if (isAlive(runtime.backendPid) || isAlive(runtime.frontendPid)) {
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

const healthCheck = (url) =>
  new Promise((resolve) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve(response.statusCode && response.statusCode < 500);
    });
    request.on('error', () => resolve(false));
    request.setTimeout(1000, () => {
      request.destroy();
      resolve(false);
    });
  });

const waitForHealth = async (url, timeoutMs = 30000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await healthCheck(url)) return true;
    await wait(500);
  }
  return false;
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

const openLog = (workspacePath, name) => {
  const safeName = workspacePath.replaceAll(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '');
  return fs.openSync(path.join(logDir, `${safeName}.${name}.log`), 'a');
};

const stopRuntime = async (runtime) => {
  for (const pid of [runtime.frontendPid, runtime.backendPid]) {
    if (!isAlive(pid)) continue;
    try {
      process.kill(-pid, 'SIGTERM');
    } catch {
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        // already gone
      }
    }
  }
  await wait(500);
  for (const pid of [runtime.frontendPid, runtime.backendPid]) {
    if (!isAlive(pid)) continue;
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // already gone
      }
    }
  }
};

const removeRuntimeFromState = (workspacePath) => {
  const state = readState();
  delete state.runtimes?.[workspacePath];
  writeState(state);
};

const waitForeground = (runtime) =>
  new Promise((resolve) => {
    let stopping = false;
    const stop = async (signal) => {
      if (stopping) return;
      stopping = true;
      console.log(`\nStopping Mochi table runtime for ${runtime.workspacePath} (${signal})...`);
      await stopRuntime(runtime);
      removeRuntimeFromState(runtime.workspacePath);
      resolve();
    };

    process.once('SIGINT', () => void stop('SIGINT'));
    process.once('SIGTERM', () => void stop('SIGTERM'));
    process.once('SIGHUP', () => void stop('SIGHUP'));
    console.log('Runtime is running in foreground. Press Ctrl+C to stop frontend and backend.');
  });

const commandOpen = async (options) => {
  const workspacePath = normalizeWorkspacePath(options.db);
  const paths = assertRuntimeFiles();
  let state = pruneState(readState());
  const existing = state.runtimes[workspacePath];
  if (existing) {
    writeState(state);
    console.log(existing.url);
    return;
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
  const backendLog = openLog(workspacePath, 'backend');
  const frontendLog = openLog(workspacePath, 'frontend');

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
  frontend.unref();

  const runtime = {
    workspacePath,
    frontendPort,
    backendPort,
    url,
    backendUrl,
    backendPid: backend.pid,
    frontendPid: frontend.pid,
    startedAt: new Date().toISOString(),
  };
  state.runtimes[workspacePath] = runtime;
  writeState(state);

  await waitForHealth(`${backendUrl}/api/mochi/bases?spaceId=spc_local`, 30000);
  console.log(url);
  if (options.foreground) {
    await waitForeground(runtime);
  }
};

const commandList = (options) => {
  const state = pruneState(readState());
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
  let state = pruneState(readState());
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
  const state = pruneState(readState());
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
    commandList(options);
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
