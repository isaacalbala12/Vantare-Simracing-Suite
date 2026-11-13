"""Copia Inicio ya construido en una sola sesión Mac despierta; nunca ejecuta el PE."""
import argparse
import hashlib
import json
import re
import subprocess
import tarfile
from pathlib import Path

REMOTE = r'''
import hashlib, io, json, pathlib, sys, tarfile, time
home=pathlib.Path.home()
exe=home/'target-isa-2213-rune/x86_64-pc-windows-msvc/release/vantare-inicio-rune.exe'
logs=home/'orq/vanta141/logs'
sha=__SOURCE_SHA__
files={exe.name:exe}
for stem in ['inicio-runtime-visible-01','inicio-clippy-visible-01','inicio-windows-visible-01']:
 for suffix in ['.log','.log.json']:
  files[stem+suffix]=logs/(stem+suffix)
 data=json.loads((logs/(stem+'.log.json')).read_text())
 assert data['source_head']==sha and data['source_dirty'] is False and data['exit']==0
blob=exe.read_bytes()
assert ('sha='+sha+';dirty=false').encode() in blob and b'post_draw_dwm_flush' in blob
metadata=json.dumps({'source_sha':sha,'sha256':hashlib.sha256(blob).hexdigest(),'bytes':len(blob),'mac_hash_verified':True,'executed':False,'runtime_tests':3,'cpu_visible_marker':True}).encode()
with tarfile.open(fileobj=sys.stdout.buffer,mode='w|',dereference=True) as archive:
 for name,path in files.items():archive.add(path,arcname=name,recursive=False)
 entry=tarfile.TarInfo('artefacto.json');entry.size=len(metadata);archive.addfile(entry,io.BytesIO(metadata))
sys.stdout.buffer.flush()
# Deja terminar el envío del canal SSH antes de soltar la aserción de reposo.
time.sleep(2)
'''


def copy(host, user, source_sha, output):
    if not re.fullmatch(r"[a-f0-9]{40}", source_sha):
        raise ValueError("SHA no válido")
    if any(not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", value) for value in (host, user)):
        raise ValueError("Host/usuario SSH no válidos")
    if output.exists() or not output.is_absolute() or output.drive.casefold() != "d:":
        raise ValueError("Elegir una carpeta nueva en D:")
    archive_path=output.with_suffix('.transfer.tar')
    log_path=output.with_suffix('.transfer.log')
    script=REMOTE.replace('__SOURCE_SHA__',json.dumps(source_sha)).encode()
    with archive_path.open('xb') as stream, log_path.open('xb') as log:
        subprocess.run(['ssh','-o','ConnectTimeout=8',f'{user}@{host}',
                        '/usr/bin/caffeinate -i /opt/homebrew/bin/python3 -'],
                       input=script,stdout=stream,stderr=log,check=True,timeout=120)
    with tarfile.open(archive_path) as archive:
        names={member.name for member in archive.getmembers()}
        expected={'vantare-inicio-rune.exe','artefacto.json'} | {
            stem+suffix for stem in ('inicio-runtime-visible-01','inicio-clippy-visible-01','inicio-windows-visible-01')
            for suffix in ('.log','.log.json')}
        if names != expected or any(not member.isfile() for member in archive.getmembers()):
            raise ValueError("Paquete de transferencia inesperado")
        output.mkdir()
        archive.extractall(output,filter='data')
    metadata=json.loads((output/'artefacto.json').read_text())
    actual=hashlib.sha256((output/'vantare-inicio-rune.exe').read_bytes()).hexdigest()
    if actual != metadata['sha256'] or metadata['source_sha'] != source_sha:
        raise ValueError("Hash Mac/servidor no coincide")
    print(json.dumps({'output':str(output),'sha256':actual,'bytes':metadata['bytes']}))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host',required=True)
    parser.add_argument('--user',required=True)
    parser.add_argument('--source-sha',required=True)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    copy(args.host,args.user,args.source_sha,args.output)
