# Plan: Workshop resolution source of truth

## Objective

Make the real widget/profile layout the source of truth for `WidgetVisualHost` while keeping the Workshop's width and height controls as an outer preview frame only.

## Scope

- Keep the productive renderer on `widget.layout` for Standings, Horizontal Standings, Relative, Pedals, and Racing Flags.
- Apply optional `width`/`height` query values only to the Workshop preview wrapper.
- Clear preview dimensions when changing widgets so a previous widget cannot distort the next one.
- Show the active widget's real dimensions in the controls when no preview override exists.
- Add focused regressions for intrinsic layout, preview resizing, and widget switching.

## Verification

- Run the focused authoring and renderer tests that are available in the frontend workspace.
- Run frontend typecheck, lint, build, and `git diff --check` when dependencies permit.
- Re-read the Notion task and record the delivered state without merging or promoting.
