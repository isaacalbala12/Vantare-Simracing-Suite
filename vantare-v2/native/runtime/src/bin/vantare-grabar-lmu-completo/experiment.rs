//! Protocolo cerrado A/B; conserva el modo exhaustivo existente.
use std::{io, time::Duration};

use serde_json::Value;

pub(super) const CORE: [&str; 2] = ["/rest/watch/standings", "/rest/watch/sessionInfo"];
pub(super) const EXTRA: &str = "/rest/race/car";

pub(super) struct Plan {
    pub duration: Duration,
    pub production_core: bool,
    pub core: Vec<String>,
    pub inventory: Vec<String>,
}

impl Plan {
    pub fn parse(catalog: &Value, paths: Vec<String>) -> io::Result<Self> {
        if paths.len() > 250
            || paths.iter().any(|p| {
                (!p.starts_with("/rest/") && !p.starts_with("/navigation/"))
                    || p.contains(['\r', '\n', '?', '#', '\\'])
                    || p.contains("..")
            })
        {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "catálogo fuera de límites",
            ));
        }
        let core: Vec<String> = CORE.iter().map(|p| (*p).into()).collect();
        if catalog.get("experiment").is_none() {
            return Ok(Self {
                duration: Duration::from_hours(4),
                production_core: false,
                inventory: paths.into_iter().filter(|p| !core.contains(p)).collect(),
                core,
            });
        }
        let invalid = || io::Error::new(io::ErrorKind::InvalidInput, "protocolo A/B inválido");
        if catalog["experiment"] != "vantare.lmu-ab.v1" {
            return Err(invalid());
        }
        let mode = catalog["mode"].as_str().ok_or_else(invalid)?;
        let duration = catalog["duration_s"]
            .as_u64()
            .filter(|s| (1..=900).contains(s))
            .ok_or_else(invalid)?;
        let mut expected: Vec<String> = match mode {
            "C" => Vec::new(),
            "A" => core.clone(),
            "B" => core.iter().cloned().chain([EXTRA.into()]).collect(),
            _ => return Err(invalid()),
        };
        let mut supplied = paths;
        expected.sort();
        supplied.sort();
        if supplied != expected {
            return Err(invalid());
        }
        Ok(Self {
            duration: Duration::from_secs(duration),
            production_core: true,
            core: if mode == "C" { Vec::new() } else { core },
            inventory: if mode == "B" {
                vec![EXTRA.into()]
            } else {
                Vec::new()
            },
        })
    }
}

pub(super) fn next_backoff(previous: Duration, complete: bool) -> Duration {
    if complete {
        Duration::from_millis(250)
    } else {
        previous.saturating_mul(2).min(Duration::from_secs(2))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn ab_changes_only_the_extra_get_and_c_has_no_rest() {
        for (mode, paths, expected) in [
            ("C", vec![], (0, 0)),
            ("A", CORE.to_vec(), (2, 0)),
            ("B", vec![CORE[0], CORE[1], EXTRA], (2, 1)),
        ] {
            let p = Plan::parse(
                &json!({"experiment":"vantare.lmu-ab.v1","mode":mode,"duration_s":180}),
                paths.iter().map(|s| (*s).into()).collect(),
            )
            .unwrap();
            assert_eq!((p.core.len(), p.inventory.len()), expected);
            assert!(p.production_core);
            assert_eq!(p.duration, Duration::from_mins(3));
        }
        let a = json!({"experiment":"vantare.lmu-ab.v1","mode":"A","duration_s":180});
        assert!(Plan::parse(&a, vec![CORE[0].into(), CORE[1].into(), EXTRA.into()]).is_err());
        assert!(Plan::parse(&a, vec![CORE[0].into(), CORE[0].into()]).is_err());
    }

    #[test]
    fn production_round_waits_after_completion_and_recovers_its_backoff() {
        let mut delay = Duration::from_millis(250);
        for expected in [500, 1000, 2000, 2000] {
            delay = next_backoff(delay, false);
            assert_eq!(delay, Duration::from_millis(expected));
        }
        assert_eq!(next_backoff(delay, true), Duration::from_millis(250));
    }
}
