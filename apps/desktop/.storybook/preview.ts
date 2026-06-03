import '../src/renderer/styles/globals.css';

export default {
  parameters: {
    viewport: {
      defaultViewport: 'overlay',
      viewports: {
        overlay: {
          name: 'Overlay 1920x1080',
          styles: { width: '1920px', height: '1080px' },
        },
      },
    },
    backgrounds: {
      default: 'transparent',
      values: [
        { name: 'transparent', value: 'transparent' },
        { name: 'dark', value: '#0a0a0f' },
      ],
    },
  },
};
