//! Efectos Win32 del residente, en el mismo hilo que recibe `WM_HOTKEY`.
use super::launcher::triggers::Hotkey;
use std::{ffi::c_void, io, path::Path};
use windows_sys::Win32::UI::WindowsAndMessaging::{MSG, PM_REMOVE, PeekMessageW, WM_HOTKEY};

#[link(name = "user32")]
// SAFETY: firmas HWND/int/UINT/BOOL de Win32, sin punteros a datos de Rust.
unsafe extern "system" {
    fn RegisterHotKey(window: *mut c_void, id: i32, modifiers: u32, key: u32) -> i32;
    fn UnregisterHotKey(window: *mut c_void, id: i32) -> i32;
}

#[link(name = "advapi32")]
// SAFETY: firmas del SDK; todas las cadenas/buffers se mantienen durante la llamada.
unsafe extern "system" {
    fn RegCreateKeyExW(
        root: *mut c_void,
        key: *const u16,
        reserved: u32,
        class: *mut u16,
        options: u32,
        access: u32,
        security: *mut c_void,
        result: *mut *mut c_void,
        disposition: *mut u32,
    ) -> i32;
    fn RegOpenKeyExW(
        root: *mut c_void,
        key: *const u16,
        options: u32,
        access: u32,
        result: *mut *mut c_void,
    ) -> i32;
    fn RegSetValueExW(
        key: *mut c_void,
        name: *const u16,
        reserved: u32,
        kind: u32,
        data: *const u8,
        size: u32,
    ) -> i32;
    fn RegDeleteValueW(key: *mut c_void, name: *const u16) -> i32;
    fn RegCloseKey(key: *mut c_void) -> i32;
}

pub const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
pub const RUN_VALUE: &str = "VantareNative.Launcher";

pub fn register(id: i32, hotkey: Hotkey) -> io::Result<()> {
    // SAFETY: registro para la cola del hilo actual; MOD_NOREPEAT evita cadenas por tecla mantenida.
    if unsafe {
        RegisterHotKey(
            std::ptr::null_mut(),
            id,
            hotkey.modifiers | 0x4000,
            hotkey.virtual_key,
        )
    } == 0
    {
        Err(io::Error::last_os_error())
    } else {
        Ok(())
    }
}

pub fn unregister(id: i32) {
    // SAFETY: solo IDs registrados por este hilo; no afecta otras aplicaciones.
    if unsafe { UnregisterHotKey(std::ptr::null_mut(), id) } == 0 {
        eprintln!("retirar atajo {id}: {}", io::Error::last_os_error());
    }
}

pub fn pending() -> Vec<i32> {
    let mut ids = Vec::new();
    let mut message = MSG::default();
    // SAFETY: MSG válido; filtra exclusivamente mensajes de atajo del hilo actual.
    while unsafe {
        PeekMessageW(
            &raw mut message,
            std::ptr::null_mut(),
            WM_HOTKEY,
            WM_HOTKEY,
            PM_REMOVE,
        )
    } != 0
    {
        if let Ok(id) = i32::try_from(message.wParam) {
            ids.push(id);
        }
    }
    ids
}

fn wide(text: &str) -> io::Result<Vec<u16>> {
    if text.contains('\0') {
        return Err(io::Error::other("NUL en registro"));
    }
    Ok(text.encode_utf16().chain(Some(0)).collect())
}

pub fn startup_command(exe: &Path, settings: &Path, profile: &str) -> io::Result<String> {
    let exe = exe
        .to_str()
        .ok_or_else(|| io::Error::other("ruta de supervisor inválida"))?;
    let settings = settings
        .to_str()
        .ok_or_else(|| io::Error::other("ruta de ajustes inválida"))?;
    if [exe, settings, profile]
        .iter()
        .any(|value| value.contains(['"', '\0']))
        || profile.is_empty()
        || profile.len() > 128
        || !profile
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"-_".contains(&c))
    {
        return Err(io::Error::other("comando de inicio inválido"));
    }
    Ok(format!(
        "\"{exe}\" --launcher-file \"{settings}\" --launch {profile} -- --live"
    ))
}

