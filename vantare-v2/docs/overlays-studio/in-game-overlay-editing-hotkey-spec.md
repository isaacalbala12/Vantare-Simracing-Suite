# In-game overlay editing by hotkey

Status: implementation specification

Date: 2026-08-13

Scope: point 6 only

## Outcome

`Ctrl+Shift+E` edits the active desktop overlay directly over the game. It
must not navigate the Hub to Overlay Studio and must not create an alternative
widget renderer.

The first supported cut is intentionally smaller than Overlay Studio:

- select one widget;
- move it;
- resize it with the existing aspect and minimum-size rules;
- save the complete V3 profile with optimistic revision checking;
- cancel with the button, `Escape`, or a second `Ctrl+Shift+E`;
- always restore the racing click-through window mode when editing ends.

## Behaviour contract

### Enter

1. If the desktop overlay is running, the hotkey changes the active V3 profile
   from `racing` to `edit`, applies that mode to the same native window and
   emits a fresh `overlay:profile-v3-loaded` snapshot.
2. If the overlay is not running, the hotkey starts the active profile and
   then enters `edit` mode.
3. A failed start or failed native mode application does not announce edit
   mode and leaves the in-memory profile in `racing` mode.
4. `RegisterHotKey` uses `MOD_NOREPEAT`, so holding the chord cannot toggle the
   mode repeatedly.

### Edit

1. Desktop uses `WidgetVisualHost` and the active runtime session layout. OBS
   remains read-only and unchanged.
2. The original loaded document and revision form the transaction baseline.
3. Drag/resize updates only a local draft. Pointer previews remain imperative;
   telemetry renders must not reset the active gesture.
4. The editor exposes a small top toolbar with dirty/saving/error state and
   Save/Cancel actions. It does not expose Studio inspectors, widget creation,
   ordering, multi-selection or appearance/content editing.

### Save

1. Save persists one complete, validated V3 document through
   `studio:profile:save`, using the baseline revision.
2. The persisted document uses `displayMode: racing`; edit mode is transient.
3. On success the runtime applies the saved profile and returns to
   click-through racing mode.
4. Conflict, validation, transport or persistence failure keeps the editor
   open with the draft intact and shows a non-destructive error.

### Cancel and cleanup

1. Cancel, `Escape`, and a second edit hotkey discard the local draft and
   return the native window to `racing`.
2. Stop, profile switch, external window close and application shutdown keep
   using the existing racing-mode cleanup path.
3. No edit state is written to disk merely by entering, moving or cancelling.

## Acceptance examples

- Given a running racing overlay, when `toggleEditMode` fires, then the same
  window becomes interactive and the desktop receives an edit-mode document.
- Given no running overlay, when `toggleEditMode` fires, then the active overlay
  starts directly in edit mode.
- Given an edited draft, when Cancel or Escape fires, then no save event is
  emitted and the original geometry is restored.
- Given an edited draft, when Save succeeds, then exactly one correlated save
  is emitted with the original revision and racing display mode.
- Given a save conflict, then the edit chrome and draft remain visible.
- Given OBS rendering the same document, then no editor chrome or pointer
  interaction is mounted.

## Manual Windows gate

Verify on Windows 10/11 with LMU in borderless/windowed mode:

- DPI 100%, 125% and 150%;
- primary and secondary monitor;
- hotkey tap and held-key behaviour;
- move and aspect-locked resize while telemetry updates;
- Save, Cancel, Escape, second-hotkey and Alt+F4 cleanup;
- click-through after every exit path;
- OBS Game/Window Capture and Display Capture behaviour documented honestly.

Exclusive fullscreen is not claimed until tested separately.
