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
        # Same origin and original pixels: no resize, including unequal boxes.
        extent = (max(left.width, right.width), max(left.height, right.height))
        first, second = (Image.new("RGBA", extent) for _ in range(2))
        first.alpha_composite(left)
        second.alpha_composite(right)
        with Path(output).with_suffix(".overlay.png").open("xb") as stream:
            Image.blend(first, second, 0.5).save(stream, format="PNG")
        alpha_boxes = (left.getchannel("A").getbbox(), right.getchannel("A").getbbox())
    with Path(review).open("x", encoding="utf-8") as stream:
        stream.write("PENDIENTE: contenido, nombres/cifras, elipsis, baseline, tracking, sombra y recorte al 100 %.\n")
        stream.write("Imágenes originales conservadas, sin reescalar. El porcentaje global no aprueba el texto.\n")
        stream.write(f"Superposición 50 %: {Path(output).with_suffix('.overlay.png').name}. Cajas alfa GPUI/Rune: {alpha_boxes}.\n")
        if None in alpha_boxes:
            stream.write("ATENCIÓN: salida transparente; comprobar ocultación esperada en esta escena. Un diff cero no acredita contenido.\n")


if __name__ == "__main__":
    pair(*sys.argv[1:])
