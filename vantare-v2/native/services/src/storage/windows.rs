//! Única frontera unsafe de persistencia, exclusivamente Win32.
#![allow(unsafe_code)]

use std::os::windows::{
    ffi::OsStrExt,
    io::{AsRawHandle, FromRawHandle, OwnedHandle},
};
use std::path::Path;
use std::ptr::{null, null_mut};

use windows_sys::Win32::Foundation::{
    ERROR_SHARING_VIOLATION, GetLastError, INVALID_HANDLE_VALUE, LocalFree,
};
use windows_sys::Win32::Foundation::{GENERIC_READ, GENERIC_WRITE};
use windows_sys::Win32::Security::Authorization::{
    ConvertSidToStringSidW, ConvertStringSecurityDescriptorToSecurityDescriptorW, SDDL_REVISION_1,
    SE_FILE_OBJECT, SetNamedSecurityInfoW,
};
use windows_sys::Win32::Security::Cryptography::{
    CRYPT_INTEGER_BLOB, CRYPTPROTECT_UI_FORBIDDEN, CryptProtectData, CryptUnprotectData,
};
use windows_sys::Win32::Security::{
    DACL_SECURITY_INFORMATION, GetSecurityDescriptorDacl, GetTokenInformation,
    PROTECTED_DACL_SECURITY_INFORMATION, TOKEN_QUERY, TOKEN_USER, TokenUser,
};
use windows_sys::Win32::Storage::FileSystem::{
    CreateFileW, FILE_ATTRIBUTE_NORMAL, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    MoveFileExW, OPEN_ALWAYS,
};
use windows_sys::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};
use zeroize::Zeroizing;

use crate::{Error, Result};

fn wide(path: &Path) -> Vec<u16> {
    path.as_os_str().encode_wide().chain([0]).collect()
}

pub fn exclusive(path: &Path) -> Result<OwnedHandle> {
    let name = wide(path);
    // SAFETY: cadena terminada en NUL; handle comprobado, share=0 impide otro
    // escritor y el kernel libera la exclusión incluso después de un crash.
    let handle = unsafe {
        CreateFileW(
            name.as_ptr(),
            GENERIC_READ | GENERIC_WRITE,
            0,
            null(),
            OPEN_ALWAYS,
            FILE_ATTRIBUTE_NORMAL,
            null_mut(),
        )
    };
    if handle == INVALID_HANDLE_VALUE {
        // SAFETY: leer error de la llamada inmediatamente anterior.
        return Err(if unsafe { GetLastError() } == ERROR_SHARING_VIOLATION {
            Error::Busy
        } else {
            Error::Storage
        });
    }
    // SAFETY: handle recién creado, propiedad única transferida a RAII.
    Ok(unsafe { OwnedHandle::from_raw_handle(handle) })
}

fn current_sid() -> Result<String> {
    let mut token = null_mut();
    // SAFETY: pseudo-handle proceso actual, salida válida; token comprobado.
    if unsafe { OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &raw mut token) } == 0 {
        return Err(Error::Storage);
    }
    // SAFETY: token recién abierto, único dueño RAII.
    let token = unsafe { OwnedHandle::from_raw_handle(token) };
    let mut needed = 0;
    // SAFETY: primera llamada obtiene tamaño; null es válido con longitud cero.
    unsafe {
        GetTokenInformation(
            token.as_raw_handle(),
            TokenUser,
            null_mut(),
            0,
            &raw mut needed,
        );
    }
    if needed == 0 || needed > 16 * 1024 {
        return Err(Error::Storage);
    }
    let mut buffer = vec![0_usize; (needed as usize).div_ceil(std::mem::size_of::<usize>())];
    // SAFETY: buffer con tamaño y alineación para TOKEN_USER, salida válida.
    if unsafe {
        GetTokenInformation(
            token.as_raw_handle(),
            TokenUser,
            buffer.as_mut_ptr().cast(),
            needed,
            &raw mut needed,
        )
    } == 0
    {
        return Err(Error::Storage);
    }
    // SAFETY: GetTokenInformation devolvió TOKEN_USER válido en buffer alineado.
    let user = unsafe { &*buffer.as_ptr().cast::<TOKEN_USER>() };
    let mut text = null_mut();
    // SAFETY: SID pertenece al buffer vivo; salida allocation NUL de Windows.
    if unsafe { ConvertSidToStringSidW(user.User.Sid, &raw mut text) } == 0 {
        return Err(Error::Storage);
    }
    let mut len = 0;
    // SAFETY: ConvertSidToStringSidW garantiza terminación NUL.
    while unsafe { *text.add(len) } != 0 {
        len += 1;
    }
    // SAFETY: len elementos válidos anteriores al NUL.
    let sid = String::from_utf16(unsafe { std::slice::from_raw_parts(text, len) });
    // SAFETY: allocation retornada por ConvertSidToStringSidW.
    unsafe {
        LocalFree(text.cast());
    }
    sid.map_err(|_| Error::Storage)
}

