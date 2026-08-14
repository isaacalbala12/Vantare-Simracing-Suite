# Research: editing the live overlay with a global hotkey

**Status:** superseded by implementation specification
**Date:** 2026-08-13

The executable decision is now
`docs/overlays-studio/in-game-overlay-editing-hotkey-spec.md`. A deeper audit
after this initial research found that the current V3 desktop window already
supports native `ModeEdit`, click-through switching, fullscreen geometry and a
global edit hotkey. That evidence makes same-window editing the smaller viable
implementation. The separate editor layer below is retained as a fallback if
Windows/LMU smoke tests expose focus or capture failures.

## Recommendation

The initial recommendation was a registered Win32 hotkey opening a temporary,
transparent editor layer aligned with the active game display.

This recommendation no longer supersedes the in-place direction. It remains a
contingency only.

## Proposed flow

1. The Windows application registers a configurable chord with `RegisterHotKey` and reports conflicts instead of silently replacing another binding.
2. When the chord fires with LMU focused, the backend snapshots the active profile, monitor bounds, DPI and runtime widget geometry.
3. A frameless, always-on-top editor layer opens over that monitor. It renders the shared widget host plus editor-only frames and handles; the production overlay remains click-through beneath it.
4. Save emits one profile revision and asks the runtime to apply it. Cancel discards the draft. Either path closes the editor layer and unregisters its temporary input handling.
5. Escape and process/window teardown provide the same cleanup path so a crash cannot leave an input-blocking surface behind.

## Why a separate layer

- It isolates risky input behavior from the render-only overlay contract.
- It avoids reloading or changing the composition used by OBS/Desktop.
- It gives Save/Cancel a clear transaction boundary.
- It permits editor chrome without leaking handles or selection state into capture output.
- It can initially support borderless/windowed LMU without claiming exclusive-fullscreen compatibility.

## Bounded spike

Implement the spike behind a development flag and stop before profile persistence. It succeeds only if all of these pass:

- The hotkey fires while LMU is focused, does not auto-repeat, and exposes registration conflicts.
- The editor aligns at 100%, 125% and 150% Windows scaling on primary and secondary monitors.
- Pointer input never reaches LMU while dragging, and full click-through returns after Save, Cancel, Escape and forced window closure.
- Moving and resizing use the existing Studio commands and `WidgetVisualHost`; no duplicate renderer is introduced.
- Opening and closing the layer does not reload the production overlay or appear in OBS capture.
- Borderless and windowed modes are verified. Exclusive fullscreen remains explicitly unsupported until separately proven.

## Native and framework surfaces to validate

- Win32 `RegisterHotKey` / `UnregisterHotKey` lifecycle and `MOD_NOREPEAT`.
- Monitor bounds from Win32/DWM rather than inferred CSS pixels.
- Per-monitor DPI awareness before window creation and correct physical/logical coordinate conversion.
- Wails v3 transparent, frameless and always-on-top window behavior on the exact WebView2 runtime shipped by Vantare.
- Recovery if the game changes monitor, resolution or focus while editing.

## Main risks

- Global chord collisions with LMU, Steam, GPU tools or streaming software.
- DPI drift between the native window and CSS scene.
- Exclusive fullscreen placing the game above the editor layer.
- An abnormal exit leaving a topmost input surface active.
- Capturing editor chrome in display capture even if game/window capture excludes it.

## Decision gate

Do not build the complete feature until the spike demonstrates alignment and cleanup on the supported Windows/DPI matrix. If it fails, the safe fallback is a hotkey that opens Overlay Studio on the correct profile and monitor, without direct manipulation over the game.

## Primary references

- Microsoft, `RegisterHotKey`: <https://learn.microsoft.com/windows/win32/api/winuser/nf-winuser-registerhotkey>
- Microsoft, high-DPI desktop applications: <https://learn.microsoft.com/windows/win32/hidpi/high-dpi-desktop-application-development-on-windows>
- Microsoft, `GetWindowRect`: <https://learn.microsoft.com/windows/win32/api/winuser/nf-winuser-getwindowrect>
- Wails v3 webview window options: <https://github.com/wailsapp/wails/blob/master/v3/pkg/application/webview_window_options.go>
- Wails transparency/click-through limitation discussion: <https://github.com/wailsapp/wails/issues/5812>
