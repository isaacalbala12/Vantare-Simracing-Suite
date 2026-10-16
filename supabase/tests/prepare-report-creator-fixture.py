"""Archive the actual union tree for repeatable joint gates, never overlay branches.
Requires the integrated Founders nightly ancestor; no network or remote services.
"""
import argparse, io, pathlib, subprocess, tarfile
p=argparse.ArgumentParser()
p.add_argument('--output',required=True)
p.add_argument('--dependency',default='460c39e45ea961857666959aba3242f5bf9d1e18')
p.add_argument('--revision',default='HEAD')
a=p.parse_args()
root=pathlib.Path(__file__).resolve().parents[2]
out=pathlib.Path(a.output).resolve()
if subprocess.run(['git','merge-base','--is-ancestor',a.dependency,a.revision],cwd=root).returncode:
 raise SystemExit('Joint gates require the real integrated Founders ancestor')
if out.exists(): raise SystemExit('Use a new archive directory')
archive=subprocess.check_output(['git','archive',a.revision],cwd=root)
out.mkdir(parents=True)
with tarfile.open(fileobj=io.BytesIO(archive)) as tf:
 for member in tf.getmembers():
  if member.name.startswith('/') or '..' in pathlib.PurePosixPath(member.name).parts:
   raise SystemExit('Unsafe git archive path')
 tf.extractall(out)
print(str(out))
