"""Píxeles sintéticos CPU, sin capturar pantalla ni crear dispositivos."""
import tempfile
import unittest
from pathlib import Path
from PIL import Image
from pareja_tanda import pair


class PairTests(unittest.TestCase):
    def test_original_pixels_and_sizes_are_preserved_without_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            a, b, output, review = [root / name for name in ("a.png", "b.png", "pair.png", "text.txt")]
            Image.new("RGBA", (4, 3), (255, 0, 0, 255)).save(a)
            Image.new("RGBA", (6, 5), (0, 255, 0, 255)).save(b)
            originals = (a.read_bytes(), b.read_bytes())
            pair(a, b, output, review)
            with Image.open(output) as image:
                self.assertEqual(image.size, (18, 29))
                self.assertEqual(image.getpixel((0, 24)), (255, 0, 0, 255))
                self.assertEqual(image.getpixel((12, 24)), (0, 255, 0, 255))
            self.assertEqual(originals, (a.read_bytes(), b.read_bytes()))
            self.assertIn("PENDIENTE", review.read_text(encoding="utf-8"))
            previous = output.read_bytes()
            with self.assertRaises(FileExistsError):
                pair(a, b, output, review)
            self.assertEqual(previous, output.read_bytes())


if __name__ == "__main__":
    unittest.main()
