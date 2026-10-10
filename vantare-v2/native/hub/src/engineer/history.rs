//! Filtro y retención del historial de entregas de `engineer::model`.
pub const MAX_MESSAGES: usize = 1000;

#[derive(Clone, Copy, Default)]
pub struct Filter<'a> {
    pub current_cycle_only: bool,
    /// None = todas; prefijo de intent (fuel, flags, laps, pitstops, spotter…).
    pub family: Option<&'a str>,
    pub query: &'a str,
}
