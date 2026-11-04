"""Build QA executables with fixture configuration scoped to one child process."""
import argparse
import os
from pathlib import Path
import subprocess
import uuid


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkout", required=True)
    parser.add_argument("--target", required=True)
    args = parser.parse_args()
    qa = Path("D:/VantareServer/qa/licencias-e2e").resolve()
    checkout, target = Path(args.checkout).resolve(), Path(args.target).resolve()
    if os.name != "nt" or not all(p.is_relative_to(qa) for p in (checkout, target)):
        parser.error("requires Windows and dedicated QA roots")
    root = qa / ("build-" + uuid.uuid4().hex)
    env = {k: v for k, v in os.environ.items() if not k.startswith("VANTARE_")}
    for key, name in (("VANTARE_NATIVE_DATA_ROOT", "native"), ("LOCALAPPDATA", "local"),
                      ("APPDATA", "roaming"), ("TEMP", "tmp"), ("TMP", "tmp")):
        path = root / name
        path.mkdir(parents=True, exist_ok=True)
        env[key] = str(path)
    env.update(VANTARE_LICENSE_PUBLIC_KEYS="qa-rfc8032:11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo",
               VANTARE_BUILD_CHANNEL="nightly", VANTARE_BILLING_ENVIRONMENT="sandbox")
    command = ["pwsh", "-NoProfile", "-File", "native/scripts/compilar.ps1", "cargo", "build",
               "--locked", "--offline", "--manifest-path", "native/Cargo.toml",
               "-p", "vantare-runtime", "-p", "vantare-services", "--features", "vantare-runtime/qa-e2e",
               "--bin", "vantare", "--bin", "vantare-core", "--bin", "vantare-services",
               "--target-dir", str(target), "-j", "2"]
    raise SystemExit(subprocess.run(command, cwd=checkout / "vantare-v2", env=env).returncode)


if __name__ == "__main__":
    main()
