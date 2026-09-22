# Efficiency design-system entry point

`Efficiency` is the canonical product name. `Eficiencia`, `Eficiência` and
`Efficienza` are its localized labels.

This directory exposes the consumed canonical manifest, layout helpers and
tokens. Renderers are imported directly from their existing implementation
modules; unused facade modules and the catch-all barrel were removed. The following
identifiers remain stable compatibility contracts:

- `vantare-functional` is the persisted `DesignSystemId`, the Go/profile
  contract value, the DOM `data-widget-system` value, and the existing
  Workshop `system=` URL value.
- `standings-functional-*` and the other `*-functional-*` official design IDs
  remain linkable and valid when profiles or saved designs are reopened.
- `functional-*` Workshop CSS classes and legacy module imports remain available
  as shims; they do not represent a second visual system.

At URL/profile boundaries, `efficiency`, `vantare-efficiency`, `functional`,
and `vantare-functional` normalize to the stable `vantare-functional` value.
