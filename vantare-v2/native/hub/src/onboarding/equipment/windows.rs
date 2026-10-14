//! ABI mínimo del SDK Windows; no procesos, WMI, red ni permisos de escritura.
use super::Equipment;
use std::ffi::c_void;

#[repr(C)]
#[derive(Default)]
struct MemoryStatus {
    length: u32,
    load: u32,
    total_physical: u64,
    available_physical: u64,
    total_page: u64,
    available_page: u64,
    total_virtual: u64,
    available_virtual: u64,
    available_extended: u64,
}
#[link(name = "kernel32")]
// SAFETY: BOOL/DWORD y MEMORYSTATUSEX / SYSTEM_LOGICAL_PROCESSOR_INFORMATION_EX del SDK.
unsafe extern "system" {
    fn GlobalMemoryStatusEx(status: *mut MemoryStatus) -> i32;
    fn GetLogicalProcessorInformationEx(
        relation: i32,
        buffer: *mut c_void,
        length: *mut u32,
    ) -> i32;
}
#[link(name = "advapi32")]
// SAFETY: RRF_RT_REG_SZ solicita únicamente strings; buffer y tamaño en bytes.
unsafe extern "system" {
    fn RegGetValueW(
        key: *mut c_void,
        subkey: *const u16,
        name: *const u16,
        flags: u32,
        kind: *mut u32,
        data: *mut c_void,
        size: *mut u32,
    ) -> i32;
}
fn cpu_name() -> Option<String> {
    let path: Vec<_> = r"HARDWARE\DESCRIPTION\System\CentralProcessor\0"
        .encode_utf16()
        .chain(Some(0))
        .collect();
    let name: Vec<_> = "ProcessorNameString"
        .encode_utf16()
        .chain(Some(0))
        .collect();
    let mut buffer = [0u16; 256];
    let mut bytes = 512;
    // SAFETY: pseudo-HKEY HKLM según SDK, dos strings NUL, buffer válido de 512 bytes;
    // no abre HKEY ni necesita cierre, RRF_RT_REG_SZ limita el tipo a UTF-16.
    let status = unsafe {
        RegGetValueW(
            -2_147_483_646_isize as *mut c_void,
            path.as_ptr(),
            name.as_ptr(),
            2,
            std::ptr::null_mut(),
            buffer.as_mut_ptr().cast(),
            &raw mut bytes,
        )
    };
    if status != 0 {
        return None;
    }
    let length = buffer
        .iter()
        .position(|ch| *ch == 0)
        .unwrap_or(buffer.len());
    let name = String::from_utf16(&buffer[..length])
        .ok()?
        .trim()
        .to_owned();
    (!name.is_empty()).then_some(name)
}
fn count_cores(bytes: &[u8]) -> Option<u32> {
    let mut offset = 0;
    let mut cores = 0u32;
    while offset < bytes.len() {
        let header = bytes.get(offset..offset.checked_add(8)?)?;
        let relation = u32::from_ne_bytes(header[..4].try_into().ok()?);
        let size = usize::try_from(u32::from_ne_bytes(header[4..8].try_into().ok()?)).ok()?;
        if relation != 0 || size < 8 {
            return None;
        }
        offset = offset.checked_add(size)?;
        if offset > bytes.len() {
            return None;
        }
        cores = cores.checked_add(1)?;
    }
    (cores > 0).then_some(cores)
}
fn cores() -> Option<u32> {
    let mut bytes = 0u32;
    // SAFETY: consulta inicial con buffer nulo para obtener su tamaño, RelationProcessorCore=0.
    unsafe {
        GetLogicalProcessorInformationEx(0, std::ptr::null_mut(), &raw mut bytes);
    }
    // Límite defensivo; el buffer u64 garantiza alineación incluso con varios grupos CPU.
    if bytes == 0 || bytes > 1024 * 1024 {
        return None;
    }
    let capacity = bytes;
    let mut buffer = vec![0u64; usize::try_from(bytes).ok()?.div_ceil(8)];
    // SAFETY: memoria propia inicializada, capacidad >= bytes, longitud válida durante la llamada.
    if unsafe { GetLogicalProcessorInformationEx(0, buffer.as_mut_ptr().cast(), &raw mut bytes) }
        == 0
        || bytes > capacity
    {
        return None;
    }
    // SAFETY: vista de bytes de u64 inicializados; tamaño escrito comprobado dentro de capacidad.
    count_cores(unsafe {
        std::slice::from_raw_parts(buffer.as_ptr().cast(), usize::try_from(bytes).ok()?)
    })
}

