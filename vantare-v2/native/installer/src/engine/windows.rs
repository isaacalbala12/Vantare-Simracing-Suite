//! Owned COM/registry handles for the Windows shell projection.
#![allow(unsafe_code)] // The safe shell module validates paths and ownership first.
use super::write_fs::{Result, WriteError, ensure};
use std::{
    ffi::OsStr,
    os::windows::ffi::OsStrExt,
    path::{Path, PathBuf},
};
use windows::Win32::{
    Storage::FileSystem::{
        CopyFileW, GetDriveTypeW, GetVolumeInformationW, MOVEFILE_WRITE_THROUGH, MoveFileExW,
        REPLACE_FILE_FLAGS, ReplaceFileW,
    },
    System::Com::CoCreateGuid,
};
use windows::{
    Win32::{
        Foundation::{PROPERTYKEY, RPC_E_CHANGED_MODE},
        System::Com::{
            APTTYPE, APTTYPE_MTA, APTTYPEQUALIFIER, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
            CoCreateInstance, CoGetApartmentType, CoInitializeEx, CoTaskMemFree, CoUninitialize,
            IPersistFile, STGM_READ, STGM_READWRITE, StructuredStorage::PROPVARIANT,
        },
        UI::Shell::{
            FOLDERID_Desktop, FOLDERID_Programs, FOLDERID_Startup, IShellLinkW,
            KF_FLAG_DONT_VERIFY, PropertiesSystem::IPropertyStore, SHGetKnownFolderPath, ShellLink,
        },
    },
    core::{GUID, Interface, PCWSTR},
};

