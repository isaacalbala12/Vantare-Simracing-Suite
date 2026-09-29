//! Acceso Windows a LMU: proceso en marcha, versión de su ejecutable y memoria
//! compartida `LMU_Data` (solo lectura). Es el único código `unsafe` del
//! adaptador; falla cerrado ante cualquier duda (ningún LMU, varios, versión
//! ilegible) y no recurre nunca a la versión instalada en disco.

use std::ffi::c_void;
use std::io;
use std::os::windows::ffi::OsStrExt;
use std::path::{Path, PathBuf};
use std::ptr::NonNull;

use super::frame::{OBJECT_OUT_SIZE, supports_build};

type Handle = *mut c_void;

const FILE_MAP_READ: u32 = 0x0004;
const SNAP_PROCESS: u32 = 0x0000_0002;
const PROCESS_QUERY_LIMITED_INFORMATION: u32 = 0x1000;
const SYNCHRONIZE: u32 = 0x0010_0000;
const ERROR_NO_MORE_FILES: i32 = 18;
const WAIT_OBJECT_0: u32 = 0;
const WAIT_TIMEOUT: u32 = 258;
const MAX_PATH_UNITS: u32 = 32_768;
const FIXED_SIGNATURE: u32 = 0xFEEF_04BD;
/// Relecturas máximas antes de dar un frame por inestable.
const MAX_STABLE_COMPARISONS: usize = 3;

#[link(name = "kernel32")]
unsafe extern "system" {
    fn OpenFileMappingW(desired_access: u32, inherit_handle: i32, name: *const u16) -> Handle;
    fn MapViewOfFile(
        mapping: Handle,
        desired_access: u32,
        offset_high: u32,
        offset_low: u32,
        bytes_to_map: usize,
    ) -> *mut c_void;
    fn UnmapViewOfFile(address: *const c_void) -> i32;
    fn CloseHandle(handle: Handle) -> i32;
    fn CreateToolhelp32Snapshot(flags: u32, pid: u32) -> Handle;
    fn Process32FirstW(snapshot: Handle, entry: *mut ProcessEntry) -> i32;
    fn Process32NextW(snapshot: Handle, entry: *mut ProcessEntry) -> i32;
    fn OpenProcess(access: u32, inherit: i32, pid: u32) -> Handle;
    fn QueryFullProcessImageNameW(
        process: Handle,
        flags: u32,
        buffer: *mut u16,
        size: *mut u32,
    ) -> i32;
    fn WaitForSingleObject(handle: Handle, milliseconds: u32) -> u32;
}

#[link(name = "version")]
unsafe extern "system" {
    fn GetFileVersionInfoSizeW(path: *const u16, handle: *mut u32) -> u32;
    fn GetFileVersionInfoW(path: *const u16, handle: u32, length: u32, data: *mut c_void) -> i32;
    fn VerQueryValueW(
        data: *const c_void,
        sub_block: *const u16,
        value: *mut *mut c_void,
        length: *mut u32,
    ) -> i32;
}

/// Handle de Win32 con dueño único; se cierra al soltarse.
#[derive(Debug)]
struct OwnedHandle(Handle);

// SAFETY: un handle de Win32 no está ligado a un hilo y este valor es su único
// dueño; las funciones que lo usan (`WaitForSingleObject`, `CloseHandle`) son
// seguras entre hilos.
unsafe impl Send for OwnedHandle {}

impl OwnedHandle {
    fn new(handle: Handle) -> io::Result<Self> {
        if handle.is_null() || handle as usize == usize::MAX {
            Err(io::Error::last_os_error())
        } else {
            Ok(Self(handle))
        }
    }
}

impl Drop for OwnedHandle {
    fn drop(&mut self) {
        // SAFETY: este valor es el único dueño del handle que abrió Win32.
        unsafe { CloseHandle(self.0) };
    }
}

/// Vista de solo lectura de `LMU_Data`.
struct Mapping {
    _handle: OwnedHandle,
    view: NonNull<u8>,
}

// SAFETY: la vista es de solo lectura, tiene un único dueño y no se comparte;
// leerla desde otro hilo no exige nada más que poseer el `Mapping`.
unsafe impl Send for Mapping {}

