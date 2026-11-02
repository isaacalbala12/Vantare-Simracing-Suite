//! Narrow Win32 boundary. Owned handles/buffers never escape these safe wrappers.
#![allow(unsafe_code)] // FFI calls require validated UTF-16 and owned OS resources.
use super::write_fs::{Result, WriteError, ensure};
use std::{ffi::OsStr, os::windows::ffi::OsStrExt, path::Path};
use windows::{core::PCWSTR, Win32::{
    Storage::FileSystem::{CopyFileW, GetDriveTypeW, GetVolumeInformationW, MoveFileExW, MOVEFILE_WRITE_THROUGH, ReplaceFileW, REPLACE_FILE_FLAGS},
    System::Com::CoCreateGuid}};
#[cfg(feature = "transport")]
use windows::Win32::{Foundation::{CloseHandle, HANDLE, HLOCAL, LocalFree},
    System::{Registry::{HKEY, HKEY_CURRENT_USER, RegGetValueW, RegOpenKeyExW, RegCloseKey, KEY_READ, RRF_RT_REG_SZ, RRF_RT_REG_EXPAND_SZ}, Threading::{GetCurrentProcess, OpenProcessToken}},
    Security::{GetTokenInformation, TOKEN_QUERY, TOKEN_USER, TokenUser, Authorization::ConvertSidToStringSidW}};

fn wide(value: &OsStr) -> Result<Vec<u16>> {
    let mut buffer: Vec<_> = value.encode_wide().collect();
    ensure(!buffer.contains(&0), "Ruta con NUL rechazada")?;
    buffer.push(0);
    Ok(buffer)
}
fn error(error: windows::core::Error) -> WriteError { WriteError::new(1, error.to_string()) }
#[cfg(feature = "transport")]
struct Handle(HANDLE);
#[cfg(feature = "transport")]
impl Drop for Handle { fn drop(&mut self) { unsafe { let _ = CloseHandle(self.0); } } }

pub fn new_id() -> Result<String> {
    Ok(format!("{:032x}", unsafe { CoCreateGuid() }.map_err(error)?.to_u128()))
}
pub fn local_volume(path: &Path, require_ntfs: bool) -> Result<()> {
    let prefix = path.components().next().ok_or_else(|| WriteError::new(1, "Volumen ausente"))?;
    let std::path::Component::Prefix(prefix) = prefix else { return Err(WriteError::new(1, "Volumen ausente")); };
    let std::path::Prefix::Disk(drive) = prefix.kind() else { return Err(WriteError::new(1, "Se requiere un volumen local")); };
    let volume = [u16::from(drive), 58, 92, 0];
    ensure(unsafe { GetDriveTypeW(PCWSTR(volume.as_ptr())) } != 4, "No se permiten unidades de red")?;
    if require_ntfs {
        let mut name = [0; 32];
        unsafe { GetVolumeInformationW(PCWSTR(volume.as_ptr()), None, None, None, None, Some(&mut name)) }.map_err(error)?;
        let count = name.iter().position(|n| *n == 0).unwrap_or(name.len());
        ensure(String::from_utf16_lossy(&name[..count]) == "NTFS", "Se requiere NTFS para el commit atómico")?;
    }
    Ok(())
}
pub fn replace(source: &Path, target: &Path) -> Result<()> {
    let source = wide(source.as_os_str())?;
    let target_wide = wide(target.as_os_str())?;
    unsafe {
        if target.try_exists()? {
            ReplaceFileW(PCWSTR(target_wide.as_ptr()), PCWSTR(source.as_ptr()), PCWSTR::null(), REPLACE_FILE_FLAGS(0), None, None)
        } else {
            MoveFileExW(PCWSTR(source.as_ptr()), PCWSTR(target_wide.as_ptr()), MOVEFILE_WRITE_THROUGH)
        }
    }.map_err(error)
}
pub fn copy_new(source: &Path, target: &Path) -> Result<()> {
    let source = wide(source.as_os_str())?;
    let target = wide(target.as_os_str())?;
    unsafe { CopyFileW(PCWSTR(source.as_ptr()), PCWSTR(target.as_ptr()), true) }.map_err(error)
}
#[cfg(feature = "transport")]
pub fn registry_string(prefix: &str, key: &str, name: &str) -> Result<Option<String>> {
    let key = if prefix.is_empty() { key.to_owned() } else { format!("{prefix}\\{key}") };
    let key = wide(OsStr::new(&key))?;
    let name = wide(OsStr::new(name))?;
    let mut bytes = 0;
    let flags = RRF_RT_REG_SZ | RRF_RT_REG_EXPAND_SZ;
    let status = unsafe { RegGetValueW(HKEY_CURRENT_USER, PCWSTR(key.as_ptr()), PCWSTR(name.as_ptr()), flags, None, None, Some(&mut bytes)) };
    // Discovery used Get-ItemProperty -ErrorAction SilentlyContinue.
    if status.is_err() { return Ok(None); }
    ensure(bytes <= 65536, "Valor de registro demasiado grande")?;
    let mut buffer = vec![0_u16; (bytes as usize).div_ceil(2)];
    unsafe { RegGetValueW(HKEY_CURRENT_USER, PCWSTR(key.as_ptr()), PCWSTR(name.as_ptr()), flags, None, Some(buffer.as_mut_ptr().cast()), Some(&mut bytes)) }.ok().map_err(error)?;
    let count = buffer.iter().position(|n| *n == 0).unwrap_or(buffer.len());
    Ok(Some(String::from_utf16_lossy(&buffer[..count])))
}
#[cfg(feature = "transport")]
pub fn registry_exists(prefix: &str, key: &str) -> Result<bool> {
    let key = if prefix.is_empty() { key.to_owned() } else { format!("{prefix}\\{key}") };
    let key = wide(OsStr::new(&key))?;
    let mut handle = HKEY::default();
    let status = unsafe { RegOpenKeyExW(HKEY_CURRENT_USER, PCWSTR(key.as_ptr()), None, KEY_READ, &raw mut handle) };
    if status.is_err() { return Ok(false); }
    unsafe { let _ = RegCloseKey(handle); }
    Ok(true)
}
#[cfg(feature = "transport")]
pub fn user_sid() -> Result<String> {
    let mut token = HANDLE::default();
    unsafe { OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &raw mut token) }.map_err(error)?;
    let token = Handle(token);
    let mut required = 0;
    unsafe { let _ = GetTokenInformation(token.0, TokenUser, None, 0, &raw mut required); }
    ensure(required > 0 && required <= 65536, "Token Windows inválido")?;
    let mut buffer = vec![0_usize; (required as usize).div_ceil(std::mem::size_of::<usize>())];
    unsafe { GetTokenInformation(token.0, TokenUser, Some(buffer.as_mut_ptr().cast()), required, &raw mut required) }.map_err(error)?;
    let user = unsafe { &*buffer.as_ptr().cast::<TOKEN_USER>() };
    let mut text = windows::core::PWSTR::null();
    unsafe { ConvertSidToStringSidW(user.User.Sid, &raw mut text) }.map_err(error)?;
    let sid = unsafe { text.to_string() }.map_err(error);
    unsafe { let _ = LocalFree(Some(HLOCAL(text.0.cast()))); }
    sid
}
