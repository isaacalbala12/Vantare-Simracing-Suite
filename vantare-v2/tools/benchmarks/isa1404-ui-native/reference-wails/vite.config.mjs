import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
export default {
  root: path.join(here, 'frontend'),
  resolve: {
    alias: {
      react: path.resolve(here, '../../../../frontend/node_modules/react'),
      'react-dom': path.resolve(here, '../../../../frontend/node_modules/react-dom'),
    },
  },
  build: {outDir: path.join(here, 'assets', 'dist'), emptyOutDir: true},
};