impl Mapping {
    fn open_named(name: &str) -> io::Result<Self> {
        let name: Vec<u16> = name.encode_utf16().chain(std::iter::once(0)).collect();
        // SAFETY: `name` termina en NUL y vive durante la llamada.
        let handle =
            OwnedHandle::new(unsafe { OpenFileMappingW(FILE_MAP_READ, 0, name.as_ptr()) })?;
        // Mapear exactamente OBJECT_OUT_SIZE falla si el productor creó un
        // objeto menor, antes de que `snapshot` toque bytes fuera de la vista.
        // SAFETY: `handle` es un mapping válido que este valor conserva.
        let view = unsafe { MapViewOfFile(handle.0, FILE_MAP_READ, 0, 0, OBJECT_OUT_SIZE) };
        let view = NonNull::new(view.cast::<u8>()).ok_or_else(io::Error::last_os_error)?;
        Ok(Self {
            _handle: handle,
            view,
        })
    }

    fn snapshot(&self, destination: &mut [u8]) -> io::Result<()> {
        if destination.len() != OBJECT_OUT_SIZE {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "destino de tamaño distinto al layout de LMU",
            ));
        }
        // SAFETY: la vista mapea OBJECT_OUT_SIZE bytes legibles hasta el `Drop`
        // y `destination` es un slice propio, disjunto y de ese tamaño. Que el
        // productor escriba a la vez no rompe la memoria: la copia puede salir
        // rasgada y `read_stable` la descarta.
        unsafe {
            std::ptr::copy_nonoverlapping(
                self.view.as_ptr(),
                destination.as_mut_ptr(),
                OBJECT_OUT_SIZE,
            );
        }
        Ok(())
    }

    fn read_stable(&self, destination: &mut [u8], scratch: &mut [u8]) -> io::Result<()> {
        read_stable_with(destination, scratch, |target| self.snapshot(target))
    }
}

impl Drop for Mapping {
    fn drop(&mut self) {
        // SAFETY: la vista es de este valor y nadie la usa ya; el handle se
        // cierra después, al soltarse `self.handle`.
        unsafe { UnmapViewOfFile(self.view.as_ptr().cast()) };
    }
}

/// Copia hasta que dos lecturas seguidas coinciden: una lectura rasgada por
/// una escritura del productor nunca llega al parser.
fn read_stable_with(
    destination: &mut [u8],
    scratch: &mut [u8],
    mut snapshot: impl FnMut(&mut [u8]) -> io::Result<()>,
) -> io::Result<()> {
    if destination.len() != OBJECT_OUT_SIZE || scratch.len() != OBJECT_OUT_SIZE {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "buffers de tamaño distinto al layout de LMU",
        ));
    }
    snapshot(destination)?;
    for _ in 0..MAX_STABLE_COMPARISONS {
        snapshot(scratch)?;
        if destination == scratch {
            return Ok(());
        }
        destination.copy_from_slice(scratch);
    }
    Err(io::Error::new(
        io::ErrorKind::WouldBlock,
        "el snapshot de LMU no se estabilizó",
    ))
}

#[repr(C)]
struct ProcessEntry {
    size: u32,
    usage: u32,
    pid: u32,
    heap: usize,
    module: u32,
    threads: u32,
    parent_pid: u32,
    priority: i32,
    flags: u32,
    name: [u16; 260],
}

impl ProcessEntry {
    #[allow(clippy::cast_possible_truncation)] // 568 bytes
    fn empty() -> Self {
        Self {
            size: size_of::<Self>() as u32,
            usage: 0,
            pid: 0,
            heap: 0,
            module: 0,
            threads: 0,
            parent_pid: 0,
            priority: 0,
            flags: 0,
            name: [0; 260],
        }
    }

    fn is_lmu(&self) -> bool {
        let end = self
            .name
            .iter()
            .position(|unit| *unit == 0)
            .unwrap_or(self.name.len());
        String::from_utf16_lossy(&self.name[..end]).eq_ignore_ascii_case("Le Mans Ultimate.exe")
    }
}

#[repr(C)]
#[derive(Clone, Copy)]
struct FixedFileInfo {
    signature: u32,
    struct_version: u32,
    file_version_ms: u32,
    file_version_ls: u32,
    product_version_ms: u32,
    product_version_ls: u32,
    file_flags_mask: u32,
    file_flags: u32,
    file_os: u32,
    file_type: u32,
    file_subtype: u32,
    file_date_ms: u32,
    file_date_ls: u32,
}

