use crate::CarId;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum FlagKind {
    Green,
    Yellow,
    Blue,
    Red,
    White,
    Black,
    Checkered,
    /// Bandera que el modelo no conoce; conserva el valor original del simulador.
    Other(String),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FlagScope {
    Session,
    /// Índice del sector, desde 0.
    Sector(u8),
    Car(CarId),
}

/// Varias banderas pueden estar activas a la vez: el snapshot lleva una lista
/// de `Flag`, ordenada por relevancia por el adaptador.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Flag {
    pub kind: FlagKind,
    pub scope: FlagScope,
}
