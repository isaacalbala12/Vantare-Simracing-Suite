"""Convert the approved self-contained HTML fonts with the already-installed fonttools.

This is asset preparation only; builds and installed software do not run Python.
The source hash must match Isaac's approved #1591 R3 design.
"""
import base64
import hashlib
import io
import re
import sys
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

source = Path(sys.argv[1]).read_bytes()
assert hashlib.sha256(source).hexdigest() == "ca1e9bd31ba76fda1031e1b93ba6a090ef889b911cf20d58f30e0181867ad841"
output = Path(__file__).parent / "fonts"
output.mkdir(exist_ok=True)
for family, data in re.findall(r"@font-face\{font-family:([^;]+);src:url\(data:font/woff2;base64,([^)]*)\)", source.decode("utf-8")):
    family = family.strip('" ')
    font = TTFont(io.BytesIO(base64.b64decode(data)))
    if family == "Inter":
        for weight in (400, 500, 600, 700):
            face = instantiateVariableFont(font, {"wght": weight}, inplace=False)
            face["OS/2"].usWeightClass = 400
            names = face["name"]
            for identifier in (1, 2, 3, 4, 6, 16, 17):
                names.removeNames(nameID=identifier)
            private = f"Installer Inter W{weight}"
            for platform, encoding, language in ((3, 1, 0x409), (1, 0, 0)):
                for identifier, value in ((1, private), (2, "Regular"), (3, private), (4, private), (6, f"InstallerInterW{weight}")):
                    names.setName(value, identifier, platform, encoding, language)
            face.flavor = None
            face.save(output / f"Inter-{weight}.ttf")
    else:
        font.flavor = None
        font.save(output / f"{family.replace(' ', '')}.ttf")
print("Fonts extracted from approved HTML; runtime/build dependencies unchanged.")