#[repr(C)]
struct Guid {
    first: u32,
    second: u16,
    third: u16,
    last: [u8; 8],
}
const FACTORY_IID: Guid = Guid {
    first: 0x770a_ae78,
    second: 0xf26f,
    third: 0x4dba,
    last: [0xa8, 0x29, 0x25, 0x3c, 0x83, 0xd1, 0xb3, 0x87],
};
#[repr(C)]
struct AdapterDesc {
    name: [u16; 128],
    vendor: u32,
    device: u32,
    subsystem: u32,
    revision: u32,
    video_memory: usize,
    system_memory: usize,
    shared_memory: usize,
    luid_low: u32,
    luid_high: i32,
    flags: u32,
}
#[repr(C)]
struct FactoryVtable {
    unknown: [usize; 2],
    release: unsafe extern "system" fn(*mut c_void) -> u32,
    object_and_factory: [usize; 9],
    enumerate: unsafe extern "system" fn(*mut Factory, u32, *mut *mut Adapter) -> i32,
}
#[repr(C)]
struct AdapterVtable {
    unknown: [usize; 2],
    release: unsafe extern "system" fn(*mut c_void) -> u32,
    object_and_adapter: [usize; 7],
    description: unsafe extern "system" fn(*mut Adapter, *mut AdapterDesc) -> i32,
}
#[repr(C)]
struct Factory {
    vtable: *const FactoryVtable,
}
#[repr(C)]
struct Adapter {
    vtable: *const AdapterVtable,
}
#[link(name = "dxgi")]
// SAFETY: HRESULT / REFIID / void** según SDK; solo IID_IDXGIFactory1.
unsafe extern "system" {
    fn CreateDXGIFactory1(iid: *const Guid, factory: *mut *mut Factory) -> i32;
}
struct OwnedFactory(*mut Factory);
impl Drop for OwnedFactory {
    fn drop(&mut self) {
        // SAFETY: interfaz no nula creada por DXGI, una referencia propia; último uso antes de Release.
        unsafe {
            ((*(*self.0).vtable).release)(self.0.cast());
        }
    }
}
struct OwnedAdapter(*mut Adapter);
impl Drop for OwnedAdapter {
    fn drop(&mut self) {
        // SAFETY: EnumAdapters1 añade una referencia propia; liberarla una sola vez al salir del ámbito.
        unsafe {
            ((*(*self.0).vtable).release)(self.0.cast());
        }
    }
}
fn gpu_name() -> Option<String> {
    let mut factory = std::ptr::null_mut();
    // SAFETY: IID válida, salida válida; DXGI no requiere CoInitialize para su factory.
    if unsafe { CreateDXGIFactory1(&FACTORY_IID, &raw mut factory) } < 0 || factory.is_null() {
        return None;
    }
    let factory = OwnedFactory(factory);
    for index in 0..32 {
        let mut adapter = std::ptr::null_mut();
        // SAFETY: factory viva, slot 12 de IDXGIFactory1, salida válida sin alias con la factory.
        if unsafe { ((*(*factory.0).vtable).enumerate)(factory.0, index, &raw mut adapter) } < 0
            || adapter.is_null()
        {
            break;
        }
        let adapter = OwnedAdapter(adapter);
        let mut description = std::mem::MaybeUninit::<AdapterDesc>::uninit();
        // SAFETY: slot 10 de IDXGIAdapter1, memoria alineada del tamaño DXGI_ADAPTER_DESC1.
        if unsafe { ((*(*adapter.0).vtable).description)(adapter.0, description.as_mut_ptr()) } < 0
        {
            continue;
        }
        // SAFETY: GetDesc1 completó la estructura; ningún campo tiene representaciones inválidas.
        let description = unsafe { description.assume_init() };
        if description.flags & 2 != 0 {
            continue;
        } // DXGI_ADAPTER_FLAG_SOFTWARE.
        let length = description
            .name
            .iter()
            .position(|ch| *ch == 0)
            .unwrap_or(128);
        let name = String::from_utf16(&description.name[..length])
            .ok()?
            .trim()
            .to_owned();
        if !name.is_empty() {
            return Some(name);
        }
    }
    None
}
pub(super) fn detect() -> Equipment {
    let mut memory = MemoryStatus {
        length: 64,
        ..MemoryStatus::default()
    };
    // SAFETY: MEMORYSTATUSEX alineada/inicializada, dwLength=sizeof; solo escribe este buffer.
    let ram_bytes = (unsafe { GlobalMemoryStatusEx(&raw mut memory) } != 0)
        .then_some(memory.total_physical)
        .filter(|n| *n > 0);
    Equipment {
        cpu: cpu_name(),
        cores: cores(),
        ram_bytes,
        gpu: gpu_name(),
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn topology_rejects_truncation_and_nonadvancing_records() {
        let mut bytes = [0u8; 96];
        bytes[4..8].copy_from_slice(&48u32.to_ne_bytes());
        bytes[52..56].copy_from_slice(&48u32.to_ne_bytes());
        assert_eq!(count_cores(&bytes), Some(2));
        assert_eq!(count_cores(&bytes[..95]), None);
        assert_eq!(count_cores(&[0; 8]), None);
        assert_eq!(count_cores(&[]), None);
    }
    #[test]
    fn sdk_layouts_match_windows_abi() {
        assert_eq!(std::mem::size_of::<MemoryStatus>(), 64);
        assert_eq!(
            std::mem::offset_of!(FactoryVtable, enumerate),
            12 * std::mem::size_of::<usize>()
        );
        assert_eq!(
            std::mem::offset_of!(AdapterVtable, description),
            10 * std::mem::size_of::<usize>()
        );
        #[cfg(target_pointer_width = "64")]
        assert_eq!(std::mem::size_of::<AdapterDesc>(), 312);
    }
}
