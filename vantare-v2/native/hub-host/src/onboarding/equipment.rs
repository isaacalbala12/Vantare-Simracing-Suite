use super::{Equipment, PerformanceLevel};
#[cfg(windows)]
#[allow(unsafe_code)] // Read-only Windows SDK boundary copied from the frozen Hub.
#[path = "equipment_windows.rs"]
mod windows;
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
