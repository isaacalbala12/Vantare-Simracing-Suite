//! Los dos endpoints REST de LMU, decodificados con límites. REST solo aporta
//! lo que la memoria compartida no trae (número de carrera, bandera global) o
//! un respaldo del circuito y del tipo de sesión; nunca crea un coche.

mod http;
mod poller;

use std::collections::HashMap;
use std::time::Duration;

use serde_json::{Map, Value};

use super::frame::Kind;

pub(super) use poller::Poller;

pub(super) const MAX_RESPONSE_BYTES: usize = 4 << 20;
/// Pasado este tiempo desde su consulta, un dato REST deja de ser actual.
const TTL: Duration = Duration::from_secs(2);

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) enum DecodeError {
    Empty,
    TooLarge,
    Malformed,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) struct CarNumber {
    pub slot: i32,
    pub number: String,
    pub vehicle: String,
}

#[derive(Debug, Default, PartialEq)]
pub(super) struct SessionInfo {
    pub track: Option<String>,
    pub kind: Option<Kind>,
    pub global_yellow: bool,
}

/// Cada endpoint se confirma solo tras decodificar completo; una respuesta
/// mala no borra el último dato bueno, que envejece por su marca original.
#[derive(Default)]
pub(super) struct Cache {
    car_numbers: Option<(Vec<CarNumber>, Duration)>,
    session: Option<(SessionInfo, Duration)>,
}

impl Cache {
    /// `started`: instante en que se inició la consulta, en el reloj del núcleo.
    pub(super) fn accept_standings(
        &mut self,
        body: &[u8],
        started: Duration,
    ) -> Result<(), DecodeError> {
        self.car_numbers = Some((decode_standings(body)?, started));
        Ok(())
    }

    pub(super) fn accept_session(
        &mut self,
        body: &[u8],
        started: Duration,
    ) -> Result<(), DecodeError> {
        self.session = Some((decode_session_info(body)?, started));
        Ok(())
    }

    /// Números vigentes. `floor`: una consulta iniciada antes del último cambio
    /// de sesión podría nombrar un hueco de la memoria compartida ya reutilizado.
    pub(super) fn car_numbers(&self, now: Duration, floor: Duration) -> &[CarNumber] {
        match &self.car_numbers {
            Some((rows, started)) if current(*started, now) && *started >= floor => rows,
            _ => &[],
        }
    }

    /// Sesión REST y si sigue siendo actual (`false`: dato caducado).
    pub(super) fn session(&self, now: Duration, floor: Duration) -> Option<(&SessionInfo, bool)> {
        let (info, started) = self.session.as_ref()?;
        (*started >= floor).then(|| (info, current(*started, now)))
    }
}

/// El reloj del núcleo es monotónico: si `now` retrocede, el dato no es fiable.
fn current(started: Duration, now: Duration) -> bool {
    now.checked_sub(started).is_some_and(|age| age <= TTL)
}

fn document(body: &[u8]) -> Result<Value, DecodeError> {
    if body.len() > MAX_RESPONSE_BYTES {
        return Err(DecodeError::TooLarge);
    }
    if body.iter().all(u8::is_ascii_whitespace) {
        return Err(DecodeError::Empty);
    }
    serde_json::from_slice(body).map_err(|_| DecodeError::Malformed)
}

/// Propiedad presente y no nula. Ausente y `null` significan lo mismo.
fn property<'a>(row: &'a Map<String, Value>, name: &str) -> Option<&'a Value> {
    row.get(name).filter(|value| !value.is_null())
}

fn text(row: &Map<String, Value>, name: &str) -> Result<Option<String>, DecodeError> {
    property(row, name)
        .map(|value| {
            value
                .as_str()
                .map(|text| text.trim().to_owned())
                .ok_or(DecodeError::Malformed)
        })
        .transpose()
}

