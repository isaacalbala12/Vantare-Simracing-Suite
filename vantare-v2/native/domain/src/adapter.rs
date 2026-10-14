//! Contrato entre un adaptador de simulador y el núcleo (ADR 0099 §1). Ningún
//! tipo de simulador cruza esta frontera.
//!
//! El núcleo (en `runtime`) implementa el otro lado, que no vive aquí:
//!
//! ```text
//! fn merge(previous: Option<&Snapshot>, observation: Observation, epoch: u64)
//!     -> Result<Snapshot, Reject>
//! ```
//!
//! `merge` valida la observación (`Reject::DuplicateCar` si dos coches repiten
//! id: entonces no se publica nada y la revisión no avanza), sanea los
//! números no finitos, calcula las derivaciones que hoy necesitan los
//! ViewModels (posición de clase y gaps) y numera el resultado: `sequence`
//! crece de uno en uno dentro de una `epoch`, y `origin` se conserva tal cual.
//! La frescura (silencio de la fuente, desconexión) no es de `merge`: la vigila
//! `Core`, que publica una revisión más con lo actual degradado a obsoleto.
//! Una `epoch` nueva la fija el núcleo al (re)inicializarse; un cambio de
//! `session.id` sin cambio de época es una sesión nueva del mismo productor.

use std::time::Duration;

use crate::{Origin, State};

/// Lote que un adaptador produce en cada lectura, ya traducido al modelo común.
/// El adaptador declara sus capacidades en `state.capabilities`, no las deduce
/// el núcleo del transporte.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Observation {
    pub origin: Origin,
    pub state: State,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum AdapterError {
    /// La fuente no está disponible (juego cerrado, memoria compartida sin
    /// abrir). Recuperable: el núcleo seguirá llamando a `poll` y el adaptador
    /// reconecta por su cuenta.
    Disconnected,
    /// La fuente entregó datos que el adaptador no admite (versión, lectura
    /// rota). El mensaje es para el diagnóstico.
    Rejected(String),
}

impl std::fmt::Display for AdapterError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Disconnected => f.write_str("fuente desconectada"),
            Self::Rejected(reason) => write!(f, "dato rechazado: {reason}"),
        }
    }
}

impl std::error::Error for AdapterError {}

/// Única abstracción con trait prevista por la ADR: tiene sustitución real
/// (LMU, replay, un segundo simulador). El adaptador abre sus recursos al
/// construirse y los libera al soltarse.
pub trait Adapter {
    /// Lee la fuente sin bloquear. `Ok(None)`: nada nuevo desde la última
    /// llamada. `now` es el reloj monotónico del núcleo, inyectado para que el
    /// replay sea determinista; el adaptador lo copia en `origin.received_at`.
    ///
    /// # Errors
    /// [`AdapterError::Disconnected`] si la fuente no está; [`AdapterError::Rejected`]
    /// si su dato no se puede admitir. Ambos permiten volver a llamar.
    fn poll(&mut self, now: Duration) -> Result<Option<Observation>, AdapterError>;

    /// Próximo instante útil en el mismo reloj de `poll`. `None` conserva el
    /// sondeo del consumidor para fuentes que no conocen su próxima lectura.
    fn next_poll(&self) -> Option<Duration> {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Scripted(Vec<Result<Option<Observation>, AdapterError>>);

    impl Adapter for Scripted {
        fn poll(&mut self, _now: Duration) -> Result<Option<Observation>, AdapterError> {
            self.0.remove(0)
        }
    }

    /// El núcleo guarda el adaptador activo sin conocer su tipo concreto.
    #[test]
    fn adapters_are_usable_as_trait_objects() {
        let mut adapter: Box<dyn Adapter> = Box::new(Scripted(vec![
            Err(AdapterError::Disconnected),
            Ok(Some(Observation::default())),
            Ok(None),
        ]));
        let now = Duration::ZERO;
        assert_eq!(adapter.poll(now), Err(AdapterError::Disconnected));
        assert!(matches!(adapter.poll(now), Ok(Some(_))));
        assert_eq!(adapter.poll(now), Ok(None));
    }
}
