"""Build disposable SQL integration input from the approved #1661 Git object.
No branch merge, network, service credentials or production migration execution.
"""
import argparse, io, pathlib, subprocess, tarfile
p=argparse.ArgumentParser()
p.add_argument('--output',required=True)
p.add_argument('--dependency',default='271e20053e3a07c8aad30f6695ef3499922e586d')
a=p.parse_args()
root=pathlib.Path(__file__).resolve().parents[2]
out=pathlib.Path(a.output).resolve()
if out.exists(): raise SystemExit('Use a new fixture directory')
out.mkdir(parents=True)
archive=subprocess.check_output(['git','archive',a.dependency],cwd=root)
with tarfile.open(fileobj=io.BytesIO(archive)) as tf:
 for member in tf.getmembers():
  if member.name.startswith('/') or '..' in pathlib.PurePosixPath(member.name).parts:
   raise SystemExit('Unsafe git archive path')
 tf.extractall(out)
for relative in [
 'supabase/migrations/20261015182858_isa_1593_report_promotion.sql',
 'supabase/migrations/20261016090000_report_creator_renewals.sql',
 'supabase/tests/run-report-promotion-local.py',
 'supabase/tests/report_promotion.test.sql',
 'supabase/tests/report_creator_renewals.test.sql',
 'supabase/functions/_shared/creator-renewal.ts',

]:
 target=out/relative
 target.write_bytes((root/relative).read_bytes())
for relative in [
 'supabase/functions/billing-report-promotion',
]:
 for source in (root/relative).glob('*.ts'):
  target=out/relative/source.name
  target.parent.mkdir(parents=True,exist_ok=True)
  target.write_bytes(source.read_bytes())
target=out/'supabase/functions/_shared/creator-renewal.test.ts'
new_tests=(root/'supabase/functions/_shared/creator-renewal.test.ts').read_text()
target.write_text(target.read_text()+'\n'+new_tests[new_tests.index('Deno.test("R6 creator entrypoint'):])
polar=root/'supabase/functions/_shared/polar.ts'
source=polar.read_text()
start=source.index('// Authenticated server read recovers')
end=source.index('export async function createPolarCustomerSession',start)
target=out/'supabase/functions/_shared/polar.ts'
target.write_text(target.read_text()+'\n'+source[start:end])

target=out/'supabase/functions/billing-webhook/process.ts'
source=target.read_text()
# Preserve #1661 product-price admission AND #1593 invoice periods in one projection.
marker='pickReplayFields(item, ["product_price_id"])'
if marker not in source: raise SystemExit('Dependency minimizer changed; review fixture adapter')
source=source.replace('event.data.items.filter(isRecord)', 'event.data.items.slice(0, 100).filter(isRecord)')
target.write_text(source.replace(marker,'pickReplayFields(item, ["product_price_id", "proration", "start_timestamp", "end_timestamp"])'))
print(str(out))