fn decode_standings(body: &[u8]) -> Result<Vec<CarNumber>, DecodeError> {
    let document = document(body)?;
    if document.is_null() {
        return Err(DecodeError::Empty);
    }
    let rows = document.as_array().ok_or(DecodeError::Malformed)?;
    // Se lee cada fila antes de publicar nada: una fila mala rechaza el cuerpo.
    let empty = Map::new();
    let mut parsed = Vec::with_capacity(rows.len());
    for value in rows {
        let row = if value.is_null() {
            &empty
        } else {
            value.as_object().ok_or(DecodeError::Malformed)?
        };
        let slot = property(row, "slotID")
            .map(|value| {
                value
                    .as_i64()
                    .and_then(|slot| i32::try_from(slot).ok())
                    .ok_or(DecodeError::Malformed)
            })
            .transpose()?;
        parsed.push((
            slot,
            text(row, "carNumber")?.unwrap_or_default(),
            text(row, "vehicleName")?.unwrap_or_default(),
        ));
    }
    // Un hueco repetido es ambiguo: no se asigna número a ninguno de sus coches.
    let mut counts = HashMap::with_capacity(parsed.len());
    for (slot, ..) in &parsed {
        if let Some(slot) = slot.filter(|slot| *slot >= 0) {
            *counts.entry(slot).or_insert(0_u32) += 1;
        }
    }
    Ok(parsed
        .into_iter()
        .filter_map(|(slot, number, vehicle)| {
            let slot = slot.filter(|slot| counts.get(slot) == Some(&1))?;
            // LMU numera con enteros de hasta cuatro cifras; "007" se conserva.
            ((1..=4).contains(&number.len()) && number.bytes().all(|byte| byte.is_ascii_digit()))
                .then_some(CarNumber {
                    slot,
                    number,
                    vehicle,
                })
        })
        .collect())
}

