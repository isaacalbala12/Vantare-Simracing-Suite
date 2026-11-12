"""Generate inline React SVGs from the versioned Studio Foco drawings (stdlib only)."""

import hashlib
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "src/renderer/assets/widgets/illustrations"
OUTPUT = ROOT / "src/renderer/ui/widgets/illustrations"
CONTRACT = (ROOT / "src/contract/generated/studio.ts").read_text(encoding="utf-8")
TOKENS = set(json.loads((ROOT / "design/tokens.json").read_text(encoding="utf-8"))["semantic"])


# Fixed legacy artwork colors, registered for every Hub palette and theme.
ART_COLORS = {'#0f0f10': 'ill-classic-panel', '#1d4fd8': 'ill-classic-broadcast-header', '#e5e5e5': 'ill-classic-ink', '#fff': 'ill-white', '#ffffff06': 'ill-classic-row-muted', '#ffffff14': 'ill-classic-row', '#ffffff26': 'ill-classic-edge', '#9a9a9a': 'ill-classic-ink-secondary', '#ffffff12': 'ill-classic-row-soft', '#4ade80': 'ill-classic-good', '#8a8a8a': 'ill-classic-axis', '#9c9c9c': 'ill-classic-tick', '#d6d6d6': 'ill-classic-value', '#ffffff30': 'ill-classic-mark', '#7d7d7d': 'ill-classic-ink-muted', '#b3121b': 'ill-classic-player', '#d0d0d0': 'ill-classic-label', '#2e2e30': 'ill-classic-placeholder', '#a8a8a8': 'ill-classic-text', '#c9c9c9': 'ill-classic-line'}

def constant(name):
    match = re.search(rf"export const {name} = (.*?) as const;", CONTRACT, re.S)
    if not match:
        raise ValueError(f"Missing generated constant: {name}")
    return json.loads(match[1])


def camel(name):
    return re.sub(r"-([a-z])", lambda match: match[1].upper(), name)


def component_name(name):
    return "".join(part.title() for part in name.split("-")) + "Illustration"


def element(node, root=False):
    tag = node.tag.split("}")[-1]
    if tag not in {"svg", "path", "rect", "circle"}:
        raise ValueError(f"Unexpected SVG element: {tag}")
    attributes = ['aria-hidden="true"', "{...props}"] if root else []
    for name, value in node.attrib.items():
        if root and name in {"role", "aria-label"}:
            continue  # The consuming view owns the translated accessible name.
        if name == "style":
            styles = {}
            for declaration in value.split(";"):
                if not declaration.strip():
                    continue
                key, item = declaration.split(":", 1)
                item = re.sub(r"var\((--[a-z0-9-]+),[^)]+\)", r"var(\1)", item)
                if item in ART_COLORS:
                    item = "var(--" + ART_COLORS[item] + ")"
                if "#" in item:
                    raise ValueError(f"Unregistered artwork color: {item}")
                for role in re.findall(r"var\(--([a-z0-9-]+)\)", item):
                    if role not in TOKENS:
                        raise ValueError(f"Unregistered illustration token: {role}")
                if key not in {"fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "opacity"} or "url(" in item:
                    raise ValueError(f"Unexpected SVG style: {declaration}")
                styles[camel(key)] = item
            attributes.append("style={" + json.dumps(styles) + "}")
        else:
            if name not in {"viewBox", "d", "x", "y", "cx", "cy", "r", "rx", "width", "height"}:
                raise ValueError(f"Unexpected SVG attribute: {name}")
            attributes.append(camel(name) + "={" + json.dumps(value) + "}")
    opening = "<" + tag + " " + " ".join(attributes)
    if len(node) == 0:
        return opening + " />"
    return opening + ">" + "".join(element(child) for child in node) + "</" + tag + ">"


kinds = sorted(constant("studioKinds"))
options = constant("studioWidgetOptions")
choices = sorted(
    ["delta-" + item for item in options["delta"]["sizes"]]
    + ["fuel-" + item for item in options["tableSizes"]]
    + ["table-" + item for item in options["tableSizes"]]
    + ["look-" + item for item in options["looks"]]
    + ["design-" + item for item in options["standings"]["templates"] + options["delta"]["templates"]]
)
if {p.stem for p in SOURCE.glob("*.svg")} != set(kinds):
    raise ValueError("Widget drawings must match the generated WidgetKind set")
if {p.stem for p in (SOURCE / "opciones").glob("*.svg")} != set(choices):
    raise ValueError("Choice drawings must match the generated native options")

OUTPUT.mkdir(parents=True, exist_ok=True)
(OUTPUT / "options").mkdir(exist_ok=True)
imports = []
sizes = {}
for folder, names in [("", kinds), ("options", choices)]:
    for name in names:
        path = SOURCE / ("opciones" if folder else "") / (name + ".svg")
        data = path.read_bytes()
        svg = ET.fromstring(data)
        x, y, width, height = map(float, svg.attrib["viewBox"].split())
        if x != 0 or y != 0 or width <= 0 or height <= 0:
            raise ValueError(f"Unsupported viewBox: {path}")
        symbol = component_name(name)
        relative = path.relative_to(ROOT).as_posix()
        code = f'// Generated from {relative}; SHA-256 {hashlib.sha256(data).hexdigest()}.\n'
        code += f'import type {{ IllustrationProps }} from "{"../" if folder else "./"}types";\n'
        code += f"export function {symbol}(props: IllustrationProps) {{ return ({element(svg, True)}); }}\n"
        (OUTPUT / folder / (name + ".tsx")).write_text(code, encoding="utf-8")
        imports.append(f'import {{ {symbol} }} from "./{folder + "/" if folder else ""}{name}";')
        if not folder:
            sizes[name] = {"width": width, "height": height}

(OUTPUT / "types.ts").write_text(
    'import type { SVGProps } from "react";\n'
    'export type IllustrationProps = Omit<SVGProps<SVGSVGElement>, "viewBox" | "children">;\n', encoding="utf-8"
)
index = '// Generated by scripts/widget-illustrations.py.\n'
index += 'import type { ComponentType } from "react";\n'
index += 'import type { WidgetKind, DeltaSize, TableSize, WidgetLook, StandingsTemplate, DeltaTemplate } from "../../../../contract/generated/studio";\n'
index += 'import type { IllustrationProps } from "./types";\n'
index += "\n".join(imports) + "\n"
index += 'type Illustration = ComponentType<IllustrationProps>;\n'
index += 'export type ChoiceIllustrationKind = `delta-${DeltaSize}` | `fuel-${TableSize}` | `table-${TableSize}` | `look-${WidgetLook}` | `design-${StandingsTemplate | DeltaTemplate}`;\n'
for title, keys, key_type in [("widgetIllustrations", kinds, "WidgetKind"), ("choiceIllustrations", choices, "ChoiceIllustrationKind")]:
    index += f"export const {title}: Record<{key_type}, Illustration> = {{\n"
    index += ",\n".join(json.dumps(name) + ": " + component_name(name) for name in keys) + "\n};\n"
index += "export const illustrationSizes: Record<WidgetKind, {width:number;height:number}> = " + json.dumps(sizes) + ";\n"
(OUTPUT / "index.ts").write_text(index, encoding="utf-8")
print(f"Generated {len(kinds)} widget illustrations and {len(choices)} choice illustrations")
