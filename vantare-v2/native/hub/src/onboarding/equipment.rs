//! Foto local de hardware, tomada una vez para el asistente, nunca enviada.
use vantare_ui::performance::Level;
#[cfg(windows)]
#[allow(unsafe_code)] // Frontera SDK de solo lectura; ABI y ownership documentados en windows.rs.
mod windows;

#[derive(Clone, Debug, Default)]
pub struct Equipment {
    pub cpu: Option<String>,
    pub cores: Option<u32>,
    pub ram_bytes: Option<u64>,
    pub gpu: Option<String>,
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
    /// Regla aprobada #1628: Equilibrado; Ahorro con ≤4 núcleos o <8 GiB.
    /// Un dato ausente no se inventa ni cuenta como hardware insuficiente.
    pub fn recommended_level(&self) -> Level {
        if self.cores.is_some_and(|cores| cores <= 4)
            || self
                .ram_bytes
                .is_some_and(|ram| ram < 8 * 1024 * 1024 * 1024)
        {
            Level::Economy
        } else {
            Level::Balanced
        }
    }
    pub fn summary(&self) -> String {
        let cpu = self.cpu.as_deref().unwrap_or("CPU no disponible");
        let cores = self
            .cores
            .map_or_else(String::new, |n| format!(" · {n} núcleos"));
        let ram = self.ram_bytes.map_or_else(
            || "RAM no disponible".into(),
            |n| format!("{} GB", n.div_ceil(1024 * 1024 * 1024)),
        );
        format!(
            "{cpu}{cores}     {}     {ram}",
            self.gpu.as_deref().unwrap_or("GPU no disponible")
        )
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn automatic_resolves_hardware_boundaries_and_can_be_reselected() {
        for (cores, gib, expected) in [
            (4, 32, Level::Economy),
            (5, 7, Level::Economy),
            (5, 8, Level::Balanced),
            (8, 32, Level::Balanced),
        ] {
            let equipment = Equipment {
                cores: Some(cores),
                ram_bytes: Some(gib * 1024 * 1024 * 1024),
                ..Equipment::default()
            };
            let mut choices = crate::onboarding::Choices {
                automatic: false,
                level: Level::Maximum,
                ..Default::default()
            };
            choices.select_automatic(&equipment);
            assert!(choices.automatic);
            assert_eq!(choices.level, expected);
        }
        let equipment = Equipment {
            ram_bytes: Some(8 * 1024 * 1024 * 1024 - 1),
            ..Equipment::default()
        };
        assert_eq!(equipment.recommended_level(), Level::Economy);
        assert_eq!(Equipment::default().recommended_level(), Level::Balanced);
        assert!(Equipment::default().summary().contains("no disponible"));
    }
}
