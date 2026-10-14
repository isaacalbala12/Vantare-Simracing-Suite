"""Comprueba los artefactos congelados sin arrancar ningún renderer."""
import json
import sys
from pathlib import Path

from PIL import Image

root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[2] / "native/ui/reference"
manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
assert manifest["dpr"] == 1 and manifest["dpi"] == 100
assert len(manifest["widgets"]) == 22
assert len({item["type"] for item in manifest["widgets"]}) == 22
captured = 0
for item in manifest["widgets"]:
    if item.get("blocked"):
        assert item["type"] in {"delta-advanced", "pedals-telemetry-compact"}, item
        continue
    name = item["type"]
    with Image.open(root / f"{name}.png") as image:
        assert image.mode == "RGBA", name
        assert image.size == (item["width"], item["height"]), name
        low, high = image.getchannel("A").getextrema()
        assert low < 255 and high > 0, (name, "sin transparencia o vacío")
    geometry = json.loads((root / f"{name}.geometry.json").read_text(encoding="utf-8"))
    assert geometry["viewport"] == {"w": item["width"], "h": item["height"], "dpr": 1}, name
    assert not geometry["diagnostics"], name
    renderer = next(el for el in geometry["elements"] if el["attrs"].get("data-widget-renderer") == name)
    rect = renderer["rect"]
    assert rect["x"] >= 0 and rect["y"] >= 0, (name, "origen recortado")
    assert rect["x"] + rect["w"] <= item["width"] + 0.01, (name, "ancho recortado")
    assert rect["y"] + rect["h"] <= item["height"] + 0.01, (name, "alto recortado")
    assert all(animation["state"] in {"finished", "paused"} for animation in geometry["animations"]), name
    assert item["determinism"]["different_pixels"] == 0 and item["determinism"]["threshold"] == 0, name
    assert item["geometryEqual"], name
    captured += 1
assert captured == 20, captured
print(f"OK: {captured} PNG RGBA + geometrías; 22 tipos auditados; 2 sin renderer Eficiencia")
