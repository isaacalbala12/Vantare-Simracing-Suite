"""Checks de los archivos entregados: python scripts/test-brand-icons.py."""
import io
from pathlib import Path
import struct
import unittest
import xml.etree.ElementTree as ET

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "native/packaging/msix/Assets"


class BrandIcons(unittest.TestCase):
    def test_ico_seven_independent_frames(self):
        data = (ROOT / "native/assets/icon.ico").read_bytes()
        self.assertEqual(struct.unpack_from("<HHH", data), (0, 1, 7))
        sizes = []
        for index in range(7):
            w, h, _, _, planes, bits, length, offset = struct.unpack_from("<BBBBHHII", data, 6 + index * 16)
            size = w or 256
            sizes.append(size)
            self.assertEqual(h or 256, size)
            self.assertEqual((planes, bits), (1, 32))
            with Image.open(io.BytesIO(data[offset:offset + length])) as image:
                self.assertEqual(image.size, (size, size))
                rgba = image.convert("RGBA")
                if size <= 32:
                    self.assertEqual(rgba.getpixel((0, 0))[3], 0)
                    colors = {p[:3] for p in rgba.get_flattened_data() if p[3] == 255}
                    self.assertEqual(colors, {(216, 0, 0)})
                    # El hueco permanece abierto a tamaño real.
                    # Lanczos deja un halo de alfa en el borde diagonal; el
                    # centro del hueco debe seguir prácticamente transparente.
                    self.assertLessEqual(rgba.getpixel((size // 2, size * 3 // 4))[3], 8)
                    self.assertEqual(min(rgba.getpixel((size // 2, y))[3] for y in range(size * 3 // 4, size * 7 // 8)), 0)
                else:
                    self.assertEqual(rgba.getextrema()[3], (255, 255))
                    self.assertGreater(len(set(rgba.get_flattened_data())), 20)
        self.assertEqual(sizes, [16, 24, 32, 48, 64, 128, 256])

    def test_msix_manifest_and_qualifiers(self):
        self.assertEqual(len(list(ASSETS.glob("*.png"))), 18)
        manifest = ET.parse(ROOT / "native/packaging/msix/AppxManifest.xml")
        for element in manifest.iter():
            paths = [value for name, value in element.attrib.items() if name.endswith("Logo")]
            if element.tag.endswith("}Logo"):
                paths.append(element.text)
            for path in paths:
                self.assertTrue((ASSETS.parent / path.replace("\\", "/")).is_file(), path)
        for size in (16, 24, 32, 48, 256):
            for suffix in ("", "_altform-unplated", "_altform-lightunplated"):
                with Image.open(ASSETS / f"Square44x44Logo.targetsize-{size}{suffix}.png") as image:
                    self.assertEqual(image.size, (size, size))
                    if suffix:
                        self.assertEqual(image.getpixel((0, 0))[3], 0)
                        if suffix.endswith("lightunplated"):
                            self.assertTrue(all(p[:3] == (0, 0, 0) for p in image.get_flattened_data() if p[3]))
        for name, size in (("StoreLogo", 50), ("Square44x44Logo", 44), ("Square150x150Logo", 150)):
            with Image.open(ASSETS / f"{name}.png") as image:
                self.assertEqual(image.size, (size, size))


if __name__ == "__main__":
    unittest.main()
