#![cfg(windows)]

// Inspect the built PE without executing it or loading application code.
fn word(bytes: &[u8], offset: usize) -> usize {
    usize::from(u16::from_le_bytes(
        bytes[offset..offset + 2].try_into().expect("PE word"),
    ))
}

fn dword(bytes: &[u8], offset: usize) -> u32 {
    u32::from_le_bytes(bytes[offset..offset + 4].try_into().expect("PE dword"))
}

fn index(value: u32) -> usize {
    usize::try_from(value).expect("Windows x64 offset")
}

fn directory_entry(bytes: &[u8], base: usize, directory: usize, id: u32) -> u32 {
    let count = word(bytes, base + directory + 12) + word(bytes, base + directory + 14);
    (0..count)
        .find_map(|i| {
            let entry = base + directory + 16 + 8 * i;
            (dword(bytes, entry) == id).then(|| dword(bytes, entry + 4))
        })
        .unwrap_or_else(|| panic!("PE resource ID {id} missing"))
}

#[test]
fn supervisor_embeds_icon_one_with_the_shared_icon_images() {
    let bytes = std::fs::read(env!("CARGO_BIN_EXE_vantare")).expect("built supervisor");
    let pe = index(dword(&bytes, 60));
    let optional = pe + 24;
    assert_eq!(word(&bytes, optional), 0x20b, "PE32+ supervisor");
    let sections = optional + word(&bytes, pe + 20);
    let rva_offset = |rva: u32| {
        (0..word(&bytes, pe + 6))
            .find_map(|i| {
                let section = sections + i * 40;
                let address = dword(&bytes, section + 12);
                let size = dword(&bytes, section + 8).max(dword(&bytes, section + 16));
                (rva >= address && rva - address < size)
                    .then(|| index(dword(&bytes, section + 20) + rva - address))
            })
            .expect("mapped resource RVA")
    };
    let resource_rva = dword(&bytes, optional + 112 + 16);
    assert_ne!(resource_rva, 0, "supervisor must have a resource directory");
    let base = rva_offset(resource_rva);
    let resource = |kind, id| {
        let kind_dir = directory_entry(&bytes, base, 0, kind);
        assert_ne!(kind_dir & 0x8000_0000, 0);
        let language_dir = directory_entry(&bytes, base, index(kind_dir & 0x7fff_ffff), id);
        assert_ne!(language_dir & 0x8000_0000, 0);
        let first_language = base + index(language_dir & 0x7fff_ffff) + 16;
        let entry = base + index(dword(&bytes, first_language + 4));
        let start = rva_offset(dword(&bytes, entry));
        &bytes[start..start + index(dword(&bytes, entry + 4))]
    };
    let group = resource(14, 1); // RT_GROUP_ICON / ICON1, required by GPUI/Win32.
    let icon = include_bytes!("../../assets/icon.ico");
    let count = word(icon, 4);
    assert_eq!(word(group, 4), count, "all shared icon sizes embedded");
    for i in 0..count {
        let source = 6 + 16 * i;
        let start = index(dword(icon, source + 12));
        let size = index(dword(icon, source + 8));
        let resource_id = u32::try_from(word(group, 6 + 14 * i + 12)).expect("icon ID");
        assert_eq!(resource(3, resource_id), &icon[start..start + size]);
    }
}
