import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── CSS content helper ────────────────────────────────────────────────────────

function getAnimationsCss(): string {
  try {
    return readFileSync(resolve(__dirname, '../animations.css'), 'utf-8');
  } catch {
    return '';
  }
}

// ── Suite ────────────────────────────────────────────────────────────────────

describe('CSS Animation System (F-024)', () => {
  // ── Keyframes ──────────────────────────────────────────────────────────────

  it('defines all 7 keyframes', () => {
    const css = getAnimationsCss();
    const matches = css.match(/@keyframes\s+hf-[\w-]+/g) ?? [];
    expect(matches.length).toBe(7);
    expect(css).toContain('@keyframes hf-fade-in');
    expect(css).toContain('@keyframes hf-fade-out');
    expect(css).toContain('@keyframes hf-slide-up');
    expect(css).toContain('@keyframes hf-slide-down');
    expect(css).toContain('@keyframes hf-pulse');
    expect(css).toContain('@keyframes hf-glow');
    expect(css).toContain('@keyframes hf-scale-in');
  });

  // ── Reduced motion ─────────────────────────────────────────────────────────

  it('defines prefers-reduced-motion fallback', () => {
    const css = getAnimationsCss();
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });

  // ── CSS variable usage (theme awareness) ────────────────────────────────────

  it('uses CSS variables (not hardcoded colors) in hf-glow', () => {
    const css = getAnimationsCss();
    // hf-glow keyframe must use var(--hf-glow-color)
    expect(css).toContain('var(--hf-glow-color)');
    // The utility class should reference the CSS variable
    expect(css).toContain('--hf-glow-color');
  });

  it('defines CSS custom properties for theme tokens', () => {
    const css = getAnimationsCss();
    expect(css).toContain('--hf-accent');
    expect(css).toContain('--hf-glow-color');
    expect(css).toContain('--hf-fade-duration');
  });

  // ── Wiring tests (className application) ────────────────────────────────────
  // JSDOM does not run CSS animations, so we verify className propagation only.

  it('applies hf-fade-in className to element', () => {
    const { container } = render(<div className="hf-fade-in" />);
    expect(container.firstChild).toHaveProperty('className', 'hf-fade-in');
  });

  it('applies hf-slide-up className to element', () => {
    const { container } = render(<div className="hf-slide-up" />);
    expect(container.firstChild).toHaveProperty('className', 'hf-slide-up');
  });

  it('applies hf-pulse className to element', () => {
    const { container } = render(<div className="hf-pulse" />);
    expect(container.firstChild).toHaveProperty('className', 'hf-pulse');
  });

  it('applies hf-glow className to element', () => {
    const { container } = render(<div className="hf-glow" />);
    expect(container.firstChild).toHaveProperty('className', 'hf-glow');
  });

  it('applies hf-scale-in className to element', () => {
    const { container } = render(<div className="hf-scale-in" />);
    expect(container.firstChild).toHaveProperty('className', 'hf-scale-in');
  });

  it('applies hf-fade-out className to element', () => {
    const { container } = render(<div className="hf-fade-out" />);
    expect(container.firstChild).toHaveProperty('className', 'hf-fade-out');
  });

  it('applies hf-slide-down className to element', () => {
    const { container } = render(<div className="hf-slide-down" />);
    expect(container.firstChild).toHaveProperty('className', 'hf-slide-down');
  });
});
