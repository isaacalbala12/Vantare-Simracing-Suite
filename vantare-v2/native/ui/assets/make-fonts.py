"""Genera las instancias estaticas de Inter que usa el modo efficiency-parity.

Fuente: Inter-Variable.woff2 conservada desde el frontend retirado (#1533),
licencia OFL. GPUI/DirectWrite necesita TTF/OTF, asi que se
instancia el eje wght (400, 500, 600, 650, 700, 800) y se recorta a Latin.
Uso: python make-fonts.py  (requiere fonttools y brotli)
"""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools import subset

ROOT = Path(__file__).resolve().parents[3]
SRC = Path(__file__).resolve().parent / "Inter-Variable.woff2"
OUT = Path(__file__).resolve().parent / "fonts"
OUT.mkdir(exist_ok=True)
UNICODES = list(range(0x20, 0x17F)) + [
    0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2026, 0x2212,
    0x2248, 0x00B0, 0x00B7, 0x2190, 0x2191, 0x2192, 0x2193, 0x25B2, 0x25BC,
]
import os
WEIGHTS = tuple(int(w) for w in os.environ.get('INTER_WEIGHTS', '400,500,600,650,700,750,800').split(','))
for weight in WEIGHTS:
    font = TTFont(SRC)
    font = instantiateVariableFont(font, {"wght": weight}, inplace=False)
    options = subset.Options()
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.notdef_outline = True
    options.glyph_names = False
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=UNICODES)
    subsetter.subset(font)
    # DirectWrite (via GPUI) solo distingue pesos en saltos de 100: cada peso se
    # registra como su propia familia "Inter W<peso>", siempre con peso 400.
    font["OS/2"].usWeightClass = 400
    name = font["name"]
    for record in list(name.names):
        if record.nameID in (1, 2, 3, 4, 6, 16, 17):
            name.removeNames(nameID=record.nameID)
    family = f"Inter W{weight}"
    for platform, enc, lang in ((3, 1, 0x409), (1, 0, 0)):
        name.setName(family, 1, platform, enc, lang)
        name.setName("Regular", 2, platform, enc, lang)
        name.setName(f"{family} Regular", 3, platform, enc, lang)
        name.setName(f"{family} Regular", 4, platform, enc, lang)
        name.setName(f"Inter-W{weight}", 6, platform, enc, lang)
    font.flavor = None  # el origen es woff2: sin esto se guardaria como woff2
    font.save(OUT / f"Inter-{weight}.ttf")
    print(weight, (OUT / f"Inter-{weight}.ttf").stat().st_size)
