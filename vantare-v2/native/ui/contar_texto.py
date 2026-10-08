"""Diagnóstico de ISA-1427; no modifica PNG ni enmascara el gate de paridad.

Uso: python contar_texto.py widget candidato.png referencia.png geometria.json
Pillow/numpy son los mismos del comparador existente. La tinta es una cota
conservadora por canal azul; las cajas de texto son una clasificación espacial,
no una prueba de la causa de rasterización.
"""

import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image

widget, candidate, reference, geometry = sys.argv[1:]
a = np.asarray(Image.open(candidate).convert("RGBA"), dtype=np.float32)
b = np.asarray(Image.open(reference).convert("RGBA"), dtype=np.float32)
if a.shape != b.shape:
    sys.exit("Los tamaños no coinciden")
for image in (a, b):
    image[:, :, :3] *= image[:, :, 3:4] / 255
changed = np.abs(a - b).max(axis=2) > 8
boxes = np.zeros_like(changed)
glyphs = np.zeros_like(changed)
rectangles = []
for element in json.loads(Path(geometry).read_text(encoding="utf-8"))["elements"]:
    cls = element.get("attrs", {}).get("class", "")
    if not element.get("text") and not cls.startswith("vf-footer-item"):
        continue
    r = element["rect"]
    x, y, w, h = (r[k] for k in ("x", "y", "w", "h"))
    # Los badges incluyen fondo/borde: solo se cuenta su caja interior.
    if cls == "vf-multiclass-relative-class":
        x, y, w, h = x + 4, y + 2, w - 8, h - 4
    if cls == "vf-relative-lap-delta":
        x, y, w, h = x + 3, y + 2, w - 6, h - 4
    x0, y0 = max(0, math.floor(x)), max(0, math.floor(y))
    x1, y1 = min(boxes.shape[1], math.ceil(x + w)), min(boxes.shape[0], math.ceil(y + h))
    if x1 <= x0 or y1 <= y0:
        continue
    boxes[y0:y1, x0:x1] = True
    # La tinta de estos cuatro widgets supera su fondo en azul; las franjas
    # rojas de Fastest Lap no deben contarse como texto aunque crucen su caja.
    ca, cb = a[y0:y1, x0:x1, 2], b[y0:y1, x0:x1, 2]
    bg = min(np.percentile(ca, 10), np.percentile(cb, 10))
    glyphs[y0:y1, x0:x1] |= (ca > bg + 8) | (cb > bg + 8)
    rectangles.append([x0, y0, x1 - x0, y1 - y0, element.get("text", cls)])
ink_count = int((changed & glyphs).sum())
report = {
    "widget": widget,
    "different_pixels": int(changed.sum()),
    "compared_pixels": int(changed.size),
    "different_percent": 100 * float(changed.mean()),
    "text_ink_lower_bound": ink_count,
    "text_ink_percent": 100 * ink_count / changed.size,
    "text_box_pixels": int((changed & boxes).sum()),
    "outside_text_boxes": int((changed & ~boxes).sum()),
    "rectangles": rectangles,
}
print(json.dumps(report, ensure_ascii=False, indent=2))