fn decode_session_info(body: &[u8]) -> Result<SessionInfo, DecodeError> {
    let document = document(body)?;
    let empty = Map::new();
    let row = if document.is_null() {
        &empty
    } else {
        document.as_object().ok_or(DecodeError::Malformed)?
    };
    let session = text(row, "session")?.unwrap_or_default().to_uppercase();
    let kind = [
        ("PRACTICE", Kind::Practice),
        ("QUAL", Kind::Qualifying),
        ("RACE", Kind::Race),
        ("WARMUP", Kind::Warmup),
    ]
    .into_iter()
    .find_map(|(prefix, kind)| session.starts_with(prefix).then_some(kind));
    // Contrato candidato de Go: solo los códigos exactos 2, 3, 4, 5 del SDK
    // (full-course). La equivalencia REST/SHM necesita una captura positiva;
    // fracciones y `"invalid"` no prueban ni descartan una bandera.
    let global_yellow = property(row, "yellowFlagState")
        .and_then(Value::as_f64)
        .is_some_and(|code| [2.0, 3.0, 4.0, 5.0].contains(&code));
    Ok(SessionInfo {
        track: text(row, "trackName")?,
        kind,
        global_yellow,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const S: Duration = Duration::from_secs(1);

    #[test]
    fn standings_keep_numbers_and_drop_ambiguous_slots() {
        let body = br#"[
          {"slotID":0,"player":true,"position":3,"carNumber":"007","vehicleName":" Team A "},
          {"slotID":4,"carNumber":"91","vehicleName":"Team B"},
          {"slotID":4,"carNumber":"50","vehicleName":"Team C"},
          {"slotID":5,"carNumber":"A3","vehicleName":"Team D"},
          {"carNumber":"6","vehicleName":"No slot"}
        ]"#;
        assert_eq!(
            decode_standings(body).unwrap(),
            vec![CarNumber {
                slot: 0,
                number: "007".to_owned(),
                vehicle: "Team A".to_owned()
            }]
        );
        assert_eq!(decode_standings(b"[null]").unwrap(), vec![]);
        assert_eq!(decode_standings(b"null"), Err(DecodeError::Empty));
        assert_eq!(decode_standings(b" "), Err(DecodeError::Empty));
    }

    #[test]
    fn standings_reject_a_malformed_sibling_and_oversize_bodies() {
        for body in [
            &br#"[{"slotID":1,"carNumber":"1"},{"vehicleName":7}]"#[..],
            br#"[{"slotID":3.5}]"#,
            br"[] {}",
            br#"{"slotID":1}"#,
        ] {
            assert_eq!(decode_standings(body), Err(DecodeError::Malformed));
        }
        assert_eq!(
            decode_standings(&vec![b' '; MAX_RESPONSE_BYTES + 1]),
            Err(DecodeError::TooLarge)
        );
    }

    #[test]
    fn session_info_maps_kind_track_and_positive_yellow_only() {
        let info = decode_session_info(
            br#"{"trackName":" Circuito ","session":"race1","yellowFlagState":3,"currentEventTime":-1}"#,
        )
        .unwrap();
        assert_eq!(info.track.as_deref(), Some("Circuito"));
        assert_eq!(info.kind, Some(Kind::Race));
        assert!(info.global_yellow);
        for value in ["1", "0", "6", "\"invalid\"", "null"] {
            let body = format!(r#"{{"yellowFlagState":{value}}}"#);
            assert!(!decode_session_info(body.as_bytes()).unwrap().global_yellow);
        }
        assert_eq!(
            decode_session_info(b"null").unwrap(),
            SessionInfo::default()
        );
        assert_eq!(
            decode_session_info(br#"{"trackName":3}"#),
            Err(DecodeError::Malformed)
        );
    }

    /// Contrato candidato de Go (`parseRESTSessionFlag`), no captura física.
    #[test]
    fn only_exact_full_course_codes_assert_yellow() {
        for code in ["2", "3", "4", "5", "2.0", "5e0"] {
            let body = format!(r#"{{"yellowFlagState":{code}}}"#);
            assert!(
                decode_session_info(body.as_bytes()).unwrap().global_yellow,
                "{code}"
            );
        }
        for code in [
            "-1",
            "0",
            "1",
            "6",
            "7",
            "99",
            "2.5",
            "3.001",
            "4.999",
            r#""3""#,
            r#""invalid""#,
            "true",
            "[]",
            "{}",
            "null",
        ] {
            let body = format!(r#"{{"yellowFlagState":{code}}}"#);
            assert!(
                !decode_session_info(body.as_bytes()).unwrap().global_yellow,
                "{code}"
            );
        }
    }

    #[test]
    fn ignored_phase_and_sector_shapes_do_not_assert_global_flags() {
        for shape in [
            "3",
            "5",
            "6",
            "7",
            "8",
            r#""GPHASE_GREEN""#,
            "true",
            "[]",
            "{}",
            "null",
        ] {
            let body = format!(r#"{{"gamePhase":{shape},"sectorFlag":{shape}}}"#);
            assert_eq!(
                decode_session_info(body.as_bytes()).unwrap(),
                SessionInfo::default(),
                "{shape}"
            );
        }
    }

    #[test]
    fn a_bad_response_keeps_the_last_good_value_until_it_ages_out() {
        let mut cache = Cache::default();
        let good = br#"[{"slotID":0,"carNumber":"7","vehicleName":"A"}]"#;
        cache.accept_standings(good, S).unwrap();
        assert_eq!(
            cache.accept_standings(br#"[{"slotID":"x"}]"#, 3 * S),
            Err(DecodeError::Malformed)
        );
        // TTL contado desde el inicio de la consulta: 1 s + 2 s.
        assert_eq!(cache.car_numbers(3 * S, Duration::ZERO).len(), 1);
        assert!(cache.car_numbers(3 * S + S / 2, Duration::ZERO).is_empty());
        // Reloj que retrocede o consulta anterior al cambio de sesión: descartado.
        assert!(cache.car_numbers(S / 2, Duration::ZERO).is_empty());
        assert!(cache.car_numbers(2 * S, 2 * S).is_empty());
    }

    #[test]
    fn session_is_flagged_stale_after_the_ttl_and_dropped_before_the_floor() {
        let mut cache = Cache::default();
        cache
            .accept_session(br#"{"session":"PRACTICE"}"#, S)
            .unwrap();
        let fresh = |now, floor| cache.session(now, floor).map(|(_, fresh)| fresh);
        assert_eq!(fresh(3 * S, Duration::ZERO), Some(true));
        assert_eq!(fresh(5 * S, Duration::ZERO), Some(false));
        assert_eq!(fresh(3 * S, 2 * S), None);
    }
}
