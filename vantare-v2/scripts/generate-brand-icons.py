"""Regenera los activos aprobados en #1504; solo stdlib y Pillow.

python scripts/generate-brand-icons.py --sheet C:/tmp/ui-r10/iconos-1504.png
python scripts/generate-brand-icons.py --check
"""
import argparse
import io
from pathlib import Path
import re
import struct
import xml.etree.ElementTree as ET

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / "build/brand"
SIZES = (16, 24, 32, 48, 64, 128, 256)
NS = "{http://www.w3.org/2000/svg}"


def polygon(source):
    """Lee solo el polígono M/L/H/Z de estos SVG, sin renderer alternativo."""
    svg = ET.parse(SOURCES / source).getroot()
    path = svg.find(f"{NS}path")
    tokens = re.findall(r"[MLHZ]|-?\d+(?:\.\d+)?", path.attrib["d"])
    points = []
    i = 0
    command = "M"
    while i < len(tokens):
        if tokens[i] in ("M", "L", "H", "Z"):
            command = tokens[i]
            i += 1
            if command == "Z":
                break
        if command == "H":
            points.append((float(tokens[i]), points[-1][1]))
            i += 1
        else:
            points.append((float(tokens[i]), float(tokens[i + 1])))
            i += 2
    return points, path.attrib["fill"]


def symbol(size, variant="color", small=None):
    small = size in (16, 24) if small is None else small
    points, fill = polygon(f"icon-{variant}{'-small' if small else ''}.svg")
    scale = size * 8 / 64
    mask = Image.new("L", (size * 8, size * 8))
    # PIL coloca el centro del píxel en un entero; SVG lo coloca en n + 0,5.
    ImageDraw.Draw(mask).polygon([(x * scale - .5, y * scale - .5) for x, y in points], fill=255)
    # Reducir solo el alfa: evita que el filtro altere el rojo oficial en
    # bordes casi opacos por la conversión RGBA premultiplicada de Pillow.
    result = Image.new("RGBA", (size, size), fill)
    result.putalpha(mask.resize((size, size), Image.Resampling.LANCZOS))
    return result


def unplated(size, variant="color"):
    result = symbol(size, variant)
    if variant == "color" and size >= 48:
        # Degradado del logo aprobado, sin la placa oscura en altform-unplated.
        for y in range(size):
            t = max(0, min(1, (y * 64 / size - 10) / 41))
            start, end = ((248, 81, 81), (216, 0, 0)) if t < .5 else ((216, 0, 0), (179, 0, 0))
            t = t * 2 if t < .5 else (t - .5) * 2
            color = tuple(round(a + (b - a) * t) for a, b in zip(start, end))
            for x in range(size):
                result.putpixel((x, y), (*color, result.getpixel((x, y))[3]))
    return result


def png(image):
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def generated():
    with Image.open(ROOT / "build/appicon.png") as original:
        gradient = original.convert("RGBA")
    icons = {size: symbol(size) if size <= 32 else gradient.resize((size, size), Image.Resampling.LANCZOS) for size in SIZES}
    # Escribir cada frame explícitamente: Pillow.save(ICO) puede derivar los
    # pequeños del frame mayor y perder las variantes ópticas de 16/24 px.
    frames = [png(icons[size]) for size in SIZES]
    offset = 6 + 16 * len(frames)
    entries = []
    for size, frame in zip(SIZES, frames):
        entries.append(struct.pack("<BBBBHHII", size % 256, size % 256, 0, 0, 1, 32, len(frame), offset))
        offset += len(frame)
    assets = {"build/windows/icon.ico": struct.pack("<HHH", 0, 1, len(frames)) + b"".join(entries + frames)}
    msix = {}
    for name, size in (("StoreLogo", 50), ("Square44x44Logo", 44), ("Square150x150Logo", 150)):
        # 44 px es tamaño de manifiesto, no la variante targetsize-48.
        msix[f"{name}.png"] = symbol(size) if size < 48 else gradient.resize((size, size), Image.Resampling.LANCZOS)
    for size in (16, 24, 32, 48, 256):
        msix[f"Square44x44Logo.targetsize-{size}.png"] = icons[size]
        msix[f"Square44x44Logo.targetsize-{size}_altform-unplated.png"] = unplated(size)
        # Variante a una tinta negra, para el fondo claro de Windows.
        msix[f"Square44x44Logo.targetsize-{size}_altform-lightunplated.png"] = unplated(size, "black")
    for name, raster in msix.items():
        assets[f"native/packaging/msix/Assets/{name}"] = png(raster)
    manifest = ET.parse(ROOT / "native/packaging/msix/AppxManifest.xml")
    declared = set()
    for element in manifest.iter():
        if element.tag.endswith("}Logo"):
            declared.add(element.text.replace("\\", "/"))
        for name in ("Square44x44Logo", "Square150x150Logo", "Wide310x150Logo", "Square310x310Logo", "Square71x71Logo"):
            if name in element.attrib:
                declared.add(element.attrib[name].replace("\\", "/"))
    assert declared <= {f"Assets/{name}" for name in msix}, f"Activos faltantes: {declared}"
    assets["native/hub/assets/pit/mark.svg"] = (SOURCES / "icon-color.svg").read_bytes()
    return assets, icons, msix


