use super::{Equipment, PerformanceLevel};
#[cfg(windows)]
#[allow(unsafe_code)] // Read-only Windows SDK boundary copied from the frozen Hub.
#[path = "equipment_windows.rs"]
mod windows;
#[cfg(any(windows, test))]
fn cpu_label(name: &str) -> Option<String> {
    let name: String = name
        .chars()
        .filter(|c| !c.is_control())
        .take(super::CPU_LIMIT)
        .collect();
    (!name.trim().is_empty()).then_some(name)
}
#[cfg(any(windows, test))]
fn gpu_label(
    flags: u32,
    name: &[u16; super::GPU_UTF16_LIMIT],
) -> Result<Option<String>, std::string::FromUtf16Error> {
    // DXGI_ADAPTER_FLAG_SOFTWARE: same exclusion and ordering as GPUI.
    if flags & 2 != 0 {
        return Ok(None);
    }
    let length = name.iter().position(|ch| *ch == 0).unwrap_or(name.len());
    let name = String::from_utf16(&name[..length])?.trim().to_owned();
    Ok((!name.is_empty()).then_some(name))
}
impl Equipment {
    pub fn detect() -> Self {
        #[cfg(windows)]
        {
            windows::detect()
        }
        #[cfg(not(windows))]
        {
            Self::default()
        }
    }
    pub fn recommended_level(&self) -> PerformanceLevel {
        if self.cores.is_some_and(|n| n <= 4)
            || self.ram_bytes.map_or_else(
                || self.ram_gb.is_some_and(|n| n < 8),
                |n| n < 8 * 1024 * 1024 * 1024,
            )
        {
            PerformanceLevel::Economy
        } else {
            PerformanceLevel::Balanced
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn gpu_description_keeps_the_native_utf16_bound_and_trim_rules() {
        let mut name = [0u16; super::super::GPU_UTF16_LIMIT];
        let value: Vec<_> = "  RTX 3070  ".encode_utf16().collect();
        name[..value.len()].copy_from_slice(&value);
        name[value.len() + 1] = u16::MAX; // Bytes after the first NUL are ignored.
        assert_eq!(gpu_label(0, &name).unwrap(), Some("RTX 3070".into()));
        assert_eq!(
            gpu_label(0, &[0; super::super::GPU_UTF16_LIMIT]).unwrap(),
            None
        );
        assert_eq!(
            gpu_label(0, &[u16::from(b'x'); super::super::GPU_UTF16_LIMIT])
                .unwrap()
                .unwrap()
                .encode_utf16()
                .count(),
            super::super::GPU_UTF16_LIMIT
        );
        name[0] = 0xd800;
        name[1] = 0;
        assert!(gpu_label(0, &name).is_err());
        assert_eq!(gpu_label(2, &name).unwrap(), None);
        assert_eq!(gpu_label(6, &name).unwrap(), None);
    }
    #[test]
    fn equipment_wire_exposes_only_labels_and_counts() {
        let value = serde_json::to_value(Equipment {
            gpu: Some("RTX 3070".into()),
            ..Equipment::default()
        })
        .unwrap();
        assert_eq!(
            value,
            serde_json::json!({"cpu":null,"gpu":"RTX 3070","cores":null,"ramGb":null})
        );
    }
    #[test]
    fn cpu_name_is_bounded_and_never_empty_after_sanitizing() {
        for name in ["", " ", "\0\u{7f}"] {
            assert_eq!(cpu_label(name), None);
        }
        assert_eq!(cpu_label("CPU\0"), Some("CPU".into()));
        assert_eq!(
            cpu_label(&"a".repeat(super::super::CPU_LIMIT + 1))
                .unwrap()
                .chars()
                .count(),
            super::super::CPU_LIMIT
        );
    }
    #[test]
    fn recommendation_uses_real_hardware_without_inventing_missing_values() {
        assert_eq!(
            Equipment {
                ram_bytes: Some(8 * 1024 * 1024 * 1024 - 1),
                ram_gb: Some(8),
                ..Equipment::default()
            }
            .recommended_level(),
            PerformanceLevel::Economy
        );
        for (cores, ram_gb, expected) in [
            (Some(4), Some(32), PerformanceLevel::Economy),
            (Some(5), Some(7), PerformanceLevel::Economy),
            (Some(5), Some(8), PerformanceLevel::Balanced),
            (None, None, PerformanceLevel::Balanced),
        ] {
            assert_eq!(
                Equipment {
                    cores,
                    ram_gb,
                    ..Equipment::default()
                }
                .recommended_level(),
                expected
            );
        }
    }
}
