//! Frontera Win32 acotada al valor Run del Hub del usuario actual.
#![allow(unsafe_code)]
#[cfg(windows)]
mod win {
    use std::{ffi::c_void, io};
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

    fn wide(text: &str) -> io::Result<Vec<u16>> {
        if text.contains('\0') {
            return Err(io::Error::other("NUL en registro"));
        }
        Ok(text.encode_utf16().chain(Some(0)).collect())
    }

    pub(super) fn sync_run(key_path: &str, name: &str, command: Option<&str>) -> io::Result<()> {
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
}

pub(super) fn startup(enabled: bool) -> Result<(), String> {
    #[cfg(windows)]
    {
        let command = if !enabled {
            None
        } else if let Some(root) = std::env::var_os("VANTARE_BETA_ROOT") {
            let root = std::path::PathBuf::from(root);
            let script = root.join("beta.ps1");
            if !script.is_file() {
                return Err("No se encontró el arranque instalado de Vantare".into());
            }
            let system = std::env::var_os("SystemRoot").ok_or("Windows sin SystemRoot")?;
            let executable = std::path::PathBuf::from(system)
                .join("System32/WindowsPowerShell/v1.0/powershell.exe");
            Some(installed_command(&executable, &root)?)
        } else {
            Some(quote(
                &std::env::current_exe().map_err(|error| error.to_string())?,
            )?)
        };
        win::sync_run(
            r"Software\Microsoft\Windows\CurrentVersion\Run",
            &crate::installation::hub_identity()?,
            command.as_deref(),
        )
        .map_err(|error| format!("Inicio con Windows: {error}"))
    }
    #[cfg(not(windows))]
    {
        let _ = enabled;
        Err("Inicio automático disponible solo en Windows".into())
    }
}

#[cfg(any(windows, test))]
fn installed_command(
    executable: &std::path::Path,
    root: &std::path::Path,
) -> Result<String, String> {
    Ok(format!(
        "{} -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File {} -Root {}",
        quote(executable)?,
        quote(&root.join("beta.ps1"))?,
        quote(root)?
    ))
}

#[cfg(any(windows, test))]
fn quote(path: &std::path::Path) -> Result<String, String> {
    let value = path.to_str().ok_or("Ruta de inicio inválida")?;
    if value.contains(['"', '\0']) || value.ends_with('\\') {
        return Err("Ruta de inicio inválida".into());
    }
    Ok(format!("\"{value}\""))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn startup_quotes_unicode_and_rejects_command_injection() {
        assert_eq!(
            quote(std::path::Path::new("C:/Aplicación Vantare/hub.exe")).expect("ruta"),
            "\"C:/Aplicación Vantare/hub.exe\""
        );
        assert!(quote(std::path::Path::new("C:/hub\".exe")).is_err());
        assert!(quote(std::path::Path::new("C:/hub\0.exe")).is_err());
        assert!(quote(std::path::Path::new("C:\\Vantare\\")).is_err());
        assert_eq!(
            installed_command(
                std::path::Path::new("C:/Windows/powershell.exe"),
                std::path::Path::new("C:/Aplicación Vantare")
            )
            .expect("arranque estable")
            .replace('\\', "/"),
            "\"C:/Windows/powershell.exe\" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"C:/Aplicación Vantare/beta.ps1\" -Root \"C:/Aplicación Vantare\""
        );
    }
    #[cfg(windows)]
    #[test]
    fn run_value_is_created_and_removed_in_an_isolated_user_key() {
        let name = format!(
            "Software\\VantareNativeTests\\Settings-{}",
            std::process::id()
        );
        let query = format!("HKCU\\{name}");
        win::sync_run(&name, "HubQA", Some("\"C:/Aplicación Vantare/hub.exe\""))
            .expect("activar QA");
        assert!(
            std::process::Command::new("reg.exe")
                .args(["query", &query, "/v", "HubQA"])
                .output()
                .expect("consultar QA")
                .status
                .success()
        );
        win::sync_run(&name, "HubQA", None).expect("desactivar QA");
        assert!(
            !std::process::Command::new("reg.exe")
                .args(["query", &query, "/v", "HubQA"])
                .output()
                .expect("consultar ausencia")
                .status
                .success()
        );
        assert!(
            std::process::Command::new("reg.exe")
                .args(["delete", &query, "/f"])
                .output()
                .expect("limpiar QA")
                .status
                .success()
        );
    }
}
