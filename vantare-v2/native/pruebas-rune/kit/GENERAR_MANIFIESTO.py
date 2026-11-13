"""Inventario del kit: solo lee fuentes y artefactos; no ejecuta programas."""
import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path('D:/VantareServer/evidence/rune-vs-gpui')
KIT = Path(__file__).resolve().parent
BENCH = KIT.parent
SAMPLER = BENCH/'muestreador'
ENDURANCE = BENCH/'aguante'
REPLAY = BENCH.parents[1]
PROFILE = dict(name='release', opt_level=3, lto=False, codegen_units=16, debug=False)

def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--pending-inicio-rune', action='store_true')
    parser.add_argument('--pending-rune',action='store_true')
    parser.add_argument('--rune-artifact-root',type=Path)
    parser.add_argument('--rune-source-sha')
    parser.add_argument('--output',type=Path)
    parser.add_argument('--inicio-artifact', default='pieza8-54ef276c3-transfer03/vantare-inicio-rune.exe')
    options = parser.parse_args()
    if options.pending_rune and not options.rune_source_sha:
        options.rune_source_sha=subprocess.check_output(['git','rev-parse','HEAD'],cwd=BENCH,text=True).strip()
    if not options.pending_rune and (not options.rune_artifact_root or not options.rune_source_sha):
        parser.error('Indicar los binarios Rune RECONSTRUIDOS y su SHA fuente; no se reutilizan los antiguos con audio/MPL')
    import sys
    sys.path.insert(0, str(KIT))
    from package import SCRIPTS
    rows = []
    def add(source, name):
        if not source.is_file():
            raise FileNotFoundError(source)
        rows.append(dict(source=str(source), path=name, sha256=sha(source)))
    for name in sorted(SCRIPTS):
        if name.startswith('muestreador/'):
            source = SAMPLER/Path(name).name
        elif name == 'analisis/agregar.py':
            source = SAMPLER/'agregar.py'
        elif name == 'analisis/latencia.py':
            source = REPLAY/'native/pruebas-rune/latencia.py'
        elif name == 'analisis/resumir_aguante.py':
            source = ENDURANCE/'resumir_aguante.py'
        elif name in ('AGUANTE.ps1', 'RECUPERAR_AGUANTE.ps1'):
            source = ENDURANCE/name
        else:
            source = KIT/Path(name).name
        add(source, name)
    add(REPLAY/'testdata/rust-port/lmu47-high-rate-60s.tar.gz', 'datos/lmu47-high-rate-60s.tar.gz')
    for name in ('PresentMon-2.6.0-x64.exe', 'VCRUNTIME140.dll'):
        add(ROOT/'dependencias'/name, 'bin/'+name)
    specs = [
        ('hello','pieza1/vantare-rune-hola.exe','vantare-rune-hola.exe','53050828b3a843c3e32d3eeb62d07f4d13fb7c55'),
        ('core','piezas2-3-c46772dd5/vantare-core.exe','vantare-core.exe','c46772dd5ed51b603d699e36c43ffa50de3e2916'),
        ('counter','piezas2-3-c46772dd5/vantare-contador-replay.exe','vantare-contador-replay.exe','c46772dd5ed51b603d699e36c43ffa50de3e2916'),
        ('relative_rune','pieza4-3633964e0-transfer02/vantare-overlays-rune.exe','vantare-overlays-rune.exe','3633964e03eebbd72ffa2540bc325b9dad008002'),
        ('relative_gpui','pieza5-2752dff7c/vantare-overlays.exe','vantare-overlays.exe','2752dff7cb8f78af4949c81c010690284d123665'),
        ('relative_gpui_fast','pieza5-fast-a4271dd6f/vantare-overlays.exe','vantare-overlays-fast.exe','a4271dd6f4701089f4bb3f74a7f5e690bd8b8341'),
        ('load','pieza6-265407914/vantare-carga-gpu.exe','vantare-carga-gpu.exe','2654079143211ab09e2bd0ddff64c514e97b92db'),
        ('inicio_rune',options.inicio_artifact,'vantare-inicio-rune.exe','54ef276c38ed4e7f70ed220db57257898f56ec2c'),
        ('inicio_gpui_fast','pieza8b-hub-fast-eb8c0aa00-verificada/vantare-hub.exe','vantare-hub.exe','eb8c0aa00b54a9b9f0d1dec36869abeaf7dc38b9'),
    ]
    binaries = {}
    for role, artifact, name, source_sha in specs:
        is_rune=role in ('hello','relative_rune','inicio_rune')
        if not ((is_rune and options.pending_rune) or (role == 'inicio_rune' and options.pending_inicio_rune)):
            source=options.rune_artifact_root/name if is_rune else ROOT/'artefactos'/artifact
            add(source, 'bin/'+name)
        if is_rune and options.rune_source_sha:source_sha=options.rune_source_sha
        binaries[role] = dict(path='bin/'+name, source_sha=source_sha, profile=PROFILE)
    electron = ROOT/'artefactos/pieza8b-electron-e1ba4aa57/hub-electron'
    for file in sorted(electron.rglob('*')):
        if file.is_file():
            add(file, 'bin/hub-electron/'+file.relative_to(electron).as_posix())
    binaries['inicio_electron'] = dict(path='bin/hub-electron/vantare-hub-ui.exe', source_sha='e1ba4aa57a9279c0532ca3d68217df2ddbe470c3', profile='release')
    if options.pending_inicio_rune:
        add(KIT/'INICIO-RUNE-PENDIENTE.txt', 'INICIO-RUNE-PENDIENTE.txt')
    if options.pending_rune:add(KIT/'RUNE-PENDIENTE.txt','RUNE-PENDIENTE.txt')
    manifest = dict(schema=1, task='VANTA-141', issue=2213, binaries=binaries, files=rows,
                    ready=not (options.pending_inicio_rune or options.pending_rune),
                    pending_binaries=['hello','relative_rune','inicio_rune'] if options.pending_rune else ['inicio_rune'] if options.pending_inicio_rune else [],
                    measurement='PC de juego, telemetría grabada exclusivamente',
                    compilation=dict(status='pending_authorized', plan='Servidor sin otros workers en madrugada; Rune Release -j1 y GPUI mismo perfil; limpia e incremental en la misma máquina.'))
    output = options.output or ROOT/('manifiesto-kit-20261113-REVISION-PENDIENTE-RUNE.json' if options.pending_rune else 'manifiesto-kit-20261113-PENDIENTE-INICIO.json' if options.pending_inicio_rune else 'manifiesto-kit-20261113.json')
    with output.open('x', encoding='utf-8') as stream:
        json.dump(manifest, stream, ensure_ascii=False, indent=2)
    print(json.dumps(dict(manifest=str(output), files=len(rows))))

if __name__ == '__main__':
    main()
