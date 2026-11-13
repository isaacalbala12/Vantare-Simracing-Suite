"""Construye el kit desde archivos verificados. No ejecuta sus programas."""
import argparse
import hashlib
import json
import re
import shutil
import subprocess
import zipfile
from pathlib import Path, PurePosixPath

PRESENTMON = "b2a706bc6ad475749e3b7e3409263aa1e6906d45bdcf993f6dbc0f660188f1af"
ROLES = {"relative_gpui", "relative_gpui_fast", "relative_rune", "inicio_rune",
         "inicio_electron", "inicio_gpui_fast", "core", "counter", "load", "hello"}
SCRIPTS = {"INICIAR.ps1", "RECOGER.ps1", "LEEME.txt", "RONDAS.ps1", "AGUANTE.ps1"}
# DLL del sistema presentes en Windows 11. El CRT redistribuible NO está aquí.
SYSTEM = set("""advapi32 avrt authz bcrypt bcryptprimitives cfgmgr32 clbcatq comctl32
comdlg32 combase crypt32 cryptbase cryptnet cryptui d3d11 d3d12 d3dcompiler_47
dbghelp dcomp dhcpcsvc dnsapi dsound dwmapi dwrite dxcore dxgi evr gdi32 glu32 hid
imagehlp imm32 iphlpapi kernel32 kernelbase mf mfplat mfreadwrite mfuuid mmdevapi
mpr msacm32 msimg32 msvcrt ncrypt netapi32 normaliz ntdll ole32 oleacc oleaut32
opengl32 powrprof propsys psapi rasapi32 rpcrt4 secur32 setupapi shcore shell32
shlwapi user32 userenv usp10 uiautomationcore uxtheme version win32u winhttp
wininet winmm winscard winspool wintrust winusb wlanapi ws2_32 wtsapi32""".split())


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def relative_name(value):
    if not isinstance(value, str) or not value or "\\" in value or ":" in value:
        raise ValueError("Ruta del kit no relativa o ambigua")
    path = PurePosixPath(value)
    if path.is_absolute() or str(path) != value or any(
        part in (".", "..") or part.endswith((" ", "."))
        or re.fullmatch(r"(?i)(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?", part)
        for part in path.parts
    ):
        raise ValueError("Ruta del kit fuera de la carpeta o reservada en Windows")
    return value


def contains_marker(path, marker):
    needles = [marker.encode("utf-8"), marker.encode("utf-16-le")]
    keep = max(map(len, needles))
    carry = b""
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            data = carry + chunk
            if any(needle in data for needle in needles):
                return True
            carry = data[-keep:]
    return False


def dependencies(binary, dumpbin):
    result = subprocess.run([str(dumpbin), "/dependents", str(binary)],
                            capture_output=True, check=True)
    output = result.stdout.decode("utf-8", errors="replace")
    names = {match.lower() for match in re.findall(r"(?im)^\s+([a-z0-9_.-]+\.dll)\s*$", output)}
    if not names or not any(kind in output for kind in ("EXECUTABLE IMAGE", "File Type: DLL")):
        raise ValueError(f"dumpbin no reconoce una imagen PE: {binary.name}")
    return names, output


