"""Real maintenance Edge -> disposable PostgreSQL -> fake Brevo."""
from pathlib import Path
import json
import subprocess


def run_erasure_e2e(deno, conn, out, bin_dir, env):
    root=Path(__file__).resolve().parents[2]
    script=root/'supabase/tests/brevo-erasure-e2e.ts'
    config=root/'supabase/functions/deno.json'
    command={'program':str(bin_dir/'psql'),'args':conn}
    permission=command['program']
    if str(deno).endswith('.exe'):
        script=subprocess.check_output(['wslpath','-w',str(script)],text=True).strip()
        config=subprocess.check_output(['wslpath','-w',str(config)],text=True).strip()
        command={'program':'wsl.exe','args':['-d',env['WSL_DISTRO_NAME'],'--',str(bin_dir/'psql'),*conn]}
        permission='wsl.exe'
    result=subprocess.run([str(deno),'test','--cached-only','--no-lock','--config',str(config),
        '--allow-run='+permission,str(script),'--',json.dumps(command)],
        env=env,capture_output=True,text=True,timeout=120)
    (out/'brevo-erasure-e2e.log').write_text(result.stdout+result.stderr,encoding='utf-8')
    assert result.returncode==0, result.stdout+result.stderr
    print('Brevo actual maintenance route -> journal/pending/reconcile, fake provider PASS',flush=True)
