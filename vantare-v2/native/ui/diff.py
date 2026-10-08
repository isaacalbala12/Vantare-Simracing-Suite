#!/usr/bin/env python3
"""Compara un PNG candidato con la referencia congelada (ISA-1410).

Usa solo Pillow y numpy (ya instalados en el entorno de desarrollo; no se
instala nada). Compara en RGBA premultiplicado: dos píxeles totalmente
transparentes son iguales aunque su RGB difiera.

Salida: porcentaje de píxeles distintos, cajas envolventes de las zonas
distintas y un PNG de diferencias (rojo = distinto, gris tenue = igual).
Código de salida: 0 si el porcentaje <= --max-percent, 1 si lo supera,
2 si los tamaños no coinciden o falta una imagen.

Ejemplo:
  python tools/native-ui/parity/diff.py candidato.png \
      tools/native-ui/parity/reference/standings-44.png \
      --threshold 8 --mask 110,6,60,30 --out diff.png --json
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image


def load_premultiplied(path: Path) -> np.ndarray:
    image = Image.open(path).convert("RGBA")
    data = np.asarray(image, dtype=np.float32)
    alpha = data[..., 3:4] / 255.0
    data[..., :3] *= alpha
    return data


def parse_mask(text: str) -> tuple[int, int, int, int]:
    parts = [int(part) for part in text.split(",")]
    if len(parts) != 4 or parts[2] <= 0 or parts[3] <= 0:
        raise argparse.ArgumentTypeError("mask must be x,y,w,h with positive w and h")
    return parts[0], parts[1], parts[2], parts[3]


def dilate(mask: np.ndarray, radius: int) -> np.ndarray:
    if radius <= 0:
        return mask
    padded = np.pad(mask, radius)
    out = np.zeros_like(mask)
    height, width = mask.shape
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            out |= padded[radius + dy : radius + dy + height, radius + dx : radius + dx + width]
    return out


def boxes(mask: np.ndarray, merge: int, min_area: int) -> list[dict[str, int]]:
    grown = dilate(mask, merge)
    height, width = grown.shape
    seen = np.zeros_like(grown)
    result = []
    for y0, x0 in zip(*np.nonzero(grown)):
        if seen[y0, x0]:
            continue
        queue = deque([(y0, x0)])
        seen[y0, x0] = True
        x_min = x_max = int(x0)
        y_min = y_max = int(y0)
        while queue:
            y, x = queue.popleft()
            x_min, x_max, y_min, y_max = min(x_min, x), max(x_max, x), min(y_min, y), max(y_max, y)
            for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= ny < height and 0 <= nx < width and grown[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    queue.append((ny, nx))
        # Cuenta solo píxeles realmente distintos dentro de la caja.
        inside = mask[y_min : y_max + 1, x_min : x_max + 1]
        differing = int(inside.sum())
        if differing >= min_area:
            result.append({"x": x_min, "y": y_min, "w": x_max - x_min + 1, "h": y_max - y_min + 1, "pixels": differing})
    return sorted(result, key=lambda box: -box["pixels"])


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("candidate", type=Path)
    parser.add_argument("reference", type=Path)
    parser.add_argument("--threshold", type=int, default=8, help="diferencia máxima por canal (0-255, RGBA premultiplicado) para contar un píxel como igual; por defecto 8")
    parser.add_argument("--mask", type=parse_mask, action="append", default=[], metavar="X,Y,W,H", help="zona a ignorar (repetible), p. ej. el reloj de sesión")
    parser.add_argument("--merge", type=int, default=4, help="radio en px para fundir píxeles cercanos en una misma zona; por defecto 4")
    parser.add_argument("--min-area", type=int, default=1, help="píxeles distintos mínimos para informar una zona; por defecto 1")
    parser.add_argument("--max-percent", type=float, default=100.0, help="con más de este %% de píxeles distintos el código de salida es 1")
    parser.add_argument("--out", type=Path, help="PNG de diferencias")
    parser.add_argument("--json", action="store_true", help="emitir el resultado como JSON")
    args = parser.parse_args()

    for path in (args.candidate, args.reference):
        if not path.is_file():
            print(f"missing image: {path}", file=sys.stderr)
            return 2
    candidate = load_premultiplied(args.candidate)
    reference = load_premultiplied(args.reference)
    if candidate.shape != reference.shape:
        message = {"error": "size mismatch", "candidate": [candidate.shape[1], candidate.shape[0]], "reference": [reference.shape[1], reference.shape[0]]}
        print(json.dumps(message) if args.json else f"size mismatch: candidate {message['candidate']} vs reference {message['reference']}", file=sys.stderr)
        return 2

    delta = np.abs(candidate - reference).max(axis=2)
    different = delta > args.threshold
    height, width = different.shape
    counted = np.ones_like(different)
    for x, y, w, h in args.mask:
        different[max(0, y) : max(0, y + h), max(0, x) : max(0, x + w)] = False
        counted[max(0, y) : max(0, y + h), max(0, x) : max(0, x + w)] = False
    total = int(counted.sum())
    changed = int(different.sum())
    percent = 100.0 * changed / total if total else 0.0
    found = boxes(different, args.merge, args.min_area)

    if args.out:
        base = np.asarray(Image.open(args.reference).convert("RGBA"), dtype=np.float32)
        gray = base[..., :3].mean(axis=2, keepdims=True) * 0.35 + 40
        canvas = np.concatenate([np.repeat(gray, 3, axis=2), np.full((height, width, 1), 255.0)], axis=2)
        canvas[different] = (255, 0, 64, 255)
        for x, y, w, h in args.mask:
            canvas[max(0, y) : y + h, max(0, x) : x + w, :3] *= 0.5
        Image.fromarray(canvas.astype(np.uint8), "RGBA").save(args.out)

    report = {
        "width": width, "height": height, "threshold": args.threshold,
        "compared_pixels": total, "different_pixels": changed, "different_percent": round(percent, 4),
        "max_channel_delta": int(delta.max()) if delta.size else 0, "boxes": found,
        "masks": [list(mask) for mask in args.mask], "diff_png": str(args.out) if args.out else None,
    }
    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print(f"{changed}/{total} px distintos ({percent:.4f} %), umbral por canal {args.threshold}, delta máx {report['max_channel_delta']}")
        for box in found[:20]:
            print(f"  zona x={box['x']} y={box['y']} w={box['w']} h={box['h']} ({box['pixels']} px)")
        if len(found) > 20:
            print(f"  ... y {len(found) - 20} zonas más")
    return 0 if percent <= args.max_percent else 1


if __name__ == "__main__":
    sys.exit(main())