/// Versión del ejecutable de un proceso LMU concreto y su handle: el handle
/// impide que un PID reciclado pase por el proceso original.
pub(super) struct RunningBuild {
    file_version: String,
    product_version: String,
    process: OwnedHandle,
}

impl RunningBuild {
    /// Solo una build fijada exactamente, con versión de fichero y de producto
    /// idénticas.
    pub(super) fn exact_supported_build(&self) -> Option<&str> {
        (self.file_version == self.product_version && supports_build(&self.file_version))
            .then_some(self.file_version.as_str())
    }

    pub(super) fn file_version(&self) -> &str {
        &self.file_version
    }

    fn ensure_alive(&self) -> io::Result<()> {
        ensure_process_alive(&self.process)
    }
}

fn ensure_process_alive(process: &OwnedHandle) -> io::Result<()> {
    // SAFETY: `process` es un handle válido hasta que retorna la llamada.
    match unsafe { WaitForSingleObject(process.0, 0) } {
        WAIT_TIMEOUT => Ok(()),
        WAIT_OBJECT_0 => Err(io::Error::new(
            io::ErrorKind::NotConnected,
            "el proceso de LMU terminó",
        )),
        _ => Err(io::Error::last_os_error()),
    }
}

/// Proceso de LMU y su mapping, juntos durante una ejecución. Detecta que el
/// productor muere; que la build se admita es otra decisión.
pub(super) struct RunningSource {
    pub build: RunningBuild,
    mapping: Mapping,
}

impl RunningSource {
    pub(super) fn open() -> io::Result<Self> {
        let build = read_running_build()?;
        let mapping = Mapping::open_named("LMU_Data")?;
        build.ensure_alive()?;
        Ok(Self { build, mapping })
    }

    pub(super) fn read_stable(&self, destination: &mut [u8], scratch: &mut [u8]) -> io::Result<()> {
        self.build.ensure_alive()?;
        self.mapping.read_stable(destination, scratch)?;
        self.build.ensure_alive()
    }
}

/// Falla si no hay proceso LMU, hay más de uno o no se puede leer su ruta o
/// versión.
fn read_running_build() -> io::Result<RunningBuild> {
    // SAFETY: el handle del snapshot pasa de inmediato a un `OwnedHandle`.
    let snapshot = OwnedHandle::new(unsafe { CreateToolhelp32Snapshot(SNAP_PROCESS, 0) })?;
    let mut entry = ProcessEntry::empty();
    // SAFETY: `entry` es un PROCESSENTRY32W escribible con su tamaño declarado.
    if unsafe { Process32FirstW(snapshot.0, &raw mut entry) } == 0 {
        return Err(io::Error::last_os_error());
    }
    let mut matching_pid = None;
    loop {
        if entry.is_lmu() && matching_pid.replace(entry.pid).is_some() {
            return Err(io::Error::new(
                io::ErrorKind::AlreadyExists,
                "hay varios procesos de LMU",
            ));
        }
        entry = ProcessEntry::empty();
        // SAFETY: el snapshot sigue vivo y `entry` es escribible.
        if unsafe { Process32NextW(snapshot.0, &raw mut entry) } == 0 {
            let error = io::Error::last_os_error();
            if error.raw_os_error() != Some(ERROR_NO_MORE_FILES) {
                return Err(error);
            }
            break;
        }
    }
    let pid = matching_pid
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "no hay proceso de LMU"))?;
    // SAFETY: `OpenProcess` devuelve un handle que esta función posee.
    let process = OwnedHandle::new(unsafe {
        OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE, 0, pid)
    })?;
    let mut buffer = vec![0_u16; MAX_PATH_UNITS as usize];
    let mut length = MAX_PATH_UNITS;
    // SAFETY: `buffer` admite `length` unidades UTF-16 y `length` es entrada/salida.
    if unsafe { QueryFullProcessImageNameW(process.0, 0, buffer.as_mut_ptr(), &raw mut length) }
        == 0
    {
        return Err(io::Error::last_os_error());
    }
    let executable =
        PathBuf::from(String::from_utf16(&buffer[..length as usize]).map_err(|_| {
            io::Error::new(
                io::ErrorKind::InvalidData,
                "ruta del proceso de LMU inválida",
            )
        })?);
    let (file_version, product_version) = read_file_version(&executable)?;
    ensure_process_alive(&process)?;
    Ok(RunningBuild {
        file_version,
        product_version,
        process,
    })
}

