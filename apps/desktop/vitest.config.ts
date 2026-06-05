import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/__tests__/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../../shared'),
      '@vantare/sim-core': path.resolve(__dirname, '../../packages/sim-core/src'),
      '@vantare/ui-core': path.resolve(__dirname, '../../packages/ui-core/src'),
      '@vantare/auth': path.resolve(__dirname, '../../packages/auth/src'),
    },
  },
});
