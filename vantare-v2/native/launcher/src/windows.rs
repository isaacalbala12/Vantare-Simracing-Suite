//! Frontera Win32 mínima sin crate nuevo; firmas de advapi32/kernel32 del SDK.
use super::discovery::Sources;
use std::{
    ffi::c_void,
    os::windows::{
        ffi::OsStrExt,
        io::{AsRawHandle, FromRawHandle, OwnedHandle},
    },
    path::{Path, PathBuf},
};

type Handle = *mut c_void;
const HKCU: Handle = -2_147_483_647_isize as Handle;
const HKLM: Handle = -2_147_483_646_isize as Handle;

#[link(name = "advapi32")]
// SAFETY: firmas LSTATUS/HKEY/WCHAR del SDK Win32; buffers acotados al llamar.
unsafe extern "system" {
    #[link_name = "RegOpenKeyExW"]
    fn reg_open(
        key: Handle,
        subkey: *const u16,
        options: u32,
        access: u32,
        result: *mut Handle,
    ) -> i32;
    #[link_name = "RegEnumKeyW"]
    fn reg_enum(key: Handle, index: u32, name: *mut u16, capacity: u32) -> i32;
    #[link_name = "RegGetValueW"]
    fn reg_value(
        key: Handle,
        subkey: *const u16,
        value: *const u16,
        flags: u32,
        kind: *mut u32,
        data: *mut c_void,
        size: *mut u32,
    ) -> i32;
    #[link_name = "RegCloseKey"]
    fn reg_close(key: Handle) -> i32;
}

#[repr(C)]
struct ProcessEntry {
    size: u32,
    usage: u32,
    pid: u32,
    heap: usize,
    module: u32,
    threads: u32,
    parent: u32,
    priority: i32,
    flags: u32,
    name: [u16; 260],
}

#[link(name = "kernel32")]
// SAFETY: firmas HANDLE/BOOL/PROCESSENTRY32W del SDK Win32; propiedad vía OwnedHandle.
unsafe extern "system" {
    #[link_name = "CreateToolhelp32Snapshot"]
    fn process_snapshot(flags: u32, pid: u32) -> Handle;
    #[link_name = "Process32FirstW"]
    fn process_first(snapshot: Handle, entry: *mut ProcessEntry) -> i32;
    #[link_name = "Process32NextW"]
    fn process_next(snapshot: Handle, entry: *mut ProcessEntry) -> i32;
    #[link_name = "OpenProcess"]
    fn open_process(access: u32, inherit: i32, pid: u32) -> Handle;
    #[link_name = "QueryFullProcessImageNameW"]
    fn image_name(process: Handle, flags: u32, image: *mut u16, size: *mut u32) -> i32;
    #[link_name = "GetExitCodeProcess"]
    fn exit_code(process: Handle, code: *mut u32) -> i32;
}

fn wide(value: &std::ffi::OsStr) -> Vec<u16> {
    value.encode_wide().chain(Some(0)).collect()
}
struct Key(Handle);
impl Drop for Key {
    fn drop(&mut self) {
        // SAFETY: RegOpenKeyExW creó este HKEY; único propietario, nunca pseudo-HKEY.
        let status = unsafe { reg_close(self.0) };
        if status != 0 {
            eprintln!("cerrar clave Launcher: error Win32 {status}");
        }
    }
}

fn key(root: Handle, path: &str, view: u32) -> Result<Option<Key>, String> {
    let path = wide(path.as_ref());
    let mut handle = std::ptr::null_mut();
    // SAFETY: subkey terminado en NUL; result apunta a almacenamiento válido.
    let status = unsafe { reg_open(root, path.as_ptr(), 0, 0x20019 | view, &raw mut handle) };
    match status {
        0 => Ok(Some(Key(handle))),
        2 => Ok(None),
        _ => Err(format!("abrir registro Launcher: error Win32 {status}")),
    }
}

fn string(key: &Key, name: &str) -> Result<Option<String>, String> {
    let name = wide(name.as_ref());
    let mut buffer = vec![0_u16; 32768];
    let mut size = 65536_u32;
    // SAFETY: HKEY vivo, nombre NUL y buffer de size bytes; SDK expande REG_EXPAND_SZ.
    let status = unsafe {
        reg_value(
            key.0,
            std::ptr::null(),
            name.as_ptr(),
            6,
            std::ptr::null_mut(),
            buffer.as_mut_ptr().cast(),
            &raw mut size,
        )
    };
    match status {
        0 => {
            let length = buffer
                .iter()
                .position(|ch| *ch == 0)
                .ok_or("cadena del registro sin terminador")?;
            String::from_utf16(&buffer[..length])
                .map(Some)
                .map_err(|e| format!("cadena del registro: {e}"))
        }
        2 => Ok(None),
        _ => Err(format!("leer valor Launcher: error Win32 {status}")),
    }
}

fn dword(key: &Key, name: &str) -> Result<u32, String> {
    let name = wide(name.as_ref());
    let mut value = 0_u32;
    let mut size = 4_u32;
    // SAFETY: DWORD de cuatro bytes; RRF_RT_REG_DWORD rechaza cualquier otro tipo.
    let status = unsafe {
        reg_value(
            key.0,
            std::ptr::null(),
            name.as_ptr(),
            16,
            std::ptr::null_mut(),
            (&raw mut value).cast(),
            &raw mut size,
        )
    };
    match status {
        0 | 2 => Ok(value),
        _ => Err(format!("leer DWORD Launcher: error Win32 {status}")),
    }
}