fn read_file_version(path: &Path) -> io::Result<(String, String)> {
    let wide: Vec<u16> = path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    if wide.len() == 1 || wide[..wide.len() - 1].contains(&0) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "ruta de ejecutable inválida",
        ));
    }
    let mut ignored = 0;
    // SAFETY: `wide` termina en NUL y vive durante estas llamadas.
    let size = unsafe { GetFileVersionInfoSizeW(wide.as_ptr(), &raw mut ignored) };
    if size == 0 {
        return Err(io::Error::last_os_error());
    }
    let mut data = vec![0_u8; size as usize];
    // SAFETY: `data` es un buffer escribible del tamaño informado.
    if unsafe { GetFileVersionInfoW(wide.as_ptr(), 0, size, data.as_mut_ptr().cast()) } == 0 {
        return Err(io::Error::last_os_error());
    }
    let root = [u16::from(b'\\'), 0];
    let mut value: *mut c_void = std::ptr::null_mut();
    let mut length = 0;
    // SAFETY: los punteros son válidos durante la llamada; `value` apunta dentro
    // de `data`, que sigue vivo mientras se copia por valor.
    if unsafe {
        VerQueryValueW(
            data.as_ptr().cast(),
            root.as_ptr(),
            &raw mut value,
            &raw mut length,
        )
    } == 0
        || value.is_null()
        || (length as usize) < size_of::<FixedFileInfo>()
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "el ejecutable no trae versión fija",
        ));
    }
    // SAFETY: `VerQueryValueW` devolvió al menos el tamaño de la estructura fija
    // y `read_unaligned` no asume alineación del buffer ajeno.
    let fixed = unsafe { std::ptr::read_unaligned(value.cast::<FixedFileInfo>()) };
    if fixed.signature != FIXED_SIGNATURE {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "firma de versión fija inválida",
        ));
    }
    Ok((
        format_version(fixed.file_version_ms, fixed.file_version_ls),
        format_version(fixed.product_version_ms, fixed.product_version_ls),
    ))
}

