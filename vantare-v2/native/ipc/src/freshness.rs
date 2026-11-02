//! Registro local de transiciones, fuera del núcleo puro y de los renderers.
use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::time::{SystemTime, UNIX_EPOCH};

use vantare_domain::freshness::{Reason, player_clock_frozen};
use vantare_domain::{Capability, Snapshot, SourceState};

fn log_root() -> io::Result<std::path::PathBuf> {
    match crate::paths::Root::from_env() {
        Ok(root) => Ok(root.logs()),
        Err(crate::paths::Error::MissingBase) => {
            Ok(std::env::temp_dir().join("Vantare/native/logs"))
        }
        Err(error) => Err(error.into()),
    }
}

pub fn state(snapshot: &Snapshot) -> (SourceState, Capability, Capability) {
    (
        snapshot.state.source_state,
        snapshot.state.capabilities.driver_inputs,
        snapshot.state.capabilities.positions,
    )
}

/// Una línea por cambio, sin telemetría ni identidad del piloto. Fallar al
/// escribir el diagnóstico nunca cambia la frescura ni detiene adquisición.
pub fn log_transition(
    component: &str,
    previous: (SourceState, Capability, Capability),
    snapshot: &Snapshot,
    reason: &str,
    detail: Option<&str>,
) {
    let current = state(snapshot);
    if previous == current {
        return;
    }
    let reason = if current.0 == SourceState::Live
        && player_clock_frozen(snapshot)
        && previous.1 != current.1
    {
        Reason::PlayerClockFrozen.text()
    } else {
        reason
    };
    let detail = detail.unwrap_or("sin detalle del adaptador");
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let line = format!(
        "{} pid={} {component} {:?}->{:?} inputs={:?}->{:?} positions={:?}->{:?} epoch={} seq={} source={:?} source_time={:?} received_at={:?} reason={reason} detail={detail}\n",
        stamp.as_secs(),
        std::process::id(),
        previous.0,
        snapshot.state.source_state,
        previous.1,
        current.1,
        previous.2,
        current.2,
        snapshot.epoch,
        snapshot.sequence,
        snapshot.origin.source,
        snapshot.origin.source_time,
        snapshot.origin.received_at,
    );
    eprint!("{line}");
    let append = || -> io::Result<()> {
        let root = log_root()?;
        fs::create_dir_all(&root)?;
        OpenOptions::new()
            .create(true)
            .append(true)
            .open(root.join("freshness.log"))?
            .write_all(line.as_bytes())
    };
    if let Err(error) = append() {
        eprintln!("registro de frescura: {error}");
    }
}

pub fn source_reason(state: SourceState) -> &'static str {
    Reason::of_source(state).text()
}

#[cfg(test)]
mod root_characterization {
    #[test]
    fn beta_absolute_root_keeps_freshness_logs_beside_native_documents() {
        let base = std::path::PathBuf::from(
            std::env::var_os("VANTARE_NATIVE_DATA_ROOT").expect("override QA obligatorio"),
        );
        assert!(base.is_absolute());
        assert_eq!(
            super::log_root().expect("log root"),
            base.join("Vantare/native/logs")
        );
    }
}

#[cfg(test)]
mod diagnostic_tests {
    use super::*;

    #[test]
    fn transitions_log_neutral_reason_and_detail_without_repeating_or_pilot_data() {
        let component = format!(
            "freshness-paso5-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("reloj de diagnóstico")
                .as_nanos()
        );
        let mut s = Snapshot::default();
        s.state.session.track_name =
            vantare_domain::Quality::Reliable("private-track-not-logged".into());
        let waiting = state(&s);
        s.state.source_state = SourceState::Live;
        s.state.capabilities.driver_inputs = Capability::Fresh;
        log_transition(
            &component,
            waiting,
            &s,
            source_reason(SourceState::Live),
            None,
        );
        let live = state(&s);
        log_transition(
            &component,
            live,
            &s,
            "unchanged-must-not-be-logged",
            Some("same"),
        );
        s.state.capabilities.driver_inputs = Capability::WithData;
        log_transition(
            &component,
            live,
            &s,
            source_reason(SourceState::Live),
            Some("adapter player clock"),
        );
        let frozen = state(&s);
        s.state.source_state = SourceState::Paused;
        log_transition(
            &component,
            frozen,
            &s,
            source_reason(SourceState::Paused),
            Some("adapter pause confirmation"),
        );
        let log = fs::read_to_string(log_root().expect("QA logs").join("freshness.log"))
            .expect("transitions");
        let lines: Vec<_> = log
            .lines()
            .filter(|line| line.contains(&format!(" {component} ")))
            .collect();
        assert_eq!(lines.len(), 3);
        assert!(lines[0].contains(Reason::Advancing.text()));
        assert!(lines[1].contains(Reason::PlayerClockFrozen.text()));
        assert!(lines[1].contains("detail=adapter player clock"));
        assert!(lines[2].contains(Reason::Paused.text()));
        assert!(lines[2].contains("detail=adapter pause confirmation"));
        assert!(
            !lines
                .iter()
                .any(|line| line.contains("private-track-not-logged")
                    || line.contains("unchanged-must-not-be-logged"))
        );
    }
}
