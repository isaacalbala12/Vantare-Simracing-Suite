//! SHA-256 por `BCrypt` (Windows 7+), streaming acotado, sin proceso ni dependencia.
use std::{ffi::c_void, fs::File, io::Read, path::Path, ptr};
type Handle = *mut c_void;
const HEX: &[u8; 16] = b"0123456789abcdef";
#[link(name = "kernel32")]
// SAFETY: firma UINT GetDriveTypeW(LPCWSTR) del SDK Windows.
unsafe extern "system" {
    #[link_name = "GetDriveTypeW"]
    fn drive_type(root: *const u16) -> u32;
}
pub fn local(path: &Path) -> bool {
    let Ok(path) = std::path::absolute(path) else {
        return false;
    };
    let Some(std::path::Component::Prefix(prefix)) = path.components().next() else {
        return false;
    };
    let std::path::Prefix::Disk(letter) = prefix.kind() else {
        return false;
    };
    let root = [u16::from(letter), u16::from(b':'), u16::from(b'\\'), 0];
    // SAFETY: ruta de unidad UTF-16 terminada en NUL. No se enumeran shares.
    matches!(unsafe { drive_type(root.as_ptr()) }, 2 | 3 | 6)
}
#[link(name = "bcrypt")]
// SAFETY: firmas NTSTATUS/BCRYPT_HANDLE del SDK Windows; longitudes comprobadas al llamar.
unsafe extern "system" {
    #[link_name = "BCryptOpenAlgorithmProvider"]
    fn open(out: *mut Handle, algorithm: *const u16, provider: *const u16, flags: u32) -> i32;
    #[link_name = "BCryptCloseAlgorithmProvider"]
    fn close(handle: Handle, flags: u32) -> i32;
    #[link_name = "BCryptCreateHash"]
    fn create(
        algorithm: Handle,
        out: *mut Handle,
        object: *mut u8,
        size: u32,
        secret: *mut u8,
        secret_size: u32,
        flags: u32,
    ) -> i32;
    #[link_name = "BCryptHashData"]
    fn update(hash: Handle, data: *mut u8, size: u32, flags: u32) -> i32;
    #[link_name = "BCryptFinishHash"]
    fn finish(hash: Handle, out: *mut u8, size: u32, flags: u32) -> i32;
    #[link_name = "BCryptDestroyHash"]
    fn destroy(hash: Handle) -> i32;
}
struct Algorithm(Handle);
impl Drop for Algorithm {
    fn drop(&mut self) {
        // SAFETY: proveedor válido, dueño único; los hashes ya se destruyeron.
        let status = unsafe { close(self.0, 0) };
        if status < 0 {
            eprintln!("Testing Center: no se pudo cerrar el proveedor SHA-256");
        }
    }
}
struct Hash(Handle);
impl Drop for Hash {
    fn drop(&mut self) {
        // SAFETY: hash válido creado por BCrypt, dueño único.
        let status = unsafe { destroy(self.0) };
        if status < 0 {
            eprintln!("Testing Center: no se pudo cerrar SHA-256");
        }
    }
}
pub fn sha256(path: &Path) -> Result<String, ()> {
    let mut file = File::open(path).map_err(|_| ())?;
    if file.metadata().map_err(|_| ())?.len() > 512 * 1024 * 1024 {
        return Err(());
    }
    let name: Vec<u16> = "SHA256\0".encode_utf16().collect();
    let mut algorithm = ptr::null_mut();
    // SAFETY: salida válida y nombre UTF-16 terminado en NUL; proveedor de sistema.
    if unsafe { open(&raw mut algorithm, name.as_ptr(), ptr::null(), 0) } < 0 {
        return Err(());
    }
    let algorithm = Algorithm(algorithm);
    let mut hash = ptr::null_mut();
    // SAFETY: proveedor válido; Windows 7+ asigna/libera el objeto al pasar null/0.
    if unsafe {
        create(
            algorithm.0,
            &raw mut hash,
            ptr::null_mut(),
            0,
            ptr::null_mut(),
            0,
            0,
        )
    } < 0
    {
        return Err(());
    }
    let hash = Hash(hash);
    let mut buffer = vec![0; 64 * 1024];
    let mut total = 0_u64;
    loop {
        let count = file.read(&mut buffer).map_err(|_| ())?;
        if count == 0 {
            break;
        }
        total += u64::try_from(count).map_err(|_| ())?;
        if total > 512 * 1024 * 1024 {
            return Err(());
        }
        let count = u32::try_from(count).map_err(|_| ())?;
        // SAFETY: hash vivo y buffer mutable con al menos count bytes inicializados.
        if unsafe { update(hash.0, buffer.as_mut_ptr(), count, 0) } < 0 {
            return Err(());
        }
    }
    let mut digest = [0; 32];
    // SAFETY: SHA256 produce exactamente los 32 bytes del buffer de salida.
    if unsafe { finish(hash.0, digest.as_mut_ptr(), 32, 0) } < 0 {
        return Err(());
    }
    Ok(digest
        .iter()
        .flat_map(|byte| {
            [
                char::from(HEX[usize::from(byte >> 4)]),
                char::from(HEX[usize::from(byte & 15)]),
            ]
        })
        .collect())
}
