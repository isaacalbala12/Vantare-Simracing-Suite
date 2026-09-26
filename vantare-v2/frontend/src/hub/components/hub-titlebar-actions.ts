import { Clipboard } from '@wailsio/runtime';

export type HubEditAction = 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'delete' | 'selectAll';

export function isHubTextEditor(element: Element | null): element is HTMLElement {
  if (element instanceof HTMLTextAreaElement) return true;
  if (element instanceof HTMLInputElement) {
    return ['text', 'search', 'url', 'tel', 'email'].includes(element.type);
  }
  return element instanceof HTMLElement && element.isContentEditable;
}

function selectedText(editor: HTMLElement): string {
  if (editor instanceof HTMLInputElement || editor instanceof HTMLTextAreaElement) {
    return editor.value.slice(editor.selectionStart ?? 0, editor.selectionEnd ?? 0);
  }
  return window.getSelection()?.toString() ?? '';
}

export async function performHubEditAction(action: HubEditAction, editor: HTMLElement | null) {
  if (!editor?.isConnected || !isHubTextEditor(editor)) return;
  editor.focus();

  if (action === 'selectAll') {
    if (editor instanceof HTMLInputElement || editor instanceof HTMLTextAreaElement) editor.select();
    else document.execCommand('selectAll');
    return;
  }
  if (action === 'copy' || action === 'cut') {
    const text = selectedText(editor);
    if (!text) return;
    await Clipboard.SetText(text);
    if (action === 'cut') document.execCommand('delete');
    return;
  }
  if (action === 'paste') {
    const text = await Clipboard.Text();
    if (text) document.execCommand('insertText', false, text);
    return;
  }
  document.execCommand(action);
}