fn wide(value: impl AsRef<OsStr>) -> Result<Vec<u16>> {
    let mut buffer: Vec<_> = value.as_ref().encode_wide().collect();
    ensure(!buffer.contains(&0), "Ruta con NUL rechazada")?;
    buffer.push(0);
    Ok(buffer)
}
fn text(value: &[u16]) -> String {
    String::from_utf16_lossy(&value[..value.iter().position(|n| *n == 0).unwrap_or(value.len())])
}
fn error(value: &windows::core::Error) -> WriteError {
    WriteError::new(1, value.to_string())
}
pub struct Apartment(bool);
impl Apartment {
    pub fn new() -> Result<Self> {
        match unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED).ok() } {
            Ok(()) => Ok(Self(true)),
            Err(cause) if cause.code() == RPC_E_CHANGED_MODE => {
                let mut kind = APTTYPE::default();
                let mut qualifier = APTTYPEQUALIFIER::default();
                unsafe { CoGetApartmentType(&raw mut kind, &raw mut qualifier) }
                    .map_err(|cause| error(&cause))?;
                if kind == APTTYPE_MTA {
                    Ok(Self(false))
                } else {
                    Err(error(&cause))
                }
            }
            Err(cause) => Err(error(&cause)),
        }
    }
}
impl Drop for Apartment {
    fn drop(&mut self) {
        if self.0 {
            unsafe {
                CoUninitialize();
            }
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
    let value = unsafe { SHGetKnownFolderPath(&raw const id, KF_FLAG_DONT_VERIFY, None) }
        .map_err(|cause| error(&cause))?;
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
    unsafe { CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER) }
        .map_err(|cause| error(&cause))
}
pub fn read_link(path: &Path) -> Result<Link> {
    super::reject_links(path).map_err(|cause| WriteError::new(1, cause))?;
    let link = create_link()?;
    let persist: IPersistFile = link.cast().map_err(|cause| error(&cause))?;
    let path = wide(path)?;
    unsafe { persist.Load(PCWSTR(path.as_ptr()), STGM_READ) }.map_err(|cause| error(&cause))?;
    let mut target = vec![0; 32768];
    let mut arguments = vec![0; 32768];
    let mut icon = vec![0; 32768];
    let mut index = 0;
    unsafe {
        link.GetPath(&mut target, std::ptr::null_mut(), 0)
            .map_err(|cause| error(&cause))?;
        link.GetArguments(&mut arguments)
            .map_err(|cause| error(&cause))?;
        link.GetIconLocation(&mut icon, &raw mut index)
            .map_err(|cause| error(&cause))?;
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
    super::reject_links(path).map_err(|cause| WriteError::new(1, cause))?;
    let link = create_link()?;
    let target = wide(&value.target)?;
    let arguments = wide(&value.arguments)?;
    let icon = wide(&value.icon)?;
    let destination = wide(path)?;
    let persist: IPersistFile = link.cast().map_err(|cause| error(&cause))?;
    if path.try_exists()? {
        // Preserve fields outside the projection (description, hotkey, working directory).
        unsafe { persist.Load(PCWSTR(destination.as_ptr()), STGM_READWRITE) }
            .map_err(|cause| error(&cause))?;
    }
    unsafe {
        link.SetPath(PCWSTR(target.as_ptr()))
            .map_err(|cause| error(&cause))?;
        link.SetArguments(PCWSTR(arguments.as_ptr()))
            .map_err(|cause| error(&cause))?;
        if !value.icon.as_os_str().is_empty() {
            link.SetIconLocation(PCWSTR(icon.as_ptr()), 0)
                .map_err(|cause| error(&cause))?;
        }
        persist
            .Save(PCWSTR(destination.as_ptr()), true)
            .map_err(|cause| error(&cause))?;
        if branded {
            let brand = || -> windows::core::Result<()> {
                let store: IPropertyStore = link.cast()?;
                let key = PROPERTYKEY {
                    fmtid: GUID::from_u128(0x9f4c2855_9f79_4b39_a8d0_e1d42de1d5f3),
                    pid: 5,
                };
                let value = PROPVARIANT::from("Vantare.SimracingSuite");
                store.SetValue(&raw const key, &raw const value)?;
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
fn registry_path(prefix: &str, path: &str) -> String {
    if prefix.is_empty() {
        path.to_owned()
    } else {
        format!("{prefix}\\{path}")
    }
}
pub fn set(prefix: &str, path: &str, name: &str, value: &str) -> Result<()> {
    windows_registry::CURRENT_USER
        .create(registry_path(prefix, path))
        .map_err(|cause| error(&cause))?
        .set_string(name, value)
        .map_err(|cause| error(&cause))
}
pub fn dword(prefix: &str, path: &str, name: &str, value: u32) -> Result<()> {
    windows_registry::CURRENT_USER
        .create(registry_path(prefix, path))
        .map_err(|cause| error(&cause))?
        .set_u32(name, value)
        .map_err(|cause| error(&cause))
}
pub fn delete_value(prefix: &str, path: &str, name: &str) -> Result<()> {
    windows_registry::CURRENT_USER
        .options()
        .write()
        .open(registry_path(prefix, path))
        .map_err(|cause| error(&cause))?
        .remove_value(name)
        .map_err(|cause| error(&cause))
}
pub fn delete_key(prefix: &str, path: &str) -> Result<()> {
    match windows_registry::CURRENT_USER.remove_tree(registry_path(prefix, path)) {
        Err(cause) if cause.code() == windows::core::HRESULT::from_win32(2) => Ok(()),
        result => result.map_err(|cause| error(&cause)),
    }
}

pub fn paths_equal(left: &Path, right: &Path) -> Result<bool> {
    use windows::Win32::Globalization::{CSTR_EQUAL, CompareStringOrdinal};
    let left = wide(left.as_os_str())?;
    let right = wide(right.as_os_str())?;
    ensure(
        i32::try_from(left.len()).is_ok() && i32::try_from(right.len()).is_ok(),
        "Ruta Windows demasiado larga",
    )?;
    let result =
        unsafe { CompareStringOrdinal(&left[..left.len() - 1], &right[..right.len() - 1], true) };
    ensure(result.0 != 0, "No se pudieron comparar las rutas Windows")?;
    Ok(result == CSTR_EQUAL)
}
pub fn new_id() -> Result<String> {
    Ok(format!(
        "{:032x}",
        unsafe { CoCreateGuid() }
            .map_err(|cause| error(&cause))?
            .to_u128()
    ))
}
pub fn local_volume(drive: u8, require_ntfs: bool) -> Result<()> {
    let volume = [u16::from(drive), 58, 92, 0];
    ensure(
        unsafe { GetDriveTypeW(PCWSTR(volume.as_ptr())) } != 4,
        "No se permiten unidades de red",
    )?;
    if require_ntfs {
        let mut name = [0; 32];
        unsafe {
            GetVolumeInformationW(
                PCWSTR(volume.as_ptr()),
                None,
                None,
                None,
                None,
                Some(&mut name),
            )
        }
        .map_err(|cause| error(&cause))?;
        ensure(
            text(&name) == "NTFS",
            "Se requiere NTFS para el commit atómico",
        )?;
    }
    Ok(())
}
pub fn replace(source: &Path, target: &Path) -> Result<()> {
    let source = wide(source.as_os_str())?;
    let target_wide = wide(target.as_os_str())?;
    unsafe {
        if target.try_exists()? {
            ReplaceFileW(
                PCWSTR(target_wide.as_ptr()),
                PCWSTR(source.as_ptr()),
                PCWSTR::null(),
                REPLACE_FILE_FLAGS(0),
                None,
                None,
            )
        } else {
            MoveFileExW(
                PCWSTR(source.as_ptr()),
                PCWSTR(target_wide.as_ptr()),
                MOVEFILE_WRITE_THROUGH,
            )
        }
    }
    .map_err(|cause| error(&cause))
}
pub fn copy_new(source: &Path, target: &Path) -> Result<()> {
    let source = wide(source.as_os_str())?;
    let target = wide(target.as_os_str())?;
    unsafe { CopyFileW(PCWSTR(source.as_ptr()), PCWSTR(target.as_ptr()), true) }
        .map_err(|cause| error(&cause))
}
pub fn registry_string(
    prefix: &str,
    path: &str,
    name: &str,
    allow_dword: bool,
) -> Result<Option<String>> {
    let Ok(key) = windows_registry::CURRENT_USER.open(registry_path(prefix, path)) else {
        return Ok(None);
    };
    let Ok(value) = key.get_value(name) else {
        return Ok(None);
    };
    ensure(value.len() <= 65536, "Valor de registro demasiado grande")?;
    // Never resolve environment variables into a different installation root.
    ensure(
        value.ty() != windows_registry::Type::ExpandString,
        "REG_EXPAND_SZ no compatible; no se modifica la instalación",
    )?;
    Ok(
        if allow_dword && value.ty() == windows_registry::Type::U32 {
            u32::try_from(value).ok().map(|value| value.to_string())
        } else {
            String::try_from(value).ok()
        },
    )
}
pub fn registry_exists(prefix: &str, path: &str) -> bool {
    windows_registry::CURRENT_USER
        .open(registry_path(prefix, path))
        .is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn environment_shortcut_target_is_expanded_instead_of_returning_raw_path() {
        let variable = if std::env::var("CI").as_deref() == Ok("true") {
            "RUNNER_TEMP"
        } else {
            "TEMP"
        };
        let parent = PathBuf::from(std::env::var_os(variable).expect("QA temporary root"));
        let name = format!(
            "Vantare link env {}",
            super::super::write_fs::id().expect("ID")
        );
        let root = parent.join(&name);
        super::super::context::qa_path(&root).expect("QA guard");
        std::fs::create_dir_all(&root).expect("owned root");
        let target = root.join("fixture.exe");
        std::fs::write(&target, b"inert fixture").expect("owned target");
        let path = root.join("environment.lnk");
        let _apartment = Apartment::new().expect("COM");
        let link = create_link().expect("link");
        let environment =
            wide(format!("%{variable}%\\{name}\\fixture.exe")).expect("UTF-16 fixture");
        let destination = wide(&path).expect("UTF-16 fixture");
        unsafe {
            link.SetPath(PCWSTR(environment.as_ptr()))
                .expect("environment target");
            link.cast::<IPersistFile>()
                .expect("persist")
                .Save(PCWSTR(destination.as_ptr()), true)
                .expect("save fixture");
        }
        let loaded = create_link().expect("load raw link");
        unsafe {
            loaded
                .cast::<IPersistFile>()
                .expect("persist")
                .Load(PCWSTR(destination.as_ptr()), STGM_READ)
                .expect("load fixture");
            let mut raw = vec![0; 32768];
            loaded
                .GetPath(&mut raw, std::ptr::null_mut(), 4)
                .expect("raw path");
            assert!(
                text(&raw).contains(&format!("%{variable}%")),
                "fixture must exercise environment expansion"
            );
        }
        let actual = read_link(&path).expect("expanded target");
        assert!(super::super::context::same_path(&actual.target, &target).expect("same target"));
    }
    #[test]
    fn existing_mta_remains_initialized_after_shell_apartment_is_dropped() {
        std::thread::spawn(|| {
            use windows::Win32::System::Com::COINIT_MULTITHREADED;
            unsafe { CoInitializeEx(None, COINIT_MULTITHREADED).ok() }.expect("own MTA");
            let owner = Apartment(true);
            let borrowed = Apartment::new().expect("reuse existing MTA");
            let link = create_link().expect("shell COM works in MTA");
            drop(borrowed);
            let mut kind = APTTYPE::default();
            let mut qualifier = APTTYPEQUALIFIER::default();
            unsafe { CoGetApartmentType(&raw mut kind, &raw mut qualifier) }
                .expect("caller MTA still initialized");
            assert_eq!(kind, APTTYPE_MTA);
            drop(link);
            drop(owner);
        })
        .join()
        .expect("MTA thread");
    }
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
        let initial = create_link().expect("initial link");
        let initial_target = wide(&value.target).expect("UTF-16 fixture");
        let description = wide("description outside projection").expect("UTF-16 fixture");
        let destination = wide(&path).expect("UTF-16 fixture");
        unsafe {
            initial
                .SetPath(PCWSTR(initial_target.as_ptr()))
                .expect("initial target");
            initial
                .SetDescription(PCWSTR(description.as_ptr()))
                .expect("description");
            initial
                .cast::<IPersistFile>()
                .expect("persist")
                .Save(PCWSTR(destination.as_ptr()), true)
                .expect("initial save");
        }
        for _ in 0..2 {
            let mut warnings = Vec::new();
            write_link(&path, &value, true, &mut |message| {
                warnings.push(message.to_owned());
            })
            .expect("save");
            assert!(warnings.is_empty(), "{warnings:?}");
            let actual = read_link(&path).expect("read");
            assert!(
                super::super::context::same_path(&actual.target, &value.target).expect("target")
            );
            assert!(super::super::context::same_path(&actual.icon, &value.icon).expect("icon"));
            assert_eq!(actual.arguments, value.arguments);
            let link = create_link().expect("link");
            let persist: IPersistFile = link.cast().expect("persist");
            let file = wide(&path).expect("UTF-16 fixture");
            unsafe {
                persist
                    .Load(PCWSTR(file.as_ptr()), STGM_READ)
                    .expect("load brand");
                let mut description = [0; 128];
                link.GetDescription(&mut description)
                    .expect("retained description");
                assert_eq!(text(&description), "description outside projection");
                let store: IPropertyStore = link.cast().expect("store");
                let key = PROPERTYKEY {
                    fmtid: GUID::from_u128(0x9f4c2855_9f79_4b39_a8d0_e1d42de1d5f3),
                    pid: 5,
                };
                let variant = store.GetValue(&raw const key).expect("brand");
                let value = windows::core::BSTR::try_from(&variant).expect("brand string");
                assert_eq!(value.to_string(), "Vantare.SimracingSuite");
            }
        }
        assert_eq!(std::fs::read_dir(&root).expect("folder").count(), 2);
    }
}
