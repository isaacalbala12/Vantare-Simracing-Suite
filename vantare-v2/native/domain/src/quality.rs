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
    /// La fuente aporta un valor medido; el adaptador declara su vigencia.
    #[must_use]
    pub fn from_source(value: Option<T>, stale: bool) -> Self {
        match value {
            Some(value) if stale => Self::Stale(value),
            Some(value) => Self::Reliable(value),
            None => Self::Unavailable,
        }
    }

    /// Valor derivado; la caducidad tiene prioridad sobre su estimación.
    #[must_use]
    pub fn from_estimate(value: Option<T>, stale: bool) -> Self {
        match value {
            Some(value) if stale => Self::Stale(value),
            Some(value) => Self::Estimated(value),
            None => Self::Unavailable,
        }
    }

    /// Caduca solo lo fiable. No cambia la autoridad de una estimación previa.
    #[must_use]
    pub fn stale_if(self, stale: bool) -> Self {
        match self {
            Self::Reliable(value) if stale => Self::Stale(value),
            other => other,
        }
    }

    /// El valor que se puede mostrar como actual: fiable o estimado. Un dato
    /// obsoleto o ausente devuelve `None`.
    pub fn current(&self) -> Option<&T> {
        match self {
            Self::Reliable(value) | Self::Estimated(value) => Some(value),
            Self::Stale(_) | Self::Unavailable => None,
        }
    }
    /// Último valor conocido, aunque esté obsoleto. Solo `Unavailable` devuelve `None`.
    pub fn last_known(&self) -> Option<&T> {
        match self {
            Self::Reliable(value) | Self::Estimated(value) | Self::Stale(value) => Some(value),
            Self::Unavailable => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quality_constructor_characterization() {
        for stale in [false, true] {
            assert_eq!(
                Quality::from_source(Some(7), stale),
                if stale {
                    Quality::Stale(7)
                } else {
                    Quality::Reliable(7)
                }
            );
            assert_eq!(
                Quality::from_estimate(Some(7), stale),
                if stale {
                    Quality::Stale(7)
                } else {
                    Quality::Estimated(7)
                }
            );
            assert_eq!(
                Quality::<u8>::from_source(None, stale),
                Quality::Unavailable
            );
            assert_eq!(
                Quality::<u8>::from_estimate(None, stale),
                Quality::Unavailable
            );
        }
        for value in [
            Quality::Reliable(7),
            Quality::Estimated(7),
            Quality::Stale(7),
            Quality::Unavailable,
        ] {
            assert_eq!(Quality::stale_if(value, false), value);
            assert_eq!(
                Quality::stale_if(value, true),
                if value == Quality::Reliable(7) {
                    Quality::Stale(7)
                } else {
                    value
                }
            );
        }
    }
}
