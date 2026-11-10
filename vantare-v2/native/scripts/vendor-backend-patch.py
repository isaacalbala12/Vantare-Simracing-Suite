"""Regenerate the local backend delta from an already verified crates.io archive."""
import argparse
import difflib
import pathlib
import tomllib


def regenerate(pristine, vendor):
    original=tomllib.loads((pristine/'Cargo.toml').read_text(encoding='utf-8'))['package']
    current=tomllib.loads((vendor/'Cargo.toml').read_text(encoding='utf-8'))['package']
    if (original['name'],original['version']) != (current['name'],current['version']):
        raise ValueError('pristine and vendor package/version must match')
    paths={pathlib.Path('Cargo.toml'),pathlib.Path('build.rs')}
    for root in (pristine,vendor):
        paths.update(path.relative_to(root) for path in (root/'src').rglob('*') if path.is_file())
    patch=[]
    changed=[]
    for relative in sorted(paths):
        before_path=pristine/relative
        after_path=vendor/relative
        before=before_path.read_text(encoding='utf-8').splitlines(keepends=True) if before_path.exists() else []
        after=after_path.read_text(encoding='utf-8').splitlines(keepends=True) if after_path.exists() else []
        if before!=after:
            changed.append(relative.as_posix())
            patch.extend(difflib.unified_diff(before,after,
                fromfile='a/'+relative.as_posix() if before_path.exists() else '/dev/null',
                tofile='b/'+relative.as_posix() if after_path.exists() else '/dev/null'))
    # Git accepts an empty context line without its optional space prefix.
    # Avoid trailing whitespace in the versioned patch itself; always emit LF.
    output=''.join('\n' if line==' \n' else line for line in patch)
    (vendor/'vantare.patch').write_text(output,encoding='utf-8',newline='\n')
    print('\n'.join(changed))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pristine',type=pathlib.Path,required=True)
    parser.add_argument('--vendor',type=pathlib.Path,required=True)
    arguments=parser.parse_args()
    regenerate(arguments.pristine,arguments.vendor)
