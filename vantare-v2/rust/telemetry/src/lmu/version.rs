//! Read fixed Windows version evidence from an independently selected LMU executable.
//! The future process owner must bind this path to the producer of LMU_Data.

use std::ffi::c_void;
use std::io;
use std::os::windows::ffi::OsStrExt;
use std::path::Path;

const FIXED_SIGNATURE: u32 = 0xFEEF_04BD;

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

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BuildEvidence {
    pub file_version: String,
    pub product_version: String,
}

impl BuildEvidence {
    pub fn exact_supported_build(&self) -> Option<&str> {
        (self.file_version == self.product_version
            && super::supports_build(self.file_version.as_str()))
        .then_some(self.file_version.as_str())
    }
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

pub fn read_file_version(path: &Path) -> io::Result<BuildEvidence> {
    let wide: Vec<u16> = path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    if wide.len() == 1 || wide[..wide.len() - 1].contains(&0) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "invalid executable path",
        ));
    }
    let mut ignored = 0;
    // SAFETY: wide is NUL-terminated and remains alive throughout these calls.
    let size = unsafe { GetFileVersionInfoSizeW(wide.as_ptr(), &mut ignored) };
    if size == 0 {
        return Err(io::Error::last_os_error());
    }
    let mut data = vec![0_u8; size as usize];
    // SAFETY: data is a writable buffer of the reported size.
    if unsafe { GetFileVersionInfoW(wide.as_ptr(), 0, size, data.as_mut_ptr().cast()) } == 0 {
        return Err(io::Error::last_os_error());
    }
    let root = [b'\\' as u16, 0];
    let mut value: *mut c_void = std::ptr::null_mut();
    let mut length = 0;
    // SAFETY: all pointers are valid for the duration of the call; value points
    // into data and is copied by value only while data remains alive.
    if unsafe { VerQueryValueW(data.as_ptr().cast(), root.as_ptr(), &mut value, &mut length) } == 0
        || value.is_null()
        || length < std::mem::size_of::<FixedFileInfo>() as u32
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "missing fixed file version",
        ));
    }
    // SAFETY: VerQueryValueW returned at least the fixed structure size, and
    // read_unaligned does not assume alignment of the foreign buffer.
    let fixed = unsafe { std::ptr::read_unaligned(value.cast::<FixedFileInfo>()) };
    if fixed.signature != FIXED_SIGNATURE {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "invalid fixed version signature",
        ));
    }
    Ok(BuildEvidence {
        file_version: format_version(fixed.file_version_ms, fixed.file_version_ls),
        product_version: format_version(fixed.product_version_ms, fixed.product_version_ls),
    })
}

fn format_version(ms: u32, ls: u32) -> String {
    format!("{}.{}.{}.{}", ms >> 16, ms & 0xffff, ls >> 16, ls & 0xffff)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_and_product_must_match_an_exact_pinned_build() {
        assert_eq!(format_version(1 << 16 | 4, 1 << 16 | 3), "1.4.1.3");
        for version in ["1.3.0.0", "1.4.0.0", "1.4.1.3"] {
            let evidence = BuildEvidence {
                file_version: version.into(),
                product_version: version.into(),
            };
            assert_eq!(evidence.exact_supported_build(), Some(version));
        }
        for (file, product) in [
            ("1.4.2.0", "1.4.2.0"),
            ("1.4.1.3", "1.4.0.0"),
            ("1.4.1.2", "1.4.1.2"),
        ] {
            let evidence = BuildEvidence {
                file_version: file.into(),
                product_version: product.into(),
            };
            assert_eq!(evidence.exact_supported_build(), None);
        }
    }

    #[test]
    fn installed_lmu_version_is_diagnostic_only() {
        let Some(path) = std::env::var_os("VANTARE_LMU_EXE_TEST_PATH") else {
            return;
        };
        let evidence = read_file_version(Path::new(&path)).expect("installed LMU version resource");
        assert_eq!(evidence.file_version, "1.4.2.0");
        assert_eq!(evidence.product_version, "1.4.2.0");
        assert_eq!(evidence.exact_supported_build(), None);
    }
}
