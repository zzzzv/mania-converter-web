import { existsSync, renameSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * 单文件产物默认叫 index.html，改成更有辨识度的文件名。
 * 只在构建结束时改一次，开发服务器仍然用 index.html 作为入口。
 */
function renameSingleFileOutput(fileName: string) {
  return {
    name: 'rename-single-file-output',
    enforce: 'post' as const,
    closeBundle() {
      const outDir = resolve(process.cwd(), 'dist');
      const from = resolve(outDir, 'index.html');

      if (!existsSync(from)) return;

      const to = resolve(outDir, fileName);
      rmSync(to, { force: true });
      renameSync(from, to);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile(), renameSingleFileOutput('mania-converter.html')],
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
  build: {
    target: 'es2020',
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 4000,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
