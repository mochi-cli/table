import swc from 'unplugin-swc';
import tsconfigPaths from 'vite-tsconfig-paths';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      buffer: 'node:buffer',
    },
    conditions: ['@teable/source'],
  },
  ssr: {
    resolve: {
      conditions: ['@teable/source'],
      externalConditions: ['@teable/source'],
    },
  },
  plugins: [
    swc.vite({
      jsc: {
        target: 'es2022',
      },
    }),
    tsconfigPaths(),
  ],
  cacheDir: '../../.cache/vitest/nestjs-backend/mochi',
  test: {
    globals: true,
    environment: 'node',
    passWithNoTests: false,
    pool: 'forks',
    include: ['src/features/mochi-sqlite/**/*.spec.ts'],
    exclude: [...configDefaults.exclude, '**/.next/**'],
  },
});
