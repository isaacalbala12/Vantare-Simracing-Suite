import { mergeConfig } from 'vite';
import path from 'path';

export default {
  stories: ['../src/renderer/overlays/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-essentials'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  async viteFinal(config) {
    return mergeConfig(config, {
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '../src/renderer'),
          '@vantare/ui-core': path.resolve(__dirname, '../../../packages/ui-core/src'),
          '@vantare/sim-core': path.resolve(__dirname, '../../../packages/sim-core/src'),
        },
      },
    });
  },
};
