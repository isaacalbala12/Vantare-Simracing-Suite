//! Bounded decoding of LMU's two REST endpoint bodies. Polling and freshness
//! ownership are separate; decoding never creates a rival vehicle from REST.

pub mod http;

use std::collections::HashMap;

use serde_json::{Map, Value};

use super::{SessionType, duration_from_seconds};
use crate::quality::{Field, Freshness};

pub const MAX_RESPONSE_BYTES: usize = 4 << 20;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DecodeError {
    Empty,
    TooLarge,
    Malformed,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EndpointStatus {
    Unknown,
    Fresh,
    Empty,
    Unsupported,
    Offline,
    Timeout,
    Malformed,
    Stale,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RestStatus {
    Live,
    Partial,
    Unsupported,
    Offline,
    Timeout,
    Stale,
}

pub fn overall_status(standings: EndpointStatus, session: EndpointStatus) -> RestStatus {
    use EndpointStatus as E;
    match (standings, session) {
        (E::Fresh, E::Fresh) => RestStatus::Live,
        (E::Stale, _) | (_, E::Stale) => RestStatus::Stale,
        (E::Unsupported, E::Unsupported) => RestStatus::Unsupported,
        (E::Offline, E::Offline) => RestStatus::Offline,
        (E::Timeout, _) | (_, E::Timeout) => RestStatus::Timeout,
        _ => RestStatus::Partial,
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CarNumber {
    pub slot: i32,
    pub number: String,
    pub vehicle: String,
}

#[derive(Debug, PartialEq)]
pub struct StandingsFields {
    pub player_present: Field<bool>,
    pub player_position: Field<i32>,
    pub completed_laps: Field<i32>,
    pub pit_stop_count: Field<i32>,
    pub car_numbers: Vec<CarNumber>,
}

#[derive(Debug, PartialEq)]
pub struct SessionInfoFields {
    pub track_name: Field<String>,
    pub source_time_ns: Field<i64>,
    pub session_type: Field<SessionType>,
    pub vehicle_count: Field<i32>,
    pub ambient_temp_c: Field<f64>,
    pub track_temp_c: Field<f64>,
    pub wetness_fraction: Field<f64>,
    pub global_yellow: Field<bool>,
}

/// REST freshness is based on elapsed time, never the wall clock.
#[derive(Debug, PartialEq)]
pub struct TimedField<T> {
    pub field: Field<T>,
    pub updated_ns: Option<u64>,
}

impl<T> TimedField<T> {
    pub fn age(&mut self, now_ns: u64, ttl_ns: u64) {
        if let Some(updated) = self.updated_ns {
            stale_field(&mut self.field, updated, now_ns, ttl_ns);
        }
    }
}

#[derive(Debug, PartialEq)]
pub struct TimedCarNumbers {
    pub rows: Vec<CarNumber>,
    pub request_started_ns: Option<u64>,
}

/// Each endpoint commits only after complete decode. A failed poll updates
/// health while the prior values age from their original response stamp.
#[derive(Debug)]
pub struct RestCache {
    pub standings_status: EndpointStatus,
    pub session_status: EndpointStatus,
    pub standings: Option<StandingsFields>,
    pub session: Option<SessionInfoFields>,
    standings_updated_ns: Option<u64>,
    session_updated_ns: Option<u64>,
    car_numbers_started_ns: Option<u64>,
}

impl Default for RestCache {
    fn default() -> Self {
        Self {
            standings_status: EndpointStatus::Unknown,
            session_status: EndpointStatus::Unknown,
            standings: None,
            session: None,
            standings_updated_ns: None,
            session_updated_ns: None,
            car_numbers_started_ns: None,
        }
    }
}

impl RestCache {
    /// Sequential poll with an injected monotonic clock. Cancellation is
    /// checked between requests; an in-flight call remains deadline-bounded.
    pub fn poll_once(
        &mut self,
        client: &http::Client,
        elapsed_ns: impl Fn() -> u64,
        cancelled: impl Fn() -> bool,
        ttl_ns: u64,
    ) -> Option<RestStatus> {
        if cancelled() {
            return None;
        }
        let started = elapsed_ns();
        let response = client.fetch(http::Endpoint::Standings);
        let received = elapsed_ns();
        if response.status == EndpointStatus::Fresh {
            self.accept_standings(&response.body, started, received);
        } else {
            self.standings_status = response.status;
        }
        if cancelled() {
            self.age(elapsed_ns(), ttl_ns);
            return None;
        }
        let response = client.fetch(http::Endpoint::SessionInfo);
        let received = elapsed_ns();
        if response.status == EndpointStatus::Fresh {
            self.accept_session(&response.body, received);
        } else {
            self.session_status = response.status;
        }
        self.age(elapsed_ns(), ttl_ns);
        (!cancelled()).then(|| self.status())
    }

    pub fn accept_standings(&mut self, body: &[u8], started_ns: u64, received_ns: u64) {
        match decode_standings(body) {
            Ok(fields) => {
                self.standings = Some(fields);
                self.standings_updated_ns = Some(received_ns);
                self.car_numbers_started_ns = Some(started_ns);
                self.standings_status = EndpointStatus::Fresh;
            }
            Err(DecodeError::Empty) => self.standings_status = EndpointStatus::Empty,
            Err(_) => self.standings_status = EndpointStatus::Malformed,
        }
    }

    pub fn accept_session(&mut self, body: &[u8], received_ns: u64) {
        match decode_session_info(body) {
            Ok(fields) => {
                self.session = Some(fields);
                self.session_updated_ns = Some(received_ns);
                self.session_status = EndpointStatus::Fresh;
            }
            Err(DecodeError::Empty) => self.session_status = EndpointStatus::Empty,
            Err(_) => self.session_status = EndpointStatus::Malformed,
        }
    }

    pub fn age(&mut self, now_ns: u64, ttl_ns: u64) {
        if let (Some(fields), Some(updated)) = (&mut self.standings, self.standings_updated_ns) {
            stale_field(&mut fields.player_present, updated, now_ns, ttl_ns);
            stale_field(&mut fields.player_position, updated, now_ns, ttl_ns);
            stale_field(&mut fields.completed_laps, updated, now_ns, ttl_ns);
            stale_field(&mut fields.pit_stop_count, updated, now_ns, ttl_ns);
            if expired(self.car_numbers_started_ns, now_ns, ttl_ns) {
                fields.car_numbers.clear();
            }
            if expired(Some(updated), now_ns, ttl_ns)
                && self.standings_status != EndpointStatus::Unsupported
            {
                self.standings_status = EndpointStatus::Stale;
            }
        }
        if let (Some(fields), Some(updated)) = (&mut self.session, self.session_updated_ns) {
            stale_field(&mut fields.track_name, updated, now_ns, ttl_ns);
            stale_field(&mut fields.source_time_ns, updated, now_ns, ttl_ns);
            stale_field(&mut fields.session_type, updated, now_ns, ttl_ns);
            stale_field(&mut fields.vehicle_count, updated, now_ns, ttl_ns);
            stale_field(&mut fields.ambient_temp_c, updated, now_ns, ttl_ns);
            stale_field(&mut fields.track_temp_c, updated, now_ns, ttl_ns);
            stale_field(&mut fields.wetness_fraction, updated, now_ns, ttl_ns);
            stale_field(&mut fields.global_yellow, updated, now_ns, ttl_ns);
            if expired(Some(updated), now_ns, ttl_ns)
                && self.session_status != EndpointStatus::Unsupported
            {
                self.session_status = EndpointStatus::Stale;
            }
        }
    }

    pub fn status(&self) -> RestStatus {
        overall_status(self.standings_status, self.session_status)
    }
}

fn expired(updated_ns: Option<u64>, now_ns: u64, ttl_ns: u64) -> bool {
    updated_ns.is_none_or(|updated| now_ns < updated || now_ns - updated > ttl_ns)
}

fn stale_field<T>(field: &mut Field<T>, updated_ns: u64, now_ns: u64, ttl_ns: u64) {
    if expired(Some(updated_ns), now_ns, ttl_ns)
        && let Field::Present { freshness, .. } = field
        && *freshness == Freshness::Fresh
    {
        *freshness = Freshness::Stale;
    }
}

impl TimedCarNumbers {
    pub fn age(&mut self, now_ns: u64, ttl_ns: u64) {
        if expired(self.request_started_ns, now_ns, ttl_ns) {
            self.rows.clear();
        }
    }
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

fn property<'a>(row: &'a Map<String, Value>, name: &str) -> Option<&'a Value> {
    row.get(name).filter(|value| !value.is_null())
}

fn integer(row: &Map<String, Value>, name: &str) -> Result<i32, DecodeError> {
    let Some(value) = property(row, name) else {
        return Ok(0);
    };
    value
        .as_i64()
        .and_then(|number| i32::try_from(number).ok())
        .ok_or(DecodeError::Malformed)
}

fn boolean(row: &Map<String, Value>, name: &str) -> Result<bool, DecodeError> {
    let Some(value) = property(row, name) else {
        return Ok(false);
    };
    value.as_bool().ok_or(DecodeError::Malformed)
}

fn string(row: &Map<String, Value>, name: &str) -> Result<String, DecodeError> {
    let Some(value) = property(row, name) else {
        return Ok(String::new());
    };
    value
        .as_str()
        .map(str::to_owned)
        .ok_or(DecodeError::Malformed)
}

fn valid_nonnegative(value: i32, minimum: i32) -> Field<i32> {
    if value >= minimum {
        Field::observed(value)
    } else {
        Field::invalid_observed(0)
    }
}

pub fn decode_standings(body: &[u8]) -> Result<StandingsFields, DecodeError> {
    let document = document(body)?;
    if document.is_null() {
        return Err(DecodeError::Empty);
    }
    let rows = document.as_array().ok_or(DecodeError::Malformed)?;
    // Parse every row before publishing any result, including rows after the
    // player. Go's JSON decoder rejects a malformed sibling transactionally.
    let mut parsed = Vec::with_capacity(rows.len());
    for value in rows {
        let empty = Map::new();
        let row = if value.is_null() {
            &empty
        } else {
            value.as_object().ok_or(DecodeError::Malformed)?
        };
        let slot = match property(row, "slotID") {
            Some(_) => Some(integer(row, "slotID")?),
            None => None,
        };
        parsed.push((
            boolean(row, "player")?,
            integer(row, "position")?,
            integer(row, "lapsCompleted")?,
            integer(row, "pitstops")?,
            slot,
            string(row, "carNumber")?,
            string(row, "vehicleName")?,
        ));
    }
    let mut fields = StandingsFields {
        player_present: Field::observed(false),
        player_position: Field::Missing,
        completed_laps: Field::Missing,
        pit_stop_count: Field::Missing,
        car_numbers: Vec::new(),
    };
    let mut slot_counts = HashMap::with_capacity(parsed.len());
    for row in &parsed {
        if let Some(slot) = row.4.filter(|slot| *slot >= 0) {
            *slot_counts.entry(slot).or_insert(0_u32) += 1;
        }
    }
    for row in &parsed {
        if let Some(slot) = row.4.filter(|slot| *slot >= 0)
            && slot_counts.get(&slot) == Some(&1)
        {
            let number = row.5.trim();
            if (1..=4).contains(&number.len()) && number.bytes().all(|digit| digit.is_ascii_digit())
            {
                fields.car_numbers.push(CarNumber {
                    slot,
                    number: number.to_owned(),
                    vehicle: row.6.trim().to_owned(),
                });
            }
        }
    }
    if let Some(row) = parsed.iter().find(|row| row.0) {
        fields.player_present = Field::observed(true);
        fields.player_position = valid_nonnegative(row.1, 1);
        fields.completed_laps = valid_nonnegative(row.2, 0);
        fields.pit_stop_count = valid_nonnegative(row.3, 0);
    }
    Ok(fields)
}

fn optional_ratio(row: &Map<String, Value>, name: &str, minimum: f64, maximum: f64) -> Field<f64> {
    let Some(value) = property(row, name) else {
        return Field::Missing;
    };
    if let Some(number) = value.as_f64()
        && number.is_finite()
        && (minimum..=maximum).contains(&number)
    {
        Field::observed(number)
    } else {
        Field::invalid_observed(0.0)
    }
}

pub fn decode_session_info(body: &[u8]) -> Result<SessionInfoFields, DecodeError> {
    let document = document(body)?;
    let empty = Map::new();
    let row = if document.is_null() {
        &empty
    } else {
        document.as_object().ok_or(DecodeError::Malformed)?
    };
    let source_seconds = property(row, "currentEventTime")
        .map(|value| value.as_f64().ok_or(DecodeError::Malformed))
        .transpose()?
        .unwrap_or(0.0);
    let source_time_ns = duration_from_seconds(source_seconds).ok_or(DecodeError::Malformed)?;
    let session = string(row, "session")?;
    let session = session.trim().to_uppercase();
    let session_type = if session.starts_with("PRACTICE") {
        Field::observed(SessionType::Practice)
    } else if session.starts_with("QUAL") {
        Field::observed(SessionType::Qualifying)
    } else if session.starts_with("RACE") {
        Field::observed(SessionType::Race)
    } else if session.starts_with("WARMUP") {
        Field::observed(SessionType::Warmup)
    } else {
        Field::invalid_observed(SessionType::Unknown)
    };
    let vehicle_count = integer(row, "numberOfVehicles")?;
    let track_name = match property(row, "trackName") {
        Some(value) => Field::observed(
            value
                .as_str()
                .ok_or(DecodeError::Malformed)?
                .trim()
                .to_owned(),
        ),
        None => Field::Missing,
    };
    let global_yellow = match property(row, "yellowFlagState").and_then(Value::as_f64) {
        Some(2.0 | 3.0 | 4.0 | 5.0) => Field::observed(true),
        _ => Field::Missing,
    };
    Ok(SessionInfoFields {
        track_name,
        source_time_ns: Field::observed(source_time_ns),
        session_type,
        vehicle_count: if (0..=super::MAX_VEHICLES as i32).contains(&vehicle_count) {
            Field::observed(vehicle_count)
        } else {
            Field::invalid_observed(0)
        },
        ambient_temp_c: optional_ratio(row, "ambientTemp", -30.0, 60.0),
        track_temp_c: optional_ratio(row, "trackTemp", -20.0, 80.0),
        wetness_fraction: optional_ratio(row, "averagePathWetness", 0.0, 1.0),
        global_yellow,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::quality::Freshness;

    #[test]
    fn standings_keeps_player_fields_and_ambiguous_slots_separate() {
        let body = br#"[
          {"slotID":0,"player":true,"position":3,"lapsCompleted":8,"pitstops":1,"carNumber":"007","vehicleName":" Team A "},
          {"slotID":4,"carNumber":"91","vehicleName":"Team B"},
          {"slotID":4,"carNumber":"50","vehicleName":"Team C"},
          {"carNumber":"6","vehicleName":"No slot"}
        ]"#;
        let got = decode_standings(body).unwrap();
        assert_eq!(got.player_present, Field::observed(true));
        assert_eq!(got.player_position, Field::observed(3));
        assert_eq!(got.completed_laps, Field::observed(8));
        assert_eq!(got.pit_stop_count, Field::observed(1));
        assert_eq!(
            got.car_numbers,
            vec![CarNumber {
                slot: 0,
                number: "007".to_owned(),
                vehicle: "Team A".to_owned(),
            }]
        );
        assert_eq!(
            decode_standings(b"[]").unwrap().player_present,
            Field::observed(false)
        );
        assert_eq!(
            decode_standings(b"[null]").unwrap().player_present,
            Field::observed(false)
        );
        assert_eq!(decode_standings(b"null"), Err(DecodeError::Empty));
    }

    #[test]
    fn standings_rejects_malformed_sibling_transactionally() {
        assert_eq!(
            decode_standings(br#"[{"player":true},{"position":"3"}]"#),
            Err(DecodeError::Malformed)
        );
        assert_eq!(
            decode_standings(br#"[{"slotID":3.5}]"#),
            Err(DecodeError::Malformed)
        );
        assert_eq!(decode_standings(br#"[] {}"#), Err(DecodeError::Malformed));
        assert_eq!(decode_standings(b" "), Err(DecodeError::Empty));
        assert_eq!(
            decode_standings(&vec![b' '; MAX_RESPONSE_BYTES + 1]),
            Err(DecodeError::TooLarge)
        );
    }

    #[test]
    fn session_info_keeps_independent_quality_and_yellow_allowlist() {
        let body = br#"{"trackName":" Test Circuit ","session":"RACE1","numberOfVehicles":21,"currentEventTime":42,"ambientTemp":"hot","trackTemp":31.0,"averagePathWetness":0,"yellowFlagState":3,"sectorFlag":5,"gamePhase":{}}"#;
        let got = decode_session_info(body).unwrap();
        assert_eq!(got.track_name, Field::observed("Test Circuit".to_owned()));
        assert_eq!(got.session_type, Field::observed(SessionType::Race));
        assert_eq!(got.vehicle_count, Field::observed(21));
        assert_eq!(got.source_time_ns, Field::observed(42_000_000_000));
        assert_eq!(got.ambient_temp_c.quality().1, Some(Freshness::Invalid));
        assert_eq!(got.track_temp_c, Field::observed(31.0));
        assert_eq!(got.wetness_fraction, Field::observed(0.0));
        assert_eq!(got.global_yellow, Field::observed(true));
        let neutral = decode_session_info(br#"{"yellowFlagState":1}"#).unwrap();
        assert_eq!(neutral.global_yellow, Field::Missing);
        assert_eq!(neutral.track_name, Field::Missing);
        assert_eq!(neutral.source_time_ns, Field::observed(0));
    }

    #[test]
    fn session_validation_rejects_invalid_clock_and_typed_fields() {
        assert_eq!(
            decode_session_info(br#"{"currentEventTime":-1}"#),
            Err(DecodeError::Malformed)
        );
        assert_eq!(
            decode_session_info(br#"{"numberOfVehicles":"21"}"#),
            Err(DecodeError::Malformed)
        );
        assert_eq!(
            decode_session_info(br#"{"currentEventTime":42} true"#),
            Err(DecodeError::Malformed)
        );
        let got =
            decode_session_info(br#"{"numberOfVehicles":105,"ambientTemp":null,"trackTemp":81}"#)
                .unwrap();
        assert_eq!(got.vehicle_count, Field::invalid_observed(0));
        assert_eq!(got.ambient_temp_c, Field::Missing);
        assert_eq!(got.track_temp_c, Field::invalid_observed(0.0));
    }

    #[test]
    fn monotonic_ttl_stales_values_and_drops_identity_grid() {
        let mut zero = TimedField {
            field: Field::observed(0_i32),
            updated_ns: Some(100),
        };
        zero.age(120, 20);
        assert_eq!(zero.field, Field::observed(0));
        zero.age(121, 20);
        assert_eq!(zero.field.quality().1, Some(Freshness::Stale));
        assert_eq!(zero.field.value(), Some(&0));

        let mut invalid = TimedField {
            field: Field::invalid_observed(0_i32),
            updated_ns: Some(100),
        };
        invalid.age(200, 20);
        assert_eq!(invalid.field.quality().1, Some(Freshness::Invalid));
        let mut rollback = TimedField {
            field: Field::observed(false),
            updated_ns: Some(100),
        };
        rollback.age(99, 20);
        assert_eq!(rollback.field.quality().1, Some(Freshness::Stale));

        let mut numbers = TimedCarNumbers {
            rows: vec![CarNumber {
                slot: 0,
                number: "007".to_owned(),
                vehicle: "A".to_owned(),
            }],
            request_started_ns: Some(100),
        };
        numbers.age(120, 20);
        assert_eq!(numbers.rows.len(), 1);
        numbers.age(121, 20);
        assert!(numbers.rows.is_empty());
    }

    #[test]
    fn endpoint_health_preserves_partial_and_failure_precedence() {
        use EndpointStatus as E;
        assert_eq!(overall_status(E::Fresh, E::Fresh), RestStatus::Live);
        assert_eq!(overall_status(E::Fresh, E::Malformed), RestStatus::Partial);
        assert_eq!(
            overall_status(E::Unsupported, E::Unsupported),
            RestStatus::Unsupported
        );
        assert_eq!(overall_status(E::Offline, E::Offline), RestStatus::Offline);
        assert_eq!(overall_status(E::Timeout, E::Fresh), RestStatus::Timeout);
        assert_eq!(overall_status(E::Timeout, E::Stale), RestStatus::Stale);
    }

    #[test]
    fn cache_rejects_bad_poll_without_replacing_last_good_values() {
        let mut cache = RestCache::default();
        cache.accept_standings(
            br#"[{"slotID":0,"carNumber":"007","vehicleName":"A","player":true,"position":3}]"#,
            90,
            100,
        );
        cache.accept_session(br#"{"trackName":"A","currentEventTime":42}"#, 110);
        assert_eq!(cache.status(), RestStatus::Live);
        cache.accept_standings(br#"[{"position":"bad"}]"#, 120, 130);
        cache.accept_session(br#"{"currentEventTime":-1}"#, 130);
        assert_eq!(cache.status(), RestStatus::Partial);
        assert_eq!(
            cache.standings.as_ref().unwrap().player_position,
            Field::observed(3)
        );
        assert_eq!(
            cache.session.as_ref().unwrap().source_time_ns,
            Field::observed(42_000_000_000)
        );

        cache.age(110, 20);
        assert_eq!(cache.standings.as_ref().unwrap().car_numbers.len(), 1);
        cache.age(111, 20);
        assert!(cache.standings.as_ref().unwrap().car_numbers.is_empty());
        assert_eq!(
            cache.standings.as_ref().unwrap().player_position,
            Field::observed(3)
        );
        cache.age(121, 20);
        assert_eq!(
            cache
                .standings
                .as_ref()
                .unwrap()
                .player_position
                .quality()
                .1,
            Some(Freshness::Stale)
        );
        assert_eq!(
            cache.session.as_ref().unwrap().source_time_ns.quality().1,
            Some(Freshness::Fresh)
        );
        assert_eq!(cache.status(), RestStatus::Stale);
        cache.age(131, 20);
        assert_eq!(
            cache.session.as_ref().unwrap().source_time_ns.quality().1,
            Some(Freshness::Stale)
        );
    }
}
