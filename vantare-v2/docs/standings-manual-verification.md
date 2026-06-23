# Standings Manual Verification

Manual checklist for the first configurable Standings cut.

## Preconditions

- App built or running in dev mode with latest frontend changes.
- Open the app and go to `Overlays Studio`.
- Enter `Widgets` from the Overlays Studio home screen.
- Active profile contains a `standings` widget in the widget list. If it does not, switch to a profile that includes Standings before continuing.
- Do not use `LayoutStudio` for these checks except where explicitly stated.

## WidgetStudio Checks

- [ ] Select `standings` in the widget list.
- [ ] Confirm there are no X/Y/W/H controls, drag handles, resize handles, duplicate, delete, or overlay live controls in WidgetStudio.
- [ ] Confirm `COLUMNAS STANDINGS` is visible.
- [ ] Toggle optional columns: class, current lap, interval, best lap, last lap.
- [ ] Confirm enabled columns appear in the preview and disabled columns disappear.
- [ ] Confirm base columns remain available and are not removable by this UI: position, driver number, driver name, gap.
- [ ] Change driver name format to truncate and set max characters.
- [ ] Confirm out-of-range max characters are clamped to the supported range.
- [ ] Change best lap/last lap display, decimals, width, color, and alignment.
- [ ] Confirm out-of-range width is clamped to the supported range.

## Mock Session Scenario Checks

- [ ] Confirm mock session selector is visible in WidgetStudio preview controls.
- [ ] Confirm default scenario is `Carrera`.
- [ ] Select `Práctica` and confirm the preview communicates practice-style standings data (gap shows lap times).
- [ ] Select `Qualy` and confirm the preview communicates qualifying-style standings data.
- [ ] Select `Carrera` and confirm the preview communicates race-style standings data (gap shows Leader/+x.xxx/FASTEST).
- [ ] Confirm scenario selection does not enable the Save button by itself and is not saved as a widget setting.

## Explicit Save Checks

- [ ] Change one Standings setting.
- [ ] Wait at least 1 second.
- [ ] Confirm it does not autosave unexpectedly.
- [ ] Confirm the Save button is enabled.
- [ ] Click Save.
- [ ] Confirm the saved state remains after leaving and returning to WidgetStudio.
- [ ] Reopen the app if needed and confirm saved Standings settings persist.

## Renderer Checks

- [ ] Confirm Standings preview has no clipping.
- [ ] Confirm optional lap columns align by row.
- [ ] Confirm no unexpected right-side blank space appears in the Standings preview.
- [ ] Confirm Standings still renders in desktop overlay after saving.
- [ ] Confirm Standings still renders in OBS overlay path if available.

## Regression Checks

- [ ] Select `relative` and confirm Relative columns/filters still work.
- [ ] Go to `LayoutStudio` and confirm position/size controls are present there.
- [ ] Confirm `LayoutStudio` does not show Standings/Relative internal column controls.
- [ ] Confirm `LayoutStudio` drag/resize behavior is not affected by WidgetStudio changes.

## Result

- Status:
- Tester:
- Notes:
