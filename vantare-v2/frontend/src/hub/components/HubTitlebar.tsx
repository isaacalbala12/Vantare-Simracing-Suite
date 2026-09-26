import { useEffect, useRef, useState } from 'react';
import { Application, Events, Window } from '@wailsio/runtime';
import { useI18n } from '../../i18n/I18nProvider';
import { isHubTextEditor, performHubEditAction, type HubEditAction } from './hub-titlebar-actions';
import '../../styles/hub-titlebar.css';

type MenuSection = 'file' | 'edit' | 'view' | 'help';
type MenuAction = HubEditAction | 'quit' | 'fullscreen' | 'about';

const sections: MenuSection[] = ['file', 'edit', 'view', 'help'];
const items: Record<MenuSection, (MenuAction | 'separator')[]> = {
  file: ['quit'],
  edit: ['undo', 'redo', 'separator', 'cut', 'copy', 'paste', 'delete', 'separator', 'selectAll'],
  view: ['fullscreen'],
  help: ['about'],
};
const shortcuts: Partial<Record<MenuAction, string>> = {
  undo: 'Ctrl+Z', redo: 'Ctrl+Y', cut: 'Ctrl+X', copy: 'Ctrl+C',
  paste: 'Ctrl+V', delete: 'Del', selectAll: 'Ctrl+A', fullscreen: 'F11',
};

export function HubTitlebar() {
  const { t } = useI18n();
  const [open, setOpen] = useState<MenuSection | null>(null);
  const [maximised, setMaximised] = useState(false);
  const barRef = useRef<HTMLElement>(null);
  const editorRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const onFocus = (event: FocusEvent) => {
      if (isHubTextEditor(event.target as Element)) editorRef.current = event.target as HTMLElement;
    };
    document.addEventListener('focusin', onFocus);
    const offMaximise = Events.On('common:WindowMaximise', () => setMaximised(true));
    const offRestore = Events.On('common:WindowUnMaximise', () => setMaximised(false));
    return () => {
      document.removeEventListener('focusin', onFocus);
      offMaximise?.();
      offRestore?.();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!barRef.current?.contains(event.target as Node)) setOpen(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'F11') return;
      event.preventDefault();
      void Window.ToggleFullscreen();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const runAction = (action: MenuAction) => {
    setOpen(null);
    if (action === 'quit') return Application.Quit();
    if (action === 'fullscreen') return Window.ToggleFullscreen();
    if (action === 'about') return Events.Emit('hub:menu:about');
    return performHubEditAction(action, editorRef.current);
  };

  return (
    <header ref={barRef} className="hub-titlebar" data-testid="hub-titlebar">
      <span className="hub-titlebar__brand" aria-label="Vantare">V</span>
      <nav className="hub-titlebar__menus" aria-label={t('shell.chrome.menu')}>
        {sections.map((section) => (
          <div key={section} className="hub-titlebar__group" onMouseEnter={() => { if (open) setOpen(section); }}>
            <button
              type="button"
              className="hub-titlebar__menu"
              aria-haspopup="menu"
              aria-expanded={open === section}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setOpen(open === section ? null : section)}
            >
              {t(`shell.chrome.${section}`)}
            </button>
            {open === section ? (
              <div className="hub-titlebar__dropdown" role="menu" aria-label={t(`shell.chrome.${section}`)}>
                {items[section].map((action, index) => action === 'separator' ? (
                  <div key={`separator-${index}`} className="hub-titlebar__separator" role="separator" />
                ) : (
                  <button
                    key={action}
                    type="button"
                    role="menuitem"
                    className="hub-titlebar__item"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => { void runAction(action); }}
                  >
                    <span>{t(`shell.chrome.${action}`)}</span>
                    {shortcuts[action] ? <span className="hub-titlebar__shortcut">{shortcuts[action]}</span> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </nav>
      <span className="hub-titlebar__drag" aria-hidden="true" />
      <div className="hub-titlebar__controls">
        <button type="button" className="hub-titlebar__control" aria-label={t('shell.chrome.minimise')} onClick={() => void Window.Minimise()}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10" /></svg>
        </button>
        <button type="button" className="hub-titlebar__control" aria-label={t(maximised ? 'shell.chrome.restore' : 'shell.chrome.maximise')} onClick={() => void Window.ToggleMaximise()}>
          <svg viewBox="0 0 16 16" aria-hidden="true">{maximised ? <><rect x="3" y="5" width="9" height="8" rx="1" /><path d="M6 5V3h7v7h-1" /></> : <rect x="3" y="3" width="10" height="10" rx="1" />}</svg>
        </button>
        <button type="button" className="hub-titlebar__control hub-titlebar__control--close" aria-label={t('shell.chrome.close')} onClick={() => void Window.Close()}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
        </button>
      </div>
    </header>
  );
}
