use crate::{Error, Result};
use sha2::{Digest, Sha256};
use windows_sys::Win32::{
    Foundation::ERROR_SUCCESS,
    System::Registry::{HKEY_LOCAL_MACHINE, RRF_RT_REG_SZ, RegGetValueW},
};

pub fn fingerprint() -> Result<String> {
    let path: Vec<u16> = "SOFTWARE\\Microsoft\\Cryptography\0"
        .encode_utf16()
        .collect();
    let name: Vec<u16> = "MachineGuid\0".encode_utf16().collect();
    let mut buffer = [0_u16; 256];
    let mut size = u32::try_from(std::mem::size_of_val(&buffer)).map_err(|_| Error::Storage)?;
    // SAFETY: predefined HKLM handle, NUL-terminated names and writable buffer
    // of exactly size bytes. RRF_RT_REG_SZ rejects binary/other registry types.
    let status = unsafe {
        RegGetValueW(
            HKEY_LOCAL_MACHINE,
            path.as_ptr(),
            name.as_ptr(),
            RRF_RT_REG_SZ,
            std::ptr::null_mut(),
            buffer.as_mut_ptr().cast(),
            &raw mut size,
        )
    };
    if status != ERROR_SUCCESS || !(4..=512).contains(&size) || size % 2 != 0 {
        return Err(Error::Storage);
    }
    let count = usize::try_from(size / 2).map_err(|_| Error::Storage)?;
    if buffer[count - 1] != 0 {
        return Err(Error::Storage);
    }
    let value = String::from_utf16(&buffer[..count - 1]).map_err(|_| Error::Storage)?;
    if value.trim().is_empty() {
        return Err(Error::Storage);
    }
    Ok(format!("{:x}", Sha256::digest(value.as_bytes())))
}
