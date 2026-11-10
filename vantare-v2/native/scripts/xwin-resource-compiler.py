"""Adapt this workspace's rc.exe invocation to llvm-rc on macOS.

LLVM's Unix CLI treats absolute input filenames as slash options. Keep /fo and
/nologo intact, and make existing input files and the /fo output path relative.
"""
import os
from pathlib import Path
import sys


def main():
    arguments = sys.argv[1:]
    translated = []
    for index, argument in enumerate(arguments):
        output = index > 0 and arguments[index - 1].lower() == '/fo'
        if Path(argument).is_absolute() and (Path(argument).is_file() or output):
            argument = os.path.relpath(argument)
        translated.append(argument)
    os.execvp('llvm-rc', ['llvm-rc', *translated])


if __name__ == '__main__':
    main()