pub fn private_acl(path: &Path) -> Result<()> {
    // SID exacto del usuario, heredado por hijos; sin Everyone/Administrators.
    let sddl: Vec<u16> = format!("D:P(A;OICI;FA;;;{})", current_sid()?)
        .encode_utf16()
        .chain([0])
        .collect();
    let mut descriptor = null_mut();
    // SAFETY: entrada NUL; salida válida, memoria liberada con LocalFree.
    if unsafe {
        ConvertStringSecurityDescriptorToSecurityDescriptorW(
            sddl.as_ptr(),
            SDDL_REVISION_1,
            &raw mut descriptor,
            null_mut(),
        )
    } == 0
    {
        return Err(Error::Storage);
    }
    let mut present = 0;
    let mut defaulted = 0;
    let mut dacl = null_mut();
    // SAFETY: descriptor válido; salidas viven durante llamada.
    let valid = unsafe {
        GetSecurityDescriptorDacl(
            descriptor,
            &raw mut present,
            &raw mut dacl,
            &raw mut defaulted,
        )
    };
    let name = wide(path);
    let result = if valid != 0 && present != 0 && !dacl.is_null() {
        // SAFETY: dacl pertenece al descriptor vivo; no cambiamos owner/group.
        unsafe {
            SetNamedSecurityInfoW(
                name.as_ptr(),
                SE_FILE_OBJECT,
                DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION,
                null_mut(),
                null_mut(),
                dacl,
                null(),
            )
        }
    } else {
        1
    };
    // SAFETY: allocation retornada por ConvertStringSecurityDescriptor.
    unsafe {
        LocalFree(descriptor);
    }
    if result == 0 {
        Ok(())
    } else {
        Err(Error::Storage)
    }
}

pub fn replace(from: &Path, to: &Path) -> Result<()> {
    let from = wide(from);
    let to = wide(to);
    // SAFETY: dos cadenas NUL válidas. Mismo directorio; reemplazo durable.
    if unsafe {
        MoveFileExW(
            from.as_ptr(),
            to.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    } == 0
    {
        return Err(Error::Storage);
    }
    Ok(())
}

fn crypt(bytes: &[u8], context: &str, decrypt: bool) -> Result<Zeroizing<Vec<u8>>> {
    let input = CRYPT_INTEGER_BLOB {
        cbData: u32::try_from(bytes.len()).map_err(|_| Error::TooLarge)?,
        pbData: bytes.as_ptr().cast_mut(),
    };
    let entropy = CRYPT_INTEGER_BLOB {
        cbData: u32::try_from(context.len()).map_err(|_| Error::Storage)?,
        pbData: context.as_ptr().cast_mut(),
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: null_mut(),
    };
    // SAFETY: blobs apuntan a slices vivos y longitudes comprobadas; APIs no
    // modifican entrada. Sin LOCAL_MACHINE, sin UI, salida propiedad LocalFree.
    let ok = unsafe {
        if decrypt {
            CryptUnprotectData(
                &raw const input,
                null_mut(),
                &raw const entropy,
                null(),
                null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &raw mut output,
            )
        } else {
            CryptProtectData(
                &raw const input,
                null(),
                &raw const entropy,
                null(),
                null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &raw mut output,
            )
        }
    };
    if ok == 0 || output.pbData.is_null() {
        return Err(Error::Storage);
    }
    // SAFETY: salida válida con cbData bytes hasta liberación.
    let data = unsafe { std::slice::from_raw_parts_mut(output.pbData, output.cbData as usize) };
    let copy = Zeroizing::new(data.to_vec());
    zeroize::Zeroize::zeroize(data);
    // SAFETY: allocation DPAPI ya copiada y limpiada.
    unsafe {
        LocalFree(output.pbData.cast());
    }
    Ok(copy)
}

pub fn protect(bytes: &[u8], context: &str) -> Result<Vec<u8>> {
    Ok(crypt(bytes, context, false)?.to_vec())
}
pub fn unprotect(bytes: &[u8], context: &str) -> Result<Zeroizing<Vec<u8>>> {
    crypt(bytes, context, true)
}
