"""Inspect the actual Setup/Uninstall PE before executing either binary."""
import struct
import sys
from pathlib import Path


def pe_info(path):
    data = Path(path).read_bytes()
    pe = struct.unpack_from('<I', data, 0x3C)[0]
    assert data[pe:pe + 4] == b'PE\0\0', 'Not a PE'
    machine, sections = struct.unpack_from('<HH', data, pe + 4)
    assert machine == 0x8664, 'Installer must be x64'
    optional_size = struct.unpack_from('<H', data, pe + 20)[0]
    optional = pe + 24
    assert struct.unpack_from('<H', data, optional)[0] == 0x20B, 'Not PE32+'
    table = []
    for i in range(sections):
        header = optional + optional_size + i * 40
        size, address, raw_size, raw = struct.unpack_from('<IIII', data, header + 8)
        table.append((address, max(size, raw_size), raw))

    def offset(rva):
        for address, size, raw in table:
            if address <= rva < address + size:
                return raw + rva - address
        raise AssertionError('RVA outside PE sections')

    def string(rva):
        start = offset(rva)
        return data[start:data.index(0, start)].decode('ascii')

    load_rva, load_size = struct.unpack_from('<II', data, optional + 112 + 10 * 8)
    assert load_rva and load_size >= 80, 'Missing load-config'
    flags = struct.unpack_from('<H', data, offset(load_rva) + 78)[0]
    imports = {}
    rva = struct.unpack_from('<I', data, optional + 112 + 8)[0]
    descriptor = offset(rva)
    while any(data[descriptor:descriptor + 20]):
        thunk, _, _, name, first_thunk = struct.unpack_from('<IIIII', data, descriptor)
        imports[string(name).lower()] = names = []
        slot = offset(thunk or first_thunk)
        while (entry := struct.unpack_from('<Q', data, slot)[0]):
            names.append(entry & 0xFFFF if entry & (1 << 63) else string(entry + 2))
            slot += 8
        descriptor += 20
    return flags, imports


def main(paths):
    for path in paths:
        flags, imports = pe_info(path)
        assert flags == 0x800, f'{path}: DependentLoadFlags={flags:#x}, expected SYSTEM32 only'
        assert not any(name.startswith(('vcruntime', 'msvcp140')) for name in imports)
        print(f'PASS {Path(path).name}: static imports restricted to System32, static CRT')


if __name__ == '__main__':
    if len(sys.argv) < 2:
        raise SystemExit('Pass actual Setup and Uninstall paths')
    main(sys.argv[1:])
