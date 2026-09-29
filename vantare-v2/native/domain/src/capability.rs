/// Nivel de una señal. Los niveles están anidados (fresco ⊂ hay dato ⊂
/// soportado), por eso es un enum ordenado y no tres booleanos que admitirían
/// combinaciones imposibles.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, PartialOrd, Ord)]
pub enum Capability {
    /// El simulador no la ofrece.
    #[default]
    Unsupported,
    /// El simulador la ofrece, pero ahora no hay dato.
    Supported,
    /// Hay dato, pero no está fresco.
    WithData,
    /// Hay dato fresco.
    Fresh,
}

/// Capacidades que declara el adaptador para las señales de la fase 0. Añadir
/// una señal es añadir un campo; `Default` (todo `Unsupported`) protege a los
/// adaptadores existentes.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Capabilities {
    pub session_clock: Capability,
    pub positions: Capability,
    pub lap_times: Capability,
    pub gaps: Capability,
    pub pit_status: Capability,
    pub flags: Capability,
    /// Posición en pista de los coches (radar).
    pub spatial: Capability,
    /// Acelerador, freno y embrague del jugador.
    pub driver_inputs: Capability,
    /// Marcha, velocidad y régimen del motor del jugador.
    pub powertrain: Capability,
    /// Combustible del jugador.
    pub fuel: Capability,
    /// Delta frente a la mejor vuelta propia.
    pub delta: Capability,
    /// Sector en curso y tiempos de sector.
    pub sectors: Capability,
    /// Distancia y tiempo dentro de la vuelta en curso.
    pub lap_progress: Capability,
    /// Clima y estado de la pista.
    pub weather: Capability,
    /// Integridad del jugador y goma restante por neumático.
    pub damage: Capability,
}