def sheet(destination, icons, msix):
    width = 1380
    result = Image.new("RGB", (width, 1840), "white")
    draw = ImageDraw.Draw(result)
    draw.text((20, 12), "#1504 - ICO y MSIX a tamano real; blanco/negro y avatar. Sin wordmark.", fill="black")
    y = 42
    for background in ("#F3F3F3", "#202020"):
        text_color = "black" if background == "#F3F3F3" else "white"
        draw.rectangle((0, y, width, y + 690), fill=background)
        draw.text((20, y + 8), f"Barra {background} - ICO: 16 / 24 / 32 / 48 / 64 / 128 / 256", fill=text_color)
        x = 20
        for size, raster in icons.items():
            result.paste(raster, (x, y + 35), raster)
            draw.text((x, y + 300), str(size), fill=text_color)
            x += size + 40
        for row, (label, suffix) in enumerate((("MSIX targetsize", ""), ("MSIX unplated", "_altform-unplated"), ("MSIX lightunplated", "_altform-lightunplated"))):
            x = 20 + row * 455
            draw.text((x, y + 330), label, fill=text_color)
            for size in (16, 24, 32, 48):
                raster = msix[f"Square44x44Logo.targetsize-{size}{suffix}.png"]
                result.paste(raster, (x, y + 355), raster)
                x += size + 20
            raster = msix[f"Square44x44Logo.targetsize-256{suffix}.png"]
            result.paste(raster, (20 + row * 455, y + 420), raster)
        y += 705
    draw.text((20, y + 8), "MSIX declarados: StoreLogo 50, Square44 44, Square150 150; una tinta 16/24/32/64; avatar 64", fill="black")
    x = 20
    for name in ("StoreLogo.png", "Square44x44Logo.png", "Square150x150Logo.png"):
        raster = msix[name]
        result.paste(raster, (x, y + 40), raster)
        draw.text((x, y + 200), name, fill="black")
        x += 250
    for row, variant in enumerate(("white", "black")):
        x = 780
        draw.rectangle((x - 10, y + 40 + row * 100, width, y + 130 + row * 100), fill="#202020" if variant == "white" else "#F3F3F3")
        for size in (16, 24, 32, 64):
            raster = symbol(size, variant)
            result.paste(raster, (x, y + 50 + row * 100), raster)
            x += size + 30
    avatar = Image.new("RGBA", (64 * 8, 64 * 8))
    ImageDraw.Draw(avatar).ellipse((0, 0, 64 * 8 - 1, 64 * 8 - 1), fill="#111214")
    mark = symbol(288, small=False)
    avatar.alpha_composite(mark, (91, 82))
    avatar = avatar.resize((64, 64), Image.Resampling.LANCZOS)
    result.paste(avatar, (20, y + 260), avatar)
    draw.text((100, y + 280), "Avatar circular (misma geometria del SVG)", fill="black")
    result.save(destination)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Compara sin escribir los activos versionados")
    parser.add_argument("--sheet", type=Path, help="Hoja PNG fuera del repo")
    args = parser.parse_args()
    assets, icons, msix = generated()
    for relative, content in assets.items():
        path = ROOT / relative
        if args.check:
            if not path.exists() or path.read_bytes() != content:
                raise SystemExit(f"Desactualizado: {relative}")
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
    if args.sheet:
        sheet(args.sheet, icons, msix)
    print(f"{'Verificados' if args.check else 'Generados'}: {len(assets)} activos (ICO 7 frames; MSIX 18 PNG; Hub SVG)")


if __name__ == "__main__":
    main()
