//! Contrato de adaptación R9.5/R10.2: el alto fija la densidad y el ancho la
//! estructura. Medidas en píxeles lógicos de GPUI, que ya incluyen el factor de
//! escala de Windows (2560×1440 al 125 % = 2048×1152). La shell lo publica como
//! global en cada render; las páginas lo consultan con `cx.global::<Adapt>()`.

/// Densidad por alto de ventana.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Ord, PartialOrd)]
pub enum Density {
    /// ≥ 1000: tokens base.
    A,
    /// 820–999: rellenos 16/24, gap 12, sin notas del carril (`.op-m`).
    M,
    /// 760–819: gap 10, sin subtítulo de página ni tarjetas opcionales (`.op-b`).
    B,
    /// < 760: listas del carril con 2 filas como máximo.
    Xs,
}

/// Estructura por ancho de ventana.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Ord, PartialOrd)]
pub enum Tier {
    /// ≥ 1800: completo.
    Full,
    /// 1600–1799: eyebrows sin partes secundarias (`.op-w`).
    Medium,
    /// 1500–1599: compacto.
    Compact,
    /// 1100–1499: barra izquierda contraída salvo que el usuario la abra.
    Narrow,
    /// < 1100: fuera de soporte; la barra derecha va debajo del contenido.
    Stacked,
}

pub const SIDEBAR_OPEN_W: f32 = 272.0;
pub const SIDEBAR_CLOSED_W: f32 = 76.0;
pub const RAIL_STRIP_W: f32 = 56.0;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Adapt {
    pub width: f32,
    pub height: f32,
    pub density: Density,
    pub tier: Tier,
    /// Barra izquierda abierta (preferencia del usuario o automática).
    pub sidebar_open: bool,
    /// Barra derecha abierta (estado global que se conserva entre páginas).
    pub rail_open: bool,
}

impl gpui::Global for Adapt {}

impl Adapt {
    /// `sidebar` es la elección explícita del usuario (`Ctrl B`); `None` = automática.
    pub fn new(width: f32, height: f32, sidebar: Option<bool>, rail_open: bool) -> Self {
        let density = if height >= 1000.0 {
            Density::A
        } else if height >= 820.0 {
            Density::M
        } else if height >= 760.0 {
            Density::B
        } else {
            Density::Xs
        };
        let tier = if width >= 1800.0 {
            Tier::Full
        } else if width >= 1600.0 {
            Tier::Medium
        } else if width >= 1500.0 {
            Tier::Compact
        } else if width >= 1100.0 {
            Tier::Narrow
        } else {
            Tier::Stacked
        };
        Self {
            width,
            height,
            density,
            tier,
            sidebar_open: sidebar.unwrap_or(width >= 1500.0),
            rail_open,
        }
    }

    pub fn sidebar_width(&self) -> f32 {
        if self.sidebar_open {
            SIDEBAR_OPEN_W
        } else {
            SIDEBAR_CLOSED_W
        }
    }

    /// Barra derecha: `clamp(320, 22vw, 400)` abierta; franja de 56 recogida.
    pub fn rail_width(&self) -> f32 {
        if self.rail_open {
            (self.width * 0.22).clamp(320.0, 400.0)
        } else {
            RAIL_STRIP_W
        }
    }

    /// Por debajo de 1100 px la barra derecha pasa debajo y la página puede desplazarse.
    pub fn rail_below(&self) -> bool {
        self.tier == Tier::Stacked
    }

    /// Ancho del centro (sin barras laterales) para repartir columnas.
    pub fn center_width(&self) -> f32 {
        let rail = if self.rail_below() {
            0.0
        } else {
            self.rail_width()
        };
        (self.width - self.sidebar_width() - rail).max(0.0)
    }

    /// Hueco entre tarjetas.
    pub fn gap(&self) -> f32 {
        match self.density {
            Density::A => 16.0,
            Density::M => 12.0,
            Density::B | Density::Xs => 10.0,
        }
    }

    /// Relleno de página: arriba, lados y abajo.
    pub fn padding(&self) -> (f32, f32, f32) {
        match self.density {
            Density::A => (24.0, 28.0, 28.0),
            Density::M => (16.0, 24.0, 18.0),
            Density::B | Density::Xs => (12.0, 20.0, 14.0),
        }
    }

    /// Alto de fila de lista (`srow`).
    pub fn row_height(&self) -> f32 {
        match self.density {
            Density::A => 56.0,
            Density::M => 46.0,
            Density::B | Density::Xs => 40.0,
        }
    }

    /// Alto de fila de ajuste (`pref`).
    pub fn setting_height(&self) -> f32 {
        match self.density {
            Density::A => 52.0,
            Density::M => 44.0,
            Density::B | Density::Xs => 38.0,
        }
    }