fn uninstall(root: Handle, view: u32, result: &mut Sources) -> Result<(), String> {
    let base = r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall";
    let Some(parent) = key(root, base, view)? else {
        return Ok(());
    };
    for index in 0..4096 {
        let mut name = [0_u16; 256];
        // SAFETY: parent vivo y buffer de 256 WCHAR; índice acotado.
        let status = unsafe { reg_enum(parent.0, index, name.as_mut_ptr(), 256) };
        if status == 259 {
            return Ok(());
        }
        if status != 0 {
            result
                .warnings
                .push(format!("enumerar registro: error Win32 {status}"));
            continue;
        }
        let length = name
            .iter()
            .position(|ch| *ch == 0)
            .ok_or("subclave sin NUL")?;
        let name = String::from_utf16(&name[..length]).map_err(|e| e.to_string())?;
        let read = (|| {
            let Some(child) = key(root, &format!("{base}\\{name}"), view)? else {
                return Ok(());
            };
            if dword(&child, "SystemComponent")? == 1
                || dword(&child, "NoRemove")? == 1
                || string(&child, "ParentKeyName")?.is_some_and(|value| !value.is_empty())
                || string(&child, "ReleaseType")?.is_some_and(|value| {
                    matches!(
                        value.as_str(),
                        "Update" | "Hotfix" | "SecurityUpdate" | "ServicePack"
                    )
                })
            {
                return Ok(());
            }
            let display = string(&child, "DisplayName")?.unwrap_or_default();
            if !super::CATALOG.iter().any(|app| {
                app.matchers
                    .iter()
                    .any(|matcher| display.to_ascii_lowercase().contains(matcher))
            }) {
                return Ok(());
            }
            let location = string(&child, "InstallLocation")?.unwrap_or_default();
            let location = PathBuf::from(location);
            // Registrar el nombre como encontrado aunque no tenga ruta; no inventar ejecutable.
            result.registry.push((
                display,
                if location.is_absolute() {
                    location
                } else {
                    PathBuf::new()
                },
            ));
            Ok::<(), String>(())
        })();
        if let Err(error) = read {
            result.warnings.push(error);
        }
    }
    result
        .warnings
        .push("registro truncado a 4096 claves por vista".into());
    Ok(())
}

pub fn registry_sources(result: &mut Sources) {
    for (root, view) in [(HKLM, 0x100), (HKLM, 0x200), (HKCU, 0)] {
        if let Err(error) = uninstall(root, view, result) {
            result.warnings.push(error);
        }
    }
    let steam = (|| {
        let Some(steam) = key(HKCU, r"Software\Valve\Steam", 0)? else {
            return Ok(None);
        };
        string(&steam, "SteamPath")
    })();
    match steam {
        Ok(Some(path)) if Path::new(&path).is_absolute() => {
            result.steam_roots.insert(0, PathBuf::from(path));
        }
        Ok(_) => {}
        Err(error) => result.warnings.push(error),
    }
}

pub fn running_all(path: &Path) -> Result<Vec<u32>, String> {
    let expected =
        std::fs::canonicalize(path).map_err(|e| format!("identidad del ejecutable: {e}"))?;
    // SAFETY: TH32CS_SNAPPROCESS; función sin punteros prestados.
    let snapshot = unsafe { process_snapshot(2, 0) };
    if snapshot == -1_isize as Handle {
        return Err(format!(
            "enumerar procesos: {}",
            std::io::Error::last_os_error()
        ));
    }
    // SAFETY: handle válido propiedad exclusiva; OwnedHandle lo cierra exactamente una vez.
    let snapshot = unsafe { OwnedHandle::from_raw_handle(snapshot) };
    let mut entry = ProcessEntry {
        size: u32::try_from(std::mem::size_of::<ProcessEntry>()).map_err(|e| e.to_string())?,
        usage: 0,
        pid: 0,
        heap: 0,
        module: 0,
        threads: 0,
        parent: 0,
        priority: 0,
        flags: 0,
        name: [0; 260],
    };
    // SAFETY: estructura repr(C) con dwSize inicializado y snapshot vivo.
    let mut has_entry = unsafe { process_first(snapshot.as_raw_handle(), &raw mut entry) } != 0;
    let mut buffer = vec![0_u16; 32768];
    let mut result = Vec::new();
    while has_entry {
        // SAFETY: solo consulta; un proceso inaccesible se omite sin adquirir autoridad sobre él.
        let process = unsafe { open_process(0x1000, 0, entry.pid) };
        if !process.is_null() {
            // SAFETY: handle nuevo con propiedad exclusiva.
            let process = unsafe { OwnedHandle::from_raw_handle(process) };
            let mut length = 32768_u32;
            // SAFETY: handle vivo y buffer WCHAR de length elementos.
            let success = unsafe {
                image_name(
                    process.as_raw_handle(),
                    0,
                    buffer.as_mut_ptr(),
                    &raw mut length,
                )
            } != 0;
            if success
                && let Ok(image) = String::from_utf16(
                    &buffer[..usize::try_from(length).map_err(|e| e.to_string())?],
                )
                && let Ok(image) = std::fs::canonicalize(image)
                && image.as_os_str().eq_ignore_ascii_case(expected.as_os_str())
            {
                let mut code = 0_u32;
                // SAFETY: handle vivo con consulta limitada y puntero a DWORD válido.
                if unsafe { exit_code(process.as_raw_handle(), &raw mut code) } == 0 {
                    return Err(format!(
                        "estado del proceso: {}",
                        std::io::Error::last_os_error()
                    ));
                }
                if code == 259 {
                    result.push(entry.pid);
                }
            }
        }
        // SAFETY: estructura y snapshot siguen vivos.
        has_entry = unsafe { process_next(snapshot.as_raw_handle(), &raw mut entry) } != 0;
    }
    let error = std::io::Error::last_os_error();
    if error.raw_os_error() != Some(18) {
        return Err(format!("enumerar procesos: {error}"));
    }
    result.sort_unstable();
    Ok(result)
}