pub fn sync_run(key_path: &str, name: &str, command: Option<&str>) -> io::Result<()> {
    let path = wide(key_path)?;
    let name = wide(name)?;
    let data = command.map(wide).transpose()?;
    let mut key = std::ptr::null_mut();
    let hkcu = -2_147_483_647_isize as *mut c_void;
    // SAFETY: HKCU del SDK; strings terminadas en NUL, salida HKEY válida, sin clases/ACL propias.
    let opened = unsafe {
        if command.is_some() {
            RegCreateKeyExW(
                hkcu,
                path.as_ptr(),
                0,
                std::ptr::null_mut(),
                0,
                2,
                std::ptr::null_mut(),
                &raw mut key,
                std::ptr::null_mut(),
            )
        } else {
            RegOpenKeyExW(hkcu, path.as_ptr(), 0, 2, &raw mut key)
        }
    };
    if opened == 2 && command.is_none() {
        return Ok(());
    }
    if opened != 0 {
        return Err(io::Error::from_raw_os_error(opened));
    }
    // SAFETY: HKEY recién abierto; buffer REG_SZ UTF-16 incluido NUL y tamaño acotado.
    let result = unsafe {
        if let Some(data) = data {
            RegSetValueExW(
                key,
                name.as_ptr(),
                0,
                1,
                data.as_ptr().cast(),
                u32::try_from(data.len() * 2)
                    .map_err(|_| io::Error::other("Run demasiado largo"))?,
            )
        } else {
            RegDeleteValueW(key, name.as_ptr())
        }
    };
    // SAFETY: cerrar exactamente el HKEY propio, después de usarlo.
    let closed = unsafe { RegCloseKey(key) };
    if result != 0 && !(result == 2 && command.is_none()) {
        return Err(io::Error::from_raw_os_error(result));
    }
    if closed != 0 {
        return Err(io::Error::from_raw_os_error(closed));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[link(name = "advapi32")]
    // SAFETY: firmas Win32; el test solo opera sobre su clave aislada de HKCU.
    unsafe extern "system" {
        fn RegGetValueW(
            root: *mut c_void,
            key: *const u16,
            name: *const u16,
            flags: u32,
            kind: *mut u32,
            data: *mut c_void,
            size: *mut u32,
        ) -> i32;
        fn RegDeleteKeyW(root: *mut c_void, key: *const u16) -> i32;
    }

    #[test]
    fn run_entry_is_quoted_updated_and_removed_in_isolated_hkcu_key() {
        let key = format!(
            r"Software\VantareNative\Tests\Launcher-{}",
            std::process::id()
        );
        let command = startup_command(
            Path::new(r"C:\Program Files\Vantare\vantare.exe"),
            Path::new(r"C:\Local Data\launcher.json"),
            "rig-1",
        )
        .expect("comando");
        assert_eq!(
            command,
            r#""C:\Program Files\Vantare\vantare.exe" --launcher-file "C:\Local Data\launcher.json" --launch rig-1 -- --live"#
        );
        assert!(startup_command(Path::new("x"), Path::new("y"), "bad id").is_err());
        sync_run(&key, RUN_VALUE, Some(&command)).expect("crear entrada aislada");
        let mut buffer = [0_u16; 2048];
        let mut size = u32::try_from(buffer.len() * 2).expect("tamaño");
        let hkcu = -2_147_483_647_isize as *mut c_void;
        let path = wide(&key).expect("clave");
        let name = wide(RUN_VALUE).expect("nombre");
        // SAFETY: HKCU y arrays válidos; capacidad exacta en bytes, RRF_RT_REG_SZ.
        let read = unsafe {
            RegGetValueW(
                hkcu,
                path.as_ptr(),
                name.as_ptr(),
                2,
                std::ptr::null_mut(),
                buffer.as_mut_ptr().cast(),
                &raw mut size,
            )
        };
        assert_eq!(read, 0);
        let chars = usize::try_from(size).expect("tamaño") / 2 - 1;
        assert_eq!(
            String::from_utf16(&buffer[..chars]).expect("UTF-16"),
            command
        );
        sync_run(&key, RUN_VALUE, Some("nuevo comando")).expect("actualizar");
        sync_run(&key, RUN_VALUE, None).expect("desactivar");
        sync_run(&key, RUN_VALUE, None).expect("desactivar idempotente");
        // SAFETY: solo eliminar la clave vacía creada por este test, nunca la clave Run real.
        assert_eq!(unsafe { RegDeleteKeyW(hkcu, path.as_ptr()) }, 0);
    }
}