    /// Filas visibles en listas del carril; `None` = sin límite.
    pub fn rail_rows(&self) -> Option<usize> {
        match self.density {
            Density::A | Density::M => None,
            Density::B => Some(3),
            Density::Xs => Some(2),
        }
    }

    /// Notas explicativas y descripciones secundarias (`.op-m`).
    pub fn show_notes(&self) -> bool {
        self.density == Density::A
    }

    /// Subtítulo de página y tarjetas opcionales (`.op-b`).
    pub fn show_optional(&self) -> bool {
        self.density <= Density::M
    }

    /// Partes secundarias de eyebrows (`.op-w`).
    pub fn show_secondary(&self) -> bool {
        self.tier == Tier::Full
    }

    /// Botón principal de héroe: 52 (46 en alto M o menor).
    pub fn hero_button(&self) -> f32 {
        if self.density == Density::A {
            52.0
        } else {
            46.0
        }
    }
}

impl Default for Adapt {
    fn default() -> Self {
        Self::new(1920.0, 1080.0, None, true)
    }
}

#[cfg(test)]
#[allow(clippy::float_cmp)] // Tokens exactos de la espec, no resultados de cálculo.
mod tests {
    use super::*;

    #[test]
    fn height_sets_density_levels() {
        for (height, density) in [
            (1440.0, Density::A),
            (1000.0, Density::A),
            (999.0, Density::M),
            (900.0, Density::M),
            (820.0, Density::M),
            (819.0, Density::B),
            (760.0, Density::B),
            (759.0, Density::Xs),
            (720.0, Density::Xs),
        ] {
            assert_eq!(
                Adapt::new(1920.0, height, None, true).density,
                density,
                "{height}"
            );
        }
        let xs = Adapt::new(1280.0, 720.0, None, true);
        assert_eq!(xs.rail_rows(), Some(2));
        assert!(!xs.show_optional() && !xs.show_notes());
        let m = Adapt::new(1440.0, 900.0, None, true);
        assert_eq!((m.gap(), m.padding()), (12.0, (16.0, 24.0, 18.0)));
        assert!(m.show_optional() && !m.show_notes());
    }

    #[test]
    fn width_sets_structure_and_collapses_the_sidebar_below_1500() {
        for (width, tier) in [
            (2560.0, Tier::Full),
            (1800.0, Tier::Full),
            (1799.0, Tier::Medium),
            (1600.0, Tier::Medium),
            (1599.0, Tier::Compact),
            (1500.0, Tier::Compact),
            (1499.0, Tier::Narrow),
            (1100.0, Tier::Narrow),
            (1099.0, Tier::Stacked),
        ] {
            assert_eq!(Adapt::new(width, 1080.0, None, true).tier, tier, "{width}");
        }
        assert!(Adapt::new(1500.0, 900.0, None, true).sidebar_open);
        assert!(!Adapt::new(1440.0, 900.0, None, true).sidebar_open);
        assert!(!Adapt::new(1280.0, 720.0, None, true).sidebar_open);
        // La elección explícita del usuario manda en ambos sentidos.
        assert!(Adapt::new(1280.0, 720.0, Some(true), true).sidebar_open);
        assert!(!Adapt::new(1920.0, 1080.0, Some(false), true).sidebar_open);
        assert_eq!(Adapt::new(1440.0, 900.0, None, true).sidebar_width(), 76.0);
        assert!(Adapt::new(1099.0, 900.0, None, true).rail_below());
        assert!(!Adapt::new(1100.0, 900.0, None, true).rail_below());
    }

    #[test]
    fn right_bar_clamps_between_320_and_400_and_folds_to_a_56_strip() {
        for (width, expected) in [
            (1280.0, 320.0),
            (1440.0, 320.0),
            (1600.0, 352.0),
            (1800.0, 396.0),
            (1920.0, 400.0),
            (2560.0, 400.0),
        ] {
            let rail = Adapt::new(width, 1080.0, None, true).rail_width();
            assert!((rail - expected).abs() < 0.01, "{width}: {rail}");
        }
        assert_eq!(Adapt::new(1920.0, 1080.0, None, false).rail_width(), 56.0);
        let full = Adapt::new(1920.0, 1080.0, None, true);
        assert!((full.center_width() - (1920.0 - 272.0 - 400.0)).abs() < 0.01);
        // 2560×1440 al 125 %: el área lógica es 2048×1152 y conserva la estructura completa.
        let scaled = Adapt::new(2560.0 / 1.25, 1440.0 / 1.25, None, true);
        assert_eq!((scaled.tier, scaled.density), (Tier::Full, Density::A));
    }
}
