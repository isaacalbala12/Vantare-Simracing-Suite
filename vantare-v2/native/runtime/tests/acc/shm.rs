//! Mappings Win32 propios: se prueban apertura, copia y liberación sin ACC.
use super::*;

#[test]
fn win32_readonly_mapping_preserves_packet_and_static_bytes() {
    use windows_sys::Win32::Foundation::INVALID_HANDLE_VALUE;
    use windows_sys::Win32::System::Memory::{CreateFileMappingW, FILE_MAP_WRITE, PAGE_READWRITE};
    let name = format!("Local\\vantare-acc-stable-test-{}", std::process::id());
    let wide: Vec<u16> = name.encode_utf16().chain([0]).collect();
    // SAFETY: mapping anónimo propio de 800 bytes, nombre NUL válido.
    let raw = unsafe {
        CreateFileMappingW(
            INVALID_HANDLE_VALUE,
            std::ptr::null(),
            PAGE_READWRITE,
            0,
            800,
            wide.as_ptr(),
        )
    };
    assert!(!raw.is_null());
    // SAFETY: handle nuevo con dueño único.
    let owner = unsafe { OwnedHandle::from_raw_handle(raw) };
    // SAFETY: handle válido y mapping de 800 bytes; la vista se libera abajo.
    let view = unsafe { MapViewOfFile(owner.as_raw_handle(), FILE_MAP_WRITE, 0, 0, 800) };
    assert!(!view.Value.is_null());
    let p = view.Value.cast::<u8>();
    let mut bytes = vec![7_u8; 800];
    bytes[..4].copy_from_slice(&1_u32.to_le_bytes());
    // SAFETY: vista propia de 800 bytes, origen propio de igual tamaño.
    unsafe { std::ptr::copy_nonoverlapping(bytes.as_ptr(), p, 800) };
    let page = Page::open(&name, 800).expect("vista de solo lectura");
    assert_eq!(page.stable(true).expect("packet estable"), bytes);
    assert_eq!(page.stable(false).expect("static estable"), bytes);
    bytes[..4].copy_from_slice(&2_u32.to_le_bytes());
    bytes[600] = 99;
    // SAFETY: misma vista viva; el test no tiene escritor concurrente.
    unsafe { std::ptr::copy_nonoverlapping(bytes.as_ptr(), p, 800) };
    assert_eq!(page.stable(true).expect("packet nuevo"), bytes);
    drop(page);
    // SAFETY: vista de escritura propia, ya no se usa.
    assert_ne!(unsafe { UnmapViewOfFile(view) }, 0);
    drop(owner);
    assert!(
        Page::open(&name, 800).is_err(),
        "todos los handles liberados"
    );
}