def build(manifest_path, staging, output, dumpbin):
    manifest = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
    if manifest.get("schema") != 1 or set(manifest.get("binaries", {})) != ROLES:
        raise ValueError("Manifiesto incompleto: faltan variantes del kit")
    if staging.exists() or output.exists() or output.with_suffix(".zip.sha256").exists():
        raise ValueError("Usar carpetas y zip nuevos; conservar los intentos anteriores")
    if output.suffix != ".zip" or staging in output.parents:
        raise ValueError("El zip debe quedar fuera del staging")
    if any(not path.is_absolute() or path.drive.casefold() != "d:"
           or path.resolve() != path.absolute() for path in (staging, output)):
        raise ValueError("Staging y zip deben quedar en rutas físicas de D:")
    if any(shutil.disk_usage(drive).free < minimum * 2**30 for drive, minimum in (("C:\\", 8), ("D:\\", 40))):
        raise ValueError("No se cumplen C >=8 GiB y D >=40 GiB")
    rows = manifest.get("files", [])
    files = {}
    for row in rows:
        name = relative_name(row["path"])
        if name.casefold() in files or name.casefold().startswith("verificaciones/") or name.casefold() == "kit.json":
            raise ValueError("Ruta duplicada o reservada para las verificaciones")
        source = Path(row["source"])
        if not source.is_absolute() or not source.is_file() or source.resolve() != source.absolute():
            raise ValueError(f"Fuente inexistente o enlazada: {name}")
        if source.drive.casefold() != "d:":
            raise ValueError("Los artefactos de servidor deben estar en D:")
        if source.name.startswith(".env") or digest(source) != row["sha256"]:
            raise ValueError(f"Hash incorrecto o fuente excluida: {name}")
        files[name.casefold()] = row
    if not {name.casefold() for name in SCRIPTS}.issubset(files):
        raise ValueError("Faltan guiones de campaña, aguante o instrucciones")
    if not any(PurePosixPath(row["path"]).name == "lmu47-high-rate-60s.tar.gz" for row in rows):
        raise ValueError("Falta la grabación completa de 60 s")
    pm = [row for row in rows if PurePosixPath(row["path"]).name == "PresentMon-2.6.0-x64.exe"]
    if len(pm) != 1 or pm[0]["sha256"] != PRESENTMON:
        raise ValueError("Falta PresentMon 2.6.0 oficial verificado")
    for role, binary in manifest["binaries"].items():
        name = relative_name(binary["path"])
        if name.casefold() not in files or not re.fullmatch(r"[a-f0-9]{40}", binary["source_sha"]):
            raise ValueError(f"Binario sin procedencia: {role}")
        if not contains_marker(Path(files[name.casefold()]["source"]), binary["source_sha"]):
            raise ValueError(f"SHA no incrustado en el binario: {role}")
        if role.startswith("relative_") and binary.get("profile") != {
            "name": "release", "opt_level": 3, "lto": False, "codegen_units": 16, "debug": False
        }:
            raise ValueError(f"Perfil común incorrecto: {role}")
    staging.mkdir(parents=True)
    for row in rows:
        target = staging / row["path"]
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(row["source"], target)
        if digest(target) != row["sha256"]:
            raise ValueError("El artefacto cambió durante la copia")
    logs = staging / "verificaciones/dumpbin"
    logs.mkdir(parents=True)
    resolution = []
    for image in sorted(path for path in staging.rglob("*") if path.suffix.lower() in (".exe", ".dll")):
        imports, raw = dependencies(image, dumpbin)
        (logs / (hashlib.sha256(str(image.relative_to(staging)).encode()).hexdigest()[:16] + ".txt")).write_text(raw, encoding="utf-8")
        for dependency in sorted(imports):
            local = image.parent / dependency
            common = staging / "bin" / dependency
            supplied = next((path for path in (local, common) if path.is_file()), None)
            system = dependency[:-4] in SYSTEM or dependency.startswith(("api-ms-win-", "ext-ms-win-"))
            if supplied is None and not system:
                raise ValueError(f"Falta DLL: {image.relative_to(staging)} -> {dependency}")
            resolution.append({"image": image.relative_to(staging).as_posix(), "dependency": dependency,
                               "provided": supplied.relative_to(staging).as_posix() if supplied else "Windows 11"})
    (staging / "verificaciones/dll.json").write_text(json.dumps(resolution, indent=2), encoding="utf-8")
    (staging / "kit.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    inventory = {path.relative_to(staging).as_posix(): digest(path) for path in staging.rglob("*") if path.is_file()}
    (staging / "verificaciones/sha256.json").write_text(json.dumps(inventory, indent=2), encoding="utf-8")
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for path in sorted(staging.rglob("*")):
            if path.is_file():
                archive.write(path, output.stem + "/" + path.relative_to(staging).as_posix())
    with zipfile.ZipFile(output) as archive:
        if archive.testzip() is not None:
            raise ValueError("El zip no supera la comprobación CRC")
        for name, expected in inventory.items():
            with archive.open(output.stem + "/" + name) as stream:
                if hashlib.file_digest(stream, "sha256").hexdigest() != expected:
                    raise ValueError("El zip no reproduce el inventario")
    output.with_suffix(".zip.sha256").write_text(digest(output) + "  " + output.name + "\n", encoding="ascii")
    return {"zip": str(output), "bytes": output.stat().st_size, "sha256": digest(output),
            "files": len(inventory) + 1, "graphics_executed": False}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--staging", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--dumpbin", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(build(args.manifest, args.staging, args.output, args.dumpbin), indent=2))
