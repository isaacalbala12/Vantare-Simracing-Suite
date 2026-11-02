//! Owned COM/registry handles for the Windows shell projection.
#![allow(unsafe_code)] // The safe shell module validates paths and ownership first.
use super::write_fs::{Result, WriteError};
use std::{
    ffi::OsStr,
    os::windows::ffi::OsStrExt,
    path::{Path, PathBuf},
};
use windows::{
    Win32::{
        Foundation::PROPERTYKEY,
        System::{
            Com::{
                CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, CoCreateInstance, CoInitializeEx,
                CoTaskMemFree, CoUninitialize, IPersistFile, STGM_READ,
                StructuredStorage::PROPVARIANT,
            },
            Registry::*,
        },
        UI::Shell::{
            FOLDERID_Desktop, FOLDERID_Programs, FOLDERID_Startup, IShellLinkW,
            KF_FLAG_DONT_VERIFY, PropertiesSystem::IPropertyStore, SHGetKnownFolderPath, ShellLink,
        },
    },
    core::{GUID, Interface, PCWSTR},
};

fn wide(value: impl AsRef<OsStr>) -> Vec<u16> {
    value.as_ref().encode_wide().chain(Some(0)).collect()
}
fn text(value: &[u16]) -> String {
    String::from_utf16_lossy(&value[..value.iter().position(|n| *n == 0).unwrap_or(value.len())])
}
fn error(value: windows::core::Error) -> WriteError {
    WriteError::new(1, value.to_string())
}
pub struct Apartment;
impl Apartment {
    pub fn new() -> Result<Self> {
        unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED).ok() }.map_err(error)?;
        Ok(Self)
    }
}
impl Drop for Apartment {
    fn drop(&mut self) {
        unsafe {
            CoUninitialize();
        }
    }
}

