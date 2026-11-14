//! Monitor bounds in the same logical units as the native overlays. No window/GPU.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Monitor {
    pub origin: (f64, f64),
    pub size: (f64, f64),
    pub primary: bool,
}
impl Monitor {
    pub fn from_physical(rect: (i32, i32, i32, i32), dpi: u32, primary: bool) -> Option<Self> {
        if dpi == 0 || rect.2 <= rect.0 || rect.3 <= rect.1 {
            return None;
        }
        let scale = f64::from(dpi) / 96.0;
        Some(Self {
            origin: (f64::from(rect.0) / scale, f64::from(rect.1) / scale),
            size: (
                (f64::from(rect.2) - f64::from(rect.0)) / scale,
                (f64::from(rect.3) - f64::from(rect.1)) / scale,
            ),
            primary,
        })
    }
}
pub(crate) fn choose(monitors: &[Monitor], positions: &[(f64, f64, bool)]) -> Option<Monitor> {
    positions
        .iter()
        .filter(|p| p.2)
        .find_map(|p| {
            monitors.iter().copied().find(|m| {
                p.0 >= m.origin.0
                    && p.0 < m.origin.0 + m.size.0
                    && p.1 >= m.origin.1
                    && p.1 < m.origin.1 + m.size.1
            })
        })
        .or_else(|| monitors.iter().copied().find(|m| m.primary))
        .or_else(|| monitors.first().copied())
}
pub(crate) fn snapshot() -> Vec<Monitor> {
    #[cfg(test)]
    {
        vec![Monitor {
            origin: (0.0, 0.0),
            size: (1920.0, 1080.0),
            primary: true,
        }]
    }
    #[cfg(all(windows, not(test)))]
    {
        windows::snapshot()
    }
    #[cfg(all(not(windows), not(test)))]
    {
        vec![]
    }
}
#[cfg(all(windows, not(test)))]
#[path = "monitor_windows.rs"]
mod windows;

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn logical_units_and_native_first_visible_monitor_selection_are_stable() {
        let left = Monitor::from_physical((-2560, 0, 0, 1440), 144, false).expect("monitor");
        let main = Monitor::from_physical((0, 0, 1920, 1080), 96, true).expect("monitor");
        assert_eq!(left.origin, (-2560.0 / 1.5, 0.0));
        assert_eq!(left.size, (2560.0 / 1.5, 960.0));
        assert_eq!(
            choose(
                &[main, left],
                &[(-1500.0, 100.0, false), (-1000.0, 200.0, true)]
            ),
            Some(left)
        );
        assert_eq!(choose(&[left, main], &[(-3000.0, 0.0, true)]), Some(main));
        assert_eq!(choose(&[], &[(0.0, 0.0, true)]), None);
        assert!(Monitor::from_physical((0, 0, 0, 100), 96, true).is_none());
        assert!(Monitor::from_physical((0, 0, 100, 100), 0, true).is_none());
    }
}
