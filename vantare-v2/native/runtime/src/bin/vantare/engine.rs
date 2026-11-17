//! Interruptor de proceso para la convivencia GPUI/Rune (ADR 0110).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Engine {
    Gpui,
    Rune,
}
#[allow(clippy::derivable_impls)] // El cambio aprobado debe ser una sola línea explícita.
impl Default for Engine {
    fn default() -> Self {
        Self::Gpui // la línea del cambio: solo se activa Rune con autorización de Isaac.
    }
}
impl Engine {
    pub(super) fn parse(value: &str) -> Result<Self, String> {
        match value {
            "gpui" => Ok(Self::Gpui),
            "rune" => Ok(Self::Rune),
            _ => Err(format!("valor inválido {value:?}; se espera gpui|rune")),
        }
    }
    pub(super) fn binary_stem(self) -> &'static str {
        match self {
            Self::Gpui => "vantare-overlays",
            Self::Rune => "vantare-overlays-rune",
        }
    }
}
