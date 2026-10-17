"""Referencia independiente del binario: catálogo y variantes del fuente Rust."""
import json
from pathlib import Path
import re

NATIVE = Path(__file__).resolve().parents[1]


def source_catalog(registry=None):
    text = (registry or NATIVE / "ui/src/registry.rs").read_text(encoding="utf-8")
    blocks = re.findall(r"\bwidgets!\s*\{([^{}]*)\}", text)
    if len(blocks) != 1:
        raise RuntimeError("no se reconoce el registro widgets! del fuente")
    names = []
    for entry in blocks[0].split(","):
        if not entry.strip():
            continue
        match = re.fullmatch(r'\s*\w+\s*=>\s*\w+\s*:\s*"([a-z-]+)"\s*', entry)
        if not match:
            raise RuntimeError("entrada no reconocida en widgets!")
        names.append(match[1])
    if not names or len(names) != len(set(names)):
        raise RuntimeError("catálogo fuente vacío o duplicado")
    return names


def live_configurations(demand=None):
    text = (demand or NATIVE / "ui/src/demand.rs").read_text(encoding="utf-8")
    match = re.search(r"const LIVE_EXTRA_SETTINGS: &\[&str\] = &\[(.*?)\];", text, re.DOTALL)
    if not match:
        raise RuntimeError("faltan variantes live del inspector en el fuente")
    body = match[1]
    raw = re.findall(r'r#"(.*?)"#', body, re.DOTALL)
    if re.sub(r'r#".*?"#|\s|,', "", body, flags=re.DOTALL):
        raise RuntimeError("variantes live no reconocidas")
    names = source_catalog()
    extras = [json.loads(value)["kind"] for value in raw]
    if any(name not in names for name in extras):
        raise RuntimeError("variante live fuera del catálogo fuente")
    return names + extras
