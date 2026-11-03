//! Ablaciones explícitas del banco; no se compilan en el Core de producto.
#[cfg(any(windows, test))]
use super::Core;
#[cfg(any(windows, test))]
use std::io;

#[cfg(any(windows, test))]
impl Core {
    /// Configurar antes del bucle; nunca se recibe por IPC.
    pub(crate) fn set_measurement_mode(&mut self, mode: &str) -> io::Result<()> {
        let (flows, validation) = match mode {
            "normal" => (false, false),
            "no-flows" => (true, false),
            "no-validation" => (false, true),
            "no-both" => (true, true),
            _ => {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "modo de medición desconocido",
                ));
            }
        };
        self.measurement_skip_flows = flows;
        self.measurement_skip_validation = validation;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::tests::{ms, observation};
    use vantare_domain::{Quality, SourceState, format::Preferences, standings};
    #[test]
    fn measurement_modes_preserve_standings_for_valid_observations() {
        let obs = observation(ms(0), ms(0), 0.25);
        let mut baseline = Core::new(3);
        baseline.observe(obs.clone()).unwrap();
        let expected = standings::project(&baseline.snapshot(), Preferences::default());
        for mode in ["normal", "no-flows", "no-validation", "no-both"] {
            let mut core = Core::new(3);
            core.set_measurement_mode(mode).unwrap();
            core.observe(obs.clone()).unwrap();
            assert_eq!(
                standings::project(&core.snapshot(), Preferences::default()),
                expected,
                "{mode}"
            );
        }
    }

    #[test]
    fn measurement_modes_isolate_flows_and_validation_but_keep_photos_and_staleness() {
        for (mode, flows, validation) in [
            ("normal", true, true),
            ("no-flows", false, true),
            ("no-validation", true, false),
            ("no-both", false, false),
        ] {
            let mut core = Core::new(3);
            core.set_measurement_mode(mode).unwrap();
            let mut obs = observation(ms(0), ms(0), 0.25);
            obs.state.cars[1].laps = Quality::Reliable(1);
            obs.state.session.remaining_s = Quality::Reliable(f64::INFINITY);
            core.observe(obs.clone()).unwrap();
            assert_eq!(core.series().active().is_some(), flows, "{mode}");
            assert_eq!(
                core.snapshot().state.session.remaining_s == Quality::Unavailable,
                validation,
                "{mode}"
            );
            let tail = core.events().tail();
            obs.origin.source_time = Some(ms(100));
            obs.origin.received_at = ms(100);
            obs.state.cars[1].in_pits = Quality::Reliable(true);
            core.observe(obs.clone()).unwrap();
            assert_eq!(core.events().tail().index > tail.index, flows, "{mode}");
            obs.state.cars[2].id = obs.state.cars[0].id;
            assert_eq!(core.observe(obs).is_err(), validation, "{mode}");
            core.tick(ms(700));
            assert_eq!(
                core.snapshot().state.source_state,
                SourceState::Stale,
                "{mode}"
            );
            assert!(core.snapshot().sequence >= 3);
        }
        let mut core = Core::new(3);
        assert!(core.set_measurement_mode("typo").is_err());
        assert!(!core.measurement_skip_flows);
        assert!(!core.measurement_skip_validation);
    }
}
