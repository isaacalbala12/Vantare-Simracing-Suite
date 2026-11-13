import unittest
from verificar_aislamiento import unexpected_paths, validate
from preparar_fuentes import check_destination, BENCH, REPO


class ProductIsolationTests(unittest.TestCase):
    def test_patches_cannot_target_the_product_directory(self):
        with self.assertRaises(ValueError):
            check_destination(REPO/'vantare-v2/native')
        check_destination(BENCH/'fuentes-generadas/gpui')

    def test_product_paths_are_rejected_including_packaging(self):
        paths = ['vantare-v2/native/Cargo.toml', 'vantare-v2/native/Cargo.lock',
                 'vantare-v2/native/ui/src/app.rs', 'vantare-v2/native/hub-host/src/main.rs',
                 'vantare-v2/native/installer/Cargo.toml', 'vantare-v2/native/packaging/candidate.ps1',
                 'vantare-v2/hub-web/src/main/index.ts']
        self.assertEqual(unexpected_paths(paths), paths)

    def test_only_measurement_and_its_ci_and_handoff_are_allowed(self):
        self.assertEqual(unexpected_paths([
            'vantare-v2/native/pruebas-rune/parches/gpui-medicion.patch',
            '.github/workflows/rune-measurement.yml',
            'vantare-v2/docs/vantare-program/handoffs/overlays-launcher-hub.md']), [])

    def test_actual_integration_has_no_product_diff(self):
        self.assertTrue(validate()['measurement_only'])


if __name__ == '__main__':
    unittest.main()
