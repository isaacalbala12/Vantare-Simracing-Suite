"""El kit no necesita PowerShell 7 ni ejecuta acciones GET al descubrir rutas."""
import json
import pathlib
import subprocess
import sys
import tempfile
import unittest
import zipfile


@unittest.skipUnless(sys.platform == "win32", "kit Windows PowerShell 5")
class CatalogTests(unittest.TestCase):
    def test_resolves_local_gets_and_excludes_credentials_actions_and_post(self):
        script = pathlib.Path(__file__).resolve().parents[1] / "lmu-recording-kit/Discover-LmuRest.ps1"
        with tempfile.TemporaryDirectory(prefix="1638-catalog-test-") as directory:
            folder = pathlib.Path(directory)
            archive = folder / "UI.zip"
            output = folder / "catalog.json"
            with zipfile.ZipFile(archive, "w") as files:
                files.writestr("app.js", """
                    const garageRestUrl = `${restServiceUrl}garage/`;
                    const profileRestUrl = `${restServiceUrl}profile/`;
                    getJson(`${garageRestUrl}getVehicleCondition`);
                    getJson(`${profileRestUrl}getAuthSessionTicket`);
                    getJson(`/rest/sessions/Championship/championshipAction/CHAMP_STARTNEW`);
                    postJson(`/rest/garage/mutate`, {});
                    getJson(`/rest/race/track/${trackId}/trackmap`);
                """)
            subprocess.run(["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass",
                            "-File", str(script), "-UiZip", str(archive), "-Output", str(output)],
                           check=True, capture_output=True, timeout=30)
            catalog = json.loads(output.read_text(encoding="utf-8"))
            self.assertIn("/rest/garage/getVehicleCondition", catalog["capture"])
            self.assertIn("/rest/race/track/${trackId}/trackmap", catalog["unresolved_templates"])
            for forbidden in ("getAuthSessionTicket", "CHAMP_STARTNEW", "mutate"):
                self.assertFalse(any(forbidden in route for route in catalog["capture"]))
            self.assertEqual(len(catalog["ui_sha256"]), 64)


if __name__ == "__main__":
    unittest.main()