fn format_version(ms: u32, ls: u32) -> String {
    format!("{}.{}.{}.{}", ms >> 16, ms & 0xffff, ls >> 16, ls & 0xffff)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::{Command, Stdio};
    use std::sync::atomic::{AtomicU64, Ordering};

    const PAGE_READWRITE: u32 = 0x04;
    const FILE_MAP_WRITE: u32 = 0x0002;
    static TEST_ID: AtomicU64 = AtomicU64::new(0);

    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn CreateFileMappingW(
            file: Handle,
            attributes: *const c_void,
            protect: u32,
            maximum_high: u32,
            maximum_low: u32,
            name: *const u16,
        ) -> Handle;
    }

    fn private_mapping(size: u32) -> (String, OwnedHandle) {
        let name = format!(
            "vantare-runtime-test-{}-{}",
            std::process::id(),
            TEST_ID.fetch_add(1, Ordering::Relaxed)
        );
        let wide: Vec<u16> = name.encode_utf16().chain(std::iter::once(0)).collect();
        // SAFETY: INVALID_HANDLE_VALUE elige un mapping respaldado por el
        // pagefile; `wide` termina en NUL y vive durante la llamada.
        let owner = unsafe {
            CreateFileMappingW(
                usize::MAX as Handle,
                std::ptr::null(),
                PAGE_READWRITE,
                0,
                size,
                wide.as_ptr(),
            )
        };
        (name, OwnedHandle::new(owner).unwrap())
    }

    #[test]
    fn opens_a_private_mapping_and_copies_a_stable_snapshot() {
        let (name, owner) = private_mapping(u32::try_from(OBJECT_OUT_SIZE).unwrap());
        // SAFETY: `owner` es un mapping válido con protección de escritura.
        let writer = unsafe { MapViewOfFile(owner.0, FILE_MAP_WRITE, 0, 0, OBJECT_OUT_SIZE) };
        assert!(!writer.is_null(), "{}", io::Error::last_os_error());
        // SAFETY: el test es dueño de esta vista escribible.
        unsafe { *writer.cast::<u8>().add(1_736) = 44 };
        let mapping = Mapping::open_named(&name).unwrap();
        let mut destination = vec![0; OBJECT_OUT_SIZE];
        let mut scratch = vec![0; OBJECT_OUT_SIZE];
        assert!(
            mapping
                .snapshot(&mut destination[..OBJECT_OUT_SIZE - 1])
                .is_err()
        );
        mapping.read_stable(&mut destination, &mut scratch).unwrap();
        assert_eq!(destination[1_736], 44);
        drop(mapping);
        // SAFETY: `writer` es de este test y no se usa después.
        unsafe { UnmapViewOfFile(writer) };
    }

    #[test]
    fn a_mapping_smaller_than_the_layout_is_rejected() {
        let (name, _owner) = private_mapping(4);
        assert!(Mapping::open_named(&name).is_err());
        assert!(Mapping::open_named("vantare-runtime-test-inexistente").is_err());
    }

    #[test]
    fn stable_read_accepts_recovery_and_rejects_continuous_mutation() {
        let mut destination = vec![0; OBJECT_OUT_SIZE];
        let mut scratch = vec![0; OBJECT_OUT_SIZE];
        assert_eq!(
            read_stable_with(&mut destination, &mut [0; 4], |_| Ok(()))
                .unwrap_err()
                .kind(),
            io::ErrorKind::InvalidInput
        );
        let mut snapshots = [1_u8, 2, 2].into_iter();
        read_stable_with(&mut destination, &mut scratch, |target| {
            target[0] = snapshots.next().expect("tres snapshots acotados");
            Ok(())
        })
        .unwrap();
        assert_eq!(destination[0], 2);

        let mut next = 0_u8;
        let error = read_stable_with(&mut destination, &mut scratch, |target| {
            next += 1;
            target[0] = next;
            Ok(())
        })
        .unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::WouldBlock);
    }

    #[test]
    fn process_entry_matches_only_the_exact_executable_name() {
        assert_eq!(size_of::<ProcessEntry>(), 568);
        let mut entry = ProcessEntry::empty();
        for (slot, unit) in entry
            .name
            .iter_mut()
            .zip("Le Mans Ultimate.exe".encode_utf16())
        {
            *slot = unit;
        }
        assert!(entry.is_lmu());
        entry.name[0] = u16::from(b'X');
        assert!(!entry.is_lmu());
    }

    #[test]
    fn a_retained_handle_detects_process_exit() {
        let mut child = Command::new("cmd")
            .args(["/C", "more"])
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .spawn()
            .expect("arrancar un hijo que espera entrada");
        // SAFETY: `OpenProcess` devuelve un handle que este test posee.
        let process = OwnedHandle::new(unsafe {
            OpenProcess(
                PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE,
                0,
                child.id(),
            )
        })
        .expect("abrir el proceso hijo");
        ensure_process_alive(&process).expect("el hijo sigue esperando");
        drop(child.stdin.take());
        child.wait().expect("el hijo termina al cerrar su entrada");
        assert_eq!(
            ensure_process_alive(&process).unwrap_err().kind(),
            io::ErrorKind::NotConnected
        );
    }

    #[test]
    fn versions_are_formatted_and_pinned_exactly() {
        assert_eq!(format_version(1 << 16 | 4, 1 << 16 | 3), "1.4.1.3");
        let build = |file: &str, product: &str| RunningBuild {
            file_version: file.into(),
            product_version: product.into(),
            // Handle inerte: no se usa en `exact_supported_build`.
            process: OwnedHandle(std::ptr::null_mut()),
        };
        for version in ["1.3.0.0", "1.4.0.0", "1.4.1.3", "1.4.2.0"] {
            assert_eq!(
                build(version, version).exact_supported_build(),
                Some(version)
            );
        }
        for (file, product) in [
            ("1.4.2.1", "1.4.2.1"),
            ("1.4.1.3", "1.4.0.0"),
            ("1.4.1.2", "1.4.1.2"),
        ] {
            assert_eq!(build(file, product).exact_supported_build(), None);
        }
    }

    /// Prueba física opt-in: `cargo test -- --ignored live_lmu` con LMU en marcha.
    #[test]
    #[ignore = "requiere LMU en marcha"]
    fn live_lmu_source_reads_a_stable_frame_of_an_exact_build() {
        let source = RunningSource::open().expect("LMU y LMU_Data abiertos");
        let build = source
            .build
            .exact_supported_build()
            .expect("build soportada")
            .to_owned();
        let mut frame = vec![0; OBJECT_OUT_SIZE];
        let mut scratch = vec![0; OBJECT_OUT_SIZE];
        source
            .read_stable(&mut frame, &mut scratch)
            .expect("frame estable");
        super::super::frame::admit(&frame, &build).expect("frame admitido");
    }
}
