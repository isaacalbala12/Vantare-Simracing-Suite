/// Un valor con su calidad. `Unavailable` no lleva valor: la ausencia nunca se
/// codifica con `0`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Quality<T> {
    /// Medido o declarado por la fuente y fresco.
    Reliable(T),
    /// Derivado o inferido por el núcleo.
    Estimated(T),
    /// Último valor conocido, pero ya no fresco.
    Stale(T),
    Unavailable,
}

// A mano: `derive(Default)` exigiría `T: Default`, y `SessionKind` no lo tiene.
#[allow(clippy::derivable_impls)]
impl<T> Default for Quality<T> {
    fn default() -> Self {
        Self::Unavailable
    }
}

impl<T> Quality<T> {
    /// El valor que se puede mostrar como actual: fiable o estimado. Un dato
    /// obsoleto o ausente devuelve `None`.
    pub fn current(&self) -> Option<&T> {
        match self {
            Self::Reliable(value) | Self::Estimated(value) => Some(value),
            Self::Stale(_) | Self::Unavailable => None,
        }
    }
}
