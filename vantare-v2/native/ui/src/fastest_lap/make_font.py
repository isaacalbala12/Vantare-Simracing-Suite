"""Instancia Inter 750 con el generador del kit, sin modificar sus recursos."""
from pathlib import Path
import os

folder = Path(__file__).resolve().parent
generator = folder.parents[1] / "assets" / "make-fonts.py"
source = generator.read_text(encoding="utf-8")
destination = 'OUT = Path(__file__).resolve().parent / "fonts"'
if source.count(destination) != 1:
    raise RuntimeError("el generador cambió: revisar su directorio de salida")
source = source.replace(destination, f"OUT = Path({str(folder)!r})")
os.environ["INTER_WEIGHTS"] = "750"
exec(compile(source, str(generator), "exec"), {"__file__": str(generator)})
