use crate::{Error, Result};
use windows_sys::{
    Wdk::System::SystemServices::RtlGetVersion, Win32::System::SystemInformation::OSVERSIONINFOW,
};

pub fn os_version() -> Result<String> {
    let mut version = OSVERSIONINFOW {
        dwOSVersionInfoSize: u32::try_from(std::mem::size_of::<OSVERSIONINFOW>())
            .map_err(|_| Error::Unsupported)?,
        dwMajorVersion: 0,
        dwMinorVersion: 0,
        dwBuildNumber: 0,
        dwPlatformId: 0,
        szCSDVersion: [0; 128],
    };
    // SAFETY: correctly sized writable OSVERSIONINFOW; ntdll fills it synchronously.
    if unsafe { RtlGetVersion(&raw mut version) } != 0 {
        return Err(Error::Unsupported);
    }
    Ok(format!(
        "Windows {}.{}.{}",
        version.dwMajorVersion, version.dwMinorVersion, version.dwBuildNumber
    ))
}
