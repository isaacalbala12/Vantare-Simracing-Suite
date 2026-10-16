"""Hooks administrativos: aceptar solo eventos del repo privado, sin forks."""
import json
import os

REPO = 'isaacalbala12/Vantare-Simracing-Suite'


def allowed(event):
    repo = event.get('repository', {})
    if repo.get('full_name') != REPO or repo.get('private') is not True:
        return False
    if 'pull_request' in event:
        head = event['pull_request'].get('head', {}).get('repo', {})
        return head.get('full_name') == REPO and head.get('fork') is False
    return True


if __name__ == '__main__':
    with open(os.environ['GITHUB_EVENT_PATH'], encoding='utf-8') as stream:
        if not allowed(json.load(stream)):
            raise SystemExit('Evento publico/fork/repositorio distinto: job rechazado')
