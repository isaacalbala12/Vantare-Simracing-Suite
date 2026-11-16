"""Reproduce view.rs::logo_24 (f32, área y alfa premultiplicado).

Pillow solo decodifica el PNG de producción. Sin dependencia PNG en el widget.
Ejecutar desde cualquier directorio; --check comprueba el recurso compilado.
"""
import math
from pathlib import Path
import struct
import sys

from PIL import Image


def f32(value):
    return struct.unpack("f", struct.pack("f", value))[0]


def logo_24():
    native = Path(__file__).resolve().parents[2]
    image = Image.open(native / "ui/assets/vantare-mark.png")
    assert image.mode == "RGBA"
    sw, sh = image.size
    source = image.tobytes()
    scale = f32(sw / 24)
    out = bytearray()
    for oy in range(24):
        for ox in range(24):
            x0, x1 = f32(ox * scale), f32((ox + 1) * scale)
            y0, y1 = f32(oy * scale), f32((oy + 1) * scale)
            channels, alpha_sum, total = [0.0] * 3, 0.0, 0.0
            for sy in range(math.floor(y0), min(math.ceil(y1), sh)):
                wy = max(f32(min(y1, sy + 1) - max(y0, sy)), 0.0)
                for sx in range(math.floor(x0), min(math.ceil(x1), sw)):
                    wx = max(f32(min(x1, sx + 1) - max(x0, sx)), 0.0)
                    weight = f32(wx * wy)
                    pixel = source[(sy * sw + sx) * 4:][:4]
                    alpha = f32(pixel[3] / 255)
                    for c in range(3):
                        channels[c] = f32(channels[c] + f32(f32(pixel[c] * alpha) * weight))
                    alpha_sum = f32(alpha_sum + f32(alpha * weight))
                    total = f32(total + weight)
            rounded = lambda x: min(255, max(0, math.floor(x + 0.5)))
            out.extend(rounded(f32(c / alpha_sum)) if alpha_sum > 0 else 0 for c in channels)
            out.append(rounded(f32(f32(alpha_sum / max(total, 2**-23)) * 255)))
    return out


if __name__ == "__main__":
    target = Path(__file__).resolve().parents[1] / "src/standings/eficiencia/logo-24.rgba"
    pixels = logo_24()
    if "--check" in sys.argv:
        assert target.read_bytes() == pixels, "Regenerar logo_24 desde el PNG de GPUI"
    else:
        target.write_bytes(pixels)