pub fn folder(name: &str) -> Result<PathBuf> {
    let id = match name {
        "Programs" => FOLDERID_Programs,
        "DesktopDirectory" => FOLDERID_Desktop,
        "Startup" => FOLDERID_Startup,
        _ => return Err(WriteError::new(1, "Carpeta Windows desconocida")),
    };
    let value = unsafe { SHGetKnownFolderPath(&id, KF_FLAG_DONT_VERIFY, None) }.map_err(error)?;
    let path = unsafe { value.to_string() }.map_err(|cause| WriteError::new(1, cause.to_string()));
    unsafe {
        CoTaskMemFree(Some(value.0.cast()));
    }
    Ok(PathBuf::from(path?))
}
#[derive(Debug, PartialEq, Eq)]
pub struct Link {
    pub target: PathBuf,
    pub arguments: String,
    pub icon: PathBuf,
}
fn create_link() -> Result<IShellLinkW> {
    unsafe { CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER) }.map_err(error)
}
pub fn read_link(path: &Path) -> Result<Link> {
    let link = create_link()?;
    let persist: IPersistFile = link.cast().map_err(error)?;
    let path = wide(path);
    unsafe { persist.Load(PCWSTR(path.as_ptr()), STGM_READ) }.map_err(error)?;
    let mut target = vec![0; 32768];
    let mut arguments = vec![0; 32768];
    let mut icon = vec![0; 32768];
    let mut index = 0;
    unsafe {
        link.GetPath(&mut target, std::ptr::null_mut(), 4)
            .map_err(error)?;
        link.GetArguments(&mut arguments).map_err(error)?;
        link.GetIconLocation(&mut icon, &raw mut index)
            .map_err(error)?;
    }
    Ok(Link {
        target: PathBuf::from(text(&target)),
        arguments: text(&arguments),
        icon: PathBuf::from(text(&icon)),
    })
}
pub fn write_link(
    path: &Path,
    value: &Link,
    branded: bool,
    warning: &mut dyn FnMut(&str),
) -> Result<()> {
    let link = create_link()?;
    let target = wide(&value.target);
    let arguments = wide(&value.arguments);
    let icon = wide(&value.icon);
    let destination = wide(path);
    unsafe {
        link.SetPath(PCWSTR(target.as_ptr())).map_err(error)?;
        link.SetArguments(PCWSTR(arguments.as_ptr()))
            .map_err(error)?;
        if !value.icon.as_os_str().is_empty() {
            link.SetIconLocation(PCWSTR(icon.as_ptr()), 0)
                .map_err(error)?;
        }
        let persist: IPersistFile = link.cast().map_err(error)?;
        persist
            .Save(PCWSTR(destination.as_ptr()), true)
            .map_err(error)?;
        if branded {
            let brand = || -> windows::core::Result<()> {
                let store: IPropertyStore = link.cast()?;
                let key = PROPERTYKEY {
                    fmtid: GUID::from_u128(0x9f4c2855_9f79_4b39_a8d0_e1d42de1d5f3),
                    pid: 5,
                };
                let value = PROPVARIANT::from("Vantare.SimracingSuite");
                store.SetValue(&key, &value)?;
                store.Commit()?;
                persist.Save(PCWSTR(destination.as_ptr()), true)
            };
            if let Err(cause) = brand() {
                warning(&format!("No se pudo guardar AppUserModelID: {cause}"));
            }
        }
    }
    Ok(())
}
struct Key(HKEY);
impl Drop for Key {
    fn drop(&mut self) {
        unsafe {
            let _ = RegCloseKey(self.0);
        }
    }
}
fn key(prefix: &str, path: &str, create: bool) -> Result<Key> {
    let path = wide(if prefix.is_empty() {
        path.to_owned()
    } else {
        format!("{prefix}\\{path}")
    });
    let mut handle = HKEY::default();
    let status = unsafe {
        if create {
            RegCreateKeyExW(
                HKEY_CURRENT_USER,
                PCWSTR(path.as_ptr()),
                None,
                PCWSTR::null(),
                REG_OPTION_NON_VOLATILE,
                KEY_SET_VALUE,
                None,
                &raw mut handle,
                None,
            )
        } else {
            RegOpenKeyExW(
                HKEY_CURRENT_USER,
                PCWSTR(path.as_ptr()),
                None,
                KEY_SET_VALUE,
                &raw mut handle,
            )
        }
    };
    status.ok().map_err(error)?;
    Ok(Key(handle))
}
pub fn set(prefix: &str, path: &str, name: &str, value: &str) -> Result<()> {
    let handle = key(prefix, path, true)?;
    let name = wide(name);
    let value = wide(value);
    let bytes: Vec<_> = value.iter().flat_map(|n| n.to_le_bytes()).collect();
    unsafe { RegSetValueExW(handle.0, PCWSTR(name.as_ptr()), None, REG_SZ, Some(&bytes)) }
        .ok()
        .map_err(error)
}
pub fn dword(prefix: &str, path: &str, name: &str, value: u32) -> Result<()> {
    let handle = key(prefix, path, true)?;
    let name = wide(name);
    unsafe {
        RegSetValueExW(
            handle.0,
            PCWSTR(name.as_ptr()),
            None,
            REG_DWORD,
            Some(&value.to_le_bytes()),
        )
    }
    .ok()
    .map_err(error)
}
pub fn delete_value(prefix: &str, path: &str, name: &str) -> Result<()> {
    let handle = key(prefix, path, false)?;
    let name = wide(name);
    unsafe { RegDeleteValueW(handle.0, PCWSTR(name.as_ptr())) }
        .ok()
        .map_err(error)
}
pub fn delete_key(prefix: &str, path: &str) -> Result<()> {
    let path = wide(if prefix.is_empty() {
        path.to_owned()
    } else {
        format!("{prefix}\\{path}")
    });
    let status = unsafe { RegDeleteTreeW(HKEY_CURRENT_USER, PCWSTR(path.as_ptr())) };
    if status.0 == 2 {
        Ok(())
    } else {
        status.ok().map_err(error)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn native_shortcut_roundtrip_preserves_brand_and_repeated_projection() {
        let parent = if std::env::var("CI").as_deref() == Ok("true") {
            PathBuf::from(std::env::var_os("RUNNER_TEMP").expect("CI root"))
        } else {
            PathBuf::from("D:/VantareServer/qa/isa-1840")
        };
        let root = parent
            .join("p5-shortcut-tests")
            .join(super::super::write_fs::id().expect("ID"));
        super::super::context::qa_path(&root).expect("QA guard");
        std::fs::create_dir_all(&root).expect("owned folder");
        let _apartment = Apartment::new().expect("COM");
        let path = root.join("Vantare.lnk");
        let target = root.join("vantare.exe");
        std::fs::write(&target, b"inert fixture").expect("owned target");
        let value = Link {
            target: target.clone(),
            arguments: "--beta -Root \"fixture\" --background".into(),
            icon: target,
        };
        for _ in 0..2 {
            let mut warnings = Vec::new();
            write_link(&path, &value, true, &mut |message| {
                warnings.push(message.to_owned())
            })
            .expect("save");
            assert!(warnings.is_empty(), "{warnings:?}");
            let actual = read_link(&path).expect("read");
            assert!(
                super::super::platform::paths_equal(&actual.target, &value.target).expect("target")
            );
            assert!(super::super::platform::paths_equal(&actual.icon, &value.icon).expect("icon"));
            assert_eq!(actual.arguments, value.arguments);
            let link = create_link().expect("link");
            let persist: IPersistFile = link.cast().expect("persist");
            let file = wide(&path);
            unsafe {
                persist
                    .Load(PCWSTR(file.as_ptr()), STGM_READ)
                    .expect("load brand");
                let store: IPropertyStore = link.cast().expect("store");
                let key = PROPERTYKEY {
                    fmtid: GUID::from_u128(0x9f4c2855_9f79_4b39_a8d0_e1d42de1d5f3),
                    pid: 5,
                };
                let variant = store.GetValue(&key).expect("brand");
                let value = windows::core::BSTR::try_from(&variant).expect("brand string");
                assert_eq!(value.to_string(), "Vantare.SimracingSuite");
            }
        }
        assert_eq!(std::fs::read_dir(&root).expect("folder").count(), 2);
    }
}
