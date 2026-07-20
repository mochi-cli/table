#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(dirname, '..');
const repoRoot = path.resolve(packageRoot, '..', '..');
const runtimeRoot = path.join(packageRoot, 'runtime');

const copyDir = (from, to) => {
  if (!fs.existsSync(from)) {
    throw new Error(`Missing build output: ${from}`);
  }
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, { recursive: true });
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
copyDir(path.join(backendDist, 'mochi-sqlite'), path.join(runtimeRoot, 'mochi-sqlite'));
copyDir(sqlitePackage, path.join(runtimeRoot, 'mochi-sqlite-source'));
copyDir(frontendStandalone, path.join(runtimeRoot, 'frontend'));

const standaloneAppDir = path.join(runtimeRoot, 'frontend', 'apps', 'nextjs-app');
fs.mkdirSync(path.join(standaloneAppDir, '.next'), { recursive: true });
copyDir(frontendStatic, path.join(standaloneAppDir, '.next', 'static'));
copyDir(frontendPublic, path.join(standaloneAppDir, 'public'));

console.log(`Prepared Mochi table runtime package at ${runtimeRoot}`);
