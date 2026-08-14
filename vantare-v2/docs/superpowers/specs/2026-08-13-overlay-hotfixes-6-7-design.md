# Overlay hotfixes 6–7

**Status:** approved, implementation isolated
**Date:** 2026-08-13
**Base:** `nightly@b2e4067809d31152fdcf374875179e577d483c03`

## Scope

This cut contains only the two items explicitly retained by Isaac:

1. Investigate a global hotkey that permits direct overlay editing over the game, without implementing native runtime behavior yet.
2. Make driver-list renderers contract to the effective number of live rows, with one deliberate placeholder row when telemetry contains no drivers.

Items 1–5 from the earlier Alejandro feedback batch are excluded from this branch. Isaac also approved treating these two items as hotfixes without Linear activity.

## Driver-count behavior

`model.rows` remains the rendering authority after existing row-count and telemetry filtering. Broadcast Tower and Standings publish `data-driver-count` and `data-visible-rows`; the latter has a minimum of one so the disconnected or empty state never collapses to an unusable zero-height surface.

Vertical Original and Crystal shells use intrinsic content height with their saved widget rectangle as a maximum. Endurance already has intrinsic template height and gains the same count metadata and empty row. Crystal's horizontal Broadcast Tower uses explicit one- and two-driver widths. None of these rules mutates `layout.w`, `layout.h`, profile revisions, or Studio drag/resize geometry.

## Hotkey investigation boundary

The research recommendation is a separate transparent, frameless editor layer activated by Win32 `RegisterHotKey`. It reuses the production widget host and existing Studio commands, but keeps the production overlay click-through. Save and Cancel form a draft transaction boundary.

No Wails window, native hotkey, persistence, or input-hook code is included in this cut. Implementation requires a bounded Windows spike covering conflicts, DPI, multiple monitors, pointer cleanup, OBS visibility, and borderless/windowed LMU.

## Acceptance

- Zero drivers render exactly one placeholder row.
- One or two drivers do not retain the visual footprint of a full grid.
- More drivers continue rendering through the existing row-count limit.
- The saved Studio geometry is not rewritten when telemetry count changes.
- Original, Crystal, and Endurance regression tests expose the count contract.
- The hotkey deliverable remains documentation only.

## Tracking exception

No Linear issue or changelog fragment is created for this owner-approved hotfix exception. The branch, commit, checks, PR, and promotion state remain the Git evidence.
