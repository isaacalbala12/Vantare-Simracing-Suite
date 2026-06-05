import { describe, expect, it } from 'vitest';
import { builtInThemes, dark } from '../index';

describe('Renderer theme exports', () => {
  it('re-exports built-in themes from ui-core', () => {
    expect(builtInThemes).toHaveLength(3);
    expect(dark.id).toBe('dark');
    expect(dark.tokens.color.surface).toBe('#0a0a0a');
  });
});
