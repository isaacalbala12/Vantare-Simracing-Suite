"""Hook administrativo: limpia solo workspace dentro de _work sin enlaces."""
import os
import pathlib
import shutil
import stat


def clean(workspace: pathlib.Path, runner_root: pathlib.Path) -> None:
    root = runner_root / '_work'
    # Verificar todas las rutas antes de una eliminación recursiva en Windows/Linux.
    for path in [root, workspace, *workspace.parents, *root.parents]:
        reparse = path.exists() and getattr(path.lstat(), 'st_file_attributes', 0) & getattr(stat, 'FILE_ATTRIBUTE_REPARSE_POINT', 0x400)
        if path.is_symlink() or reparse:
            raise ValueError('No limpiar enlaces/junctions')
    target = workspace.resolve()
    boundary = root.resolve()
    if boundary not in target.parents or len(target.relative_to(boundary).parts) != 2:
        raise ValueError('Workspace fuera del nivel permitido _work/repo/repo')
    if target.exists():
        shutil.rmtree(target)
    target.mkdir(parents=True, exist_ok=True)


if __name__ == '__main__':
    runner_root = pathlib.Path('C:/VantareCI/runner' if os.name == 'nt' else '/opt/vantare-runner')
    clean(pathlib.Path(os.environ['GITHUB_WORKSPACE']), runner_root)
