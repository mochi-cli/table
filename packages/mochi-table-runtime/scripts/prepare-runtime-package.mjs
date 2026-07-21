#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(dirname, '..');
const repoRoot = path.resolve(packageRoot, '..', '..');
const runtimeRoot = path.join(packageRoot, 'runtime');
const appRoot = path.join(repoRoot, 'apps', 'nextjs-app');
const pnpmPublicHoistRoot = path.join(repoRoot, 'node_modules', '.pnpm', 'node_modules');
const requireFromApp = createRequire(path.join(appRoot, 'package.json'));

const copyDir = (from, to) => {
  if (!fs.existsSync(from)) {
    throw new Error(`Missing build output: ${from}`);
  }
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, { recursive: true });
};

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

const packageTargetPath = (nodeModulesRoot, packageName) => {
  const parts = packageName.split('/');
  return path.join(nodeModulesRoot, ...parts);
};

const resolvePackageJson = (packageName, fromDir = appRoot) => {
  try {
    return requireFromApp.resolve(`${packageName}/package.json`, { paths: [fromDir] });
  } catch {
    const hoistedPackageJson = path.join(
      pnpmPublicHoistRoot,
      ...packageName.split('/'),
      'package.json'
    );
    return fs.existsSync(hoistedPackageJson) ? hoistedPackageJson : undefined;
  }
};

const collectDependencyClosure = (packageNames) => {
  const queue = [...packageNames].map((packageName) => ({ packageName, fromDir: appRoot }));
  const seen = new Set();
  const resolved = new Map();

  while (queue.length) {
    const { packageName, fromDir } = queue.shift();
    if (!packageName || seen.has(packageName)) continue;
    seen.add(packageName);

    const packageJsonPath = resolvePackageJson(packageName, fromDir);
    if (!packageJsonPath) {
      console.warn(`Skipping unresolved frontend dependency: ${packageName}`);
      continue;
    }

    const packageDir = fs.realpathSync(path.dirname(packageJsonPath));
    resolved.set(packageName, packageDir);
    const packageJson = readJson(path.join(packageDir, 'package.json'));
    const dependencies = {
      ...packageJson.dependencies,
      ...packageJson.optionalDependencies,
      ...packageJson.peerDependencies,
    };

    for (const dependencyName of Object.keys(dependencies)) {
      if (!seen.has(dependencyName) && resolvePackageJson(dependencyName, packageDir)) {
        queue.push({ packageName: dependencyName, fromDir: packageDir });
      }
    }
  }

  return resolved;
};

const copyFrontendDependencyClosure = (frontendRoot) => {
  const appPackageJson = readJson(path.join(appRoot, 'package.json'));
  const frontendNodeModules = path.join(frontendRoot, 'node_modules');
  const seedDependencies = new Set([
    'next',
    'react',
    'react-dom',
    '@sentry/nextjs',
    '@sentry/core',
    '@sentry/react',
    'core-js',
    'next-i18next',
    'i18next',
    'i18next-fs-backend',
    'react-i18next',
    'tree-changes',
    ...Object.keys(appPackageJson.dependencies ?? {}),
  ]);

  fs.mkdirSync(frontendNodeModules, { recursive: true });
  for (const [packageName, sourceDir] of collectDependencyClosure(seedDependencies)) {
    const targetDir = packageTargetPath(frontendNodeModules, packageName);
    if (fs.existsSync(targetDir)) continue;
    fs.mkdirSync(path.dirname(targetDir), { recursive: true });
    fs.cpSync(sourceDir, targetDir, {
      recursive: true,
      dereference: true,
      filter: (source) => !source.includes(`${path.sep}.cache${path.sep}`),
    });
  }
};

const assertFrontendModules = (frontendRoot) => {
  const frontendNodeModules = path.join(frontendRoot, 'node_modules');
  const requiredEntries = {
    next: ['next', 'package.json'],
    '@sentry/nextjs': ['@sentry', 'nextjs', 'package.json'],
    '@sentry/core': ['@sentry', 'core', 'package.json'],
    'core-js': ['core-js', 'modules', 'es.object.define-property.js'],
    'react-i18next': ['react-i18next', 'package.json'],
    'tree-changes': ['tree-changes', 'dist', 'index.js'],
  };
  const missing = Object.entries(requiredEntries)
    .filter(([, parts]) => !fs.existsSync(path.join(frontendNodeModules, ...parts)))
    .map(([packageName]) => packageName);
  if (missing.length) {
    throw new Error(`Frontend runtime is missing dependencies: ${missing.join(', ')}`);
  }
};

fs.rmSync(runtimeRoot, { recursive: true, force: true });
fs.mkdirSync(runtimeRoot, { recursive: true });

const backendDist = path.join(repoRoot, 'apps', 'nestjs-backend', 'dist');
const frontendStandalone = path.join(repoRoot, 'apps', 'nextjs-app', '.next', 'standalone');
const frontendStatic = path.join(repoRoot, 'apps', 'nextjs-app', '.next', 'static');
const frontendPublic = path.join(repoRoot, 'apps', 'nextjs-app', 'public');
const sqlitePackage = path.join(repoRoot, 'packages', 'mochi-sqlite');

fs.mkdirSync(path.join(runtimeRoot, 'backend'), { recursive: true });
fs.copyFileSync(
  path.join(backendDist, 'mochi-local.js'),
  path.join(runtimeRoot, 'backend', 'mochi-local.js')
);
fs.writeFileSync(
  path.join(runtimeRoot, 'backend', 'package.json'),
  `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`
);
copyDir(path.join(backendDist, 'mochi-sqlite'), path.join(runtimeRoot, 'mochi-sqlite'));
copyDir(sqlitePackage, path.join(runtimeRoot, 'mochi-sqlite-source'));
copyDir(frontendStandalone, path.join(runtimeRoot, 'frontend'));
copyFrontendDependencyClosure(path.join(runtimeRoot, 'frontend'));

const standaloneAppDir = path.join(runtimeRoot, 'frontend', 'apps', 'nextjs-app');
fs.mkdirSync(path.join(standaloneAppDir, '.next'), { recursive: true });
fs.copyFileSync(
  path.join(appRoot, 'next-i18next.config.js'),
  path.join(standaloneAppDir, 'next-i18next.config.js')
);
copyDir(frontendStatic, path.join(standaloneAppDir, '.next', 'static'));
copyDir(frontendPublic, path.join(standaloneAppDir, 'public'));
assertFrontendModules(path.join(runtimeRoot, 'frontend'));

console.log(`Prepared Mochi table runtime package at ${runtimeRoot}`);
