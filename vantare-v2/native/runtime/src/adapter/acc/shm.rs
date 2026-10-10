//! Único unsafe del adaptador: mappings Win32 de solo lectura y carpeta Documentos.
use std::io;
use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
use std::path::PathBuf;
use std::ptr::NonNull;

#[cfg(test)]
#[path = "../../../tests/acc/shm.rs"]
mod tests;

use windows_sys::Win32::System::Memory::{
    FILE_MAP_READ, MEMORY_MAPPED_VIEW_ADDRESS, MapViewOfFile, OpenFileMappingW, UnmapViewOfFile,
};

pub(super) struct Page {
    handle: OwnedHandle,
    view: NonNull<u8>,
    size: usize,
}

impl Page {
    pub(super) fn open(name: &str, size: usize) -> io::Result<Self> {
        let name: Vec<u16> = name.encode_utf16().chain([0]).collect();
        // SAFETY: nombre UTF-16 terminado en NUL, válido durante la llamada.
        let raw = unsafe { OpenFileMappingW(FILE_MAP_READ, 0, name.as_ptr()) };
        if raw.is_null() {
            return Err(io::Error::last_os_error());
        }
        // SAFETY: handle nuevo, con un solo dueño; se cerrará en Drop.
        let handle = unsafe { OwnedHandle::from_raw_handle(raw) };
        // SAFETY: handle vivo, vista de solo lectura; el tamaño se fija al layout.
        let raw = unsafe { MapViewOfFile(handle.as_raw_handle(), FILE_MAP_READ, 0, 0, size) };
        let view = NonNull::new(raw.Value.cast()).ok_or_else(io::Error::last_os_error)?;
        Ok(Self { handle, view, size })
    }

    fn copy(&self) -> Vec<u8> {
        let mut bytes = vec![0; self.size];
        // SAFETY: mapping vivo de size bytes y destino propio de igual tamaño.
        // Volátil: el productor externo puede escribir; stable descarta rasgados.
        for (i, b) in bytes.iter_mut().enumerate() {
            // SAFETY: i < size, garantizado por la longitud del destino.
            *b = unsafe { self.view.as_ptr().add(i).read_volatile() };
        }
        bytes
    }

    fn packet(&self) -> [u8; 4] {
        let mut packet = [0; 4];
        for (i, b) in packet.iter_mut().enumerate() {
            // SAFETY: las páginas abiertas miden al menos 800 bytes.
            *b = unsafe { self.view.as_ptr().add(i).read_volatile() };
        }
        packet
    }

    pub(super) fn stable(&self, numbered: bool) -> io::Result<Vec<u8>> {
        for _ in 0..4 {
            let before = self.packet();
            let bytes = self.copy();
            if numbered {
                if before == self.packet() && bytes[..4] == before {
                    return Ok(bytes);
                }
            } else if bytes == self.copy() {
                return Ok(bytes);
            }
        }
        Err(io::Error::from(io::ErrorKind::WouldBlock))
    }
}

impl Drop for Page {
    fn drop(&mut self) {
        // SAFETY: vista propia sin usuarios; handle vive hasta después de desmapear.
        unsafe {
            UnmapViewOfFile(MEMORY_MAPPED_VIEW_ADDRESS {
                Value: self.view.as_ptr().cast(),
            });
        }
        let _ = &self.handle;
    }
}

pub(super) fn config_path() -> io::Result<PathBuf> {
    use windows_sys::Win32::System::Com::CoTaskMemFree;
    use windows_sys::Win32::UI::Shell::{FOLDERID_Documents, SHGetKnownFolderPath};
    let mut raw = std::ptr::null_mut();
    // SAFETY: parámetro de salida válido; se pide la carpeta del usuario actual.
    let result =
        unsafe { SHGetKnownFolderPath(&FOLDERID_Documents, 0, std::ptr::null_mut(), &raw mut raw) };
    if result < 0 || raw.is_null() {
        return Err(io::Error::other("no se pudo localizar Documentos"));
    }
    let mut units = Vec::new();
    let mut i = 0;
    loop {
        // SAFETY: el shell garantiza cadena UTF-16 terminada en NUL.
        let unit = unsafe { *raw.add(i) };
        if unit == 0 {
            break;
        }
        units.push(unit);
        i += 1;
    }
    // SAFETY: puntero entregado por el shell, se libera exactamente una vez.
    unsafe {
        CoTaskMemFree(raw.cast());
    }
    Ok(PathBuf::from(String::from_utf16_lossy(&units))
        .join("Assetto Corsa Competizione/Config/broadcasting.json"))
}
