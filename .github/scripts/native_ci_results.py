"""Keep the required native check red if any applicable parallel gate fails."""
import json
import os


def validate(needs):
    if needs['policy']['result'] != 'success':
        raise ValueError('Policy failed or was cancelled')
    outputs = needs['policy']['outputs']
    native = outputs.get('native') != 'false'
    installation = outputs.get('installation') != 'false'
    for job in ('native_build', 'native_tests', 'native_installation'):
        required = native and (job != 'native_installation' or installation)
        result = needs[job]['result']
        if (required and result != 'success') or result not in ('success', 'skipped'):
            raise ValueError(f'{job}: {result}')


if __name__ == '__main__':
    validate(json.loads(os.environ['RESULTS']))
