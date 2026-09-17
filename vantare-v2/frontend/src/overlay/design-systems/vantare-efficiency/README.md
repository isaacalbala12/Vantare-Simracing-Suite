# Efficiency design-system entry point

`Efficiency` is the canonical product name. `Eficiencia`, `Eficiência` and
`Efficienza` are its localized labels.

The implementation is exposed from this directory under canonical names, but
it deliberately reuses the existing renderer and token modules. The following
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
