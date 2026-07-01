import { describe, expect, it } from 'vitest';
import { parseKeyEvent } from './hotkey-capture';

function mockKeyEvent(overrides: Partial<KeyboardEvent>): KeyboardEvent {
  return {
    key: '',
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    preventDefault: () => {},
    ...overrides,
  } as KeyboardEvent;
}

describe('parseKeyEvent', () => {
  it('returns isCancel for Escape', () => {
    const result = parseKeyEvent(mockKeyEvent({ key: 'Escape' }));
    expect(result.isCancel).toBe(true);
    expect(result.combo).toBeNull();
  });

  it('captures ctrl+shift+v', () => {
    const result = parseKeyEvent(mockKeyEvent({ key: 'v', ctrlKey: true, shiftKey: true }));
    expect(result.combo).toBe('ctrl+shift+v');
    expect(result.isCancel).toBe(false);
  });

  it('captures alt+1', () => {
    const result = parseKeyEvent(mockKeyEvent({ key: '1', altKey: true }));
    expect(result.combo).toBe('alt+1');
  });

  it('captures meta+k', () => {
    const result = parseKeyEvent(mockKeyEvent({ key: 'k', metaKey: true }));
    expect(result.combo).toBe('meta+k');
  });

  it('captures ctrl+shift+alt+right', () => {
    const result = parseKeyEvent(
      mockKeyEvent({ key: 'ArrowRight', ctrlKey: true, shiftKey: true, altKey: true }),
    );
    expect(result.combo).toBe('ctrl+shift+alt+right');
  });

  it('returns null combo for modifier-only (Ctrl)', () => {
    const result = parseKeyEvent(mockKeyEvent({ key: 'Control', ctrlKey: true }));
    expect(result.combo).toBeNull();
    expect(result.isCancel).toBe(false);
  });

  it('returns null combo for modifier-only (Shift)', () => {
    const result = parseKeyEvent(mockKeyEvent({ key: 'Shift', shiftKey: true }));
    expect(result.combo).toBeNull();
    expect(result.isCancel).toBe(false);
  });

  it('returns null combo for modifier-only (Alt)', () => {
    const result = parseKeyEvent(mockKeyEvent({ key: 'Alt', altKey: true }));
    expect(result.combo).toBeNull();
    expect(result.isCancel).toBe(false);
  });

  it('captures space key', () => {
    const result = parseKeyEvent(mockKeyEvent({ key: ' ' }));
    expect(result.combo).toBe('space');
  });

  it('captures single letter without modifiers', () => {
    const result = parseKeyEvent(mockKeyEvent({ key: 'a' }));
    expect(result.combo).toBe('a');
  });
});
