"""Pareja al tamaño original; no redimensiona ni decide la revisión de texto."""
import sys
from pathlib import Path
from PIL import Image, ImageDraw


def pair(gpui, rune, output, review):
    with Image.open(gpui) as left, Image.open(rune) as right:
        left, right = left.convert("RGBA"), right.convert("RGBA")
        canvas = Image.new("RGBA", (left.width + right.width + 8, max(left.height, right.height) + 24), (28, 28, 28, 255))
        canvas.alpha_composite(left, (0, 24))
        canvas.alpha_composite(right, (left.width + 8, 24))
        draw = ImageDraw.Draw(canvas)
        draw.text((2, 2), "GPUI", fill="white")
        draw.text((left.width + 10, 2), "Rune", fill="white")
        with Path(output).open("xb") as stream:
            canvas.save(stream, format="PNG")
    with Path(review).open("x", encoding="utf-8") as stream:
        stream.write("PENDIENTE: contenido, nombres/cifras, elipsis, baseline, tracking, sombra y recorte al 100 %.\n")
        stream.write("Imágenes originales conservadas, sin reescalar. El porcentaje global no aprueba el texto.\n")


if __name__ == "__main__":
    pair(*sys.argv[1:])
