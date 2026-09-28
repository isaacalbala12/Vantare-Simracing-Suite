//! Closed, revisioned host policy and acknowledgement for the Rust child.

use serde::{Deserialize, Serialize};

use super::{FrameError, Kind};
use crate::projection::fuel::FuelUnit;
use crate::projection::{SpeedUnit, cadence::Cadence, capabilities::Source, frame::Preferences};

pub const MAX_CONFIGURATION_PAYLOAD: usize = 64 * 1024;
pub const MAX_ACK_PAYLOAD: usize = 256;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ConfigurationError {
    WrongKind,
    TooLarge,
    InvalidJson,
    InvalidRevision,
    InvalidCadence,
    InvalidPreference,
    InvalidAck,
    Frame(FrameError),
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Consumers {
    pub overlay_v2: bool,
    pub engineer: bool,
    pub strategy: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WirePreferences {
    pub speed: String,
    pub temperature: String,
    pub pressure: String,
    pub fuel: String,
    pub delta_reference: String,
}

impl WirePreferences {
    pub fn projection(&self) -> Result<Preferences, ConfigurationError> {
        let speed = match self.speed.as_str() {
            "mps" => SpeedUnit::Mps,
            "kph" => SpeedUnit::Kph,
            "mph" => SpeedUnit::Mph,
            _ => return Err(ConfigurationError::InvalidPreference),
        };
        let fuel = match self.fuel.as_str() {
            "liters" => FuelUnit::Litres,
            "gallons-us" => FuelUnit::GallonsUs,
            _ => return Err(ConfigurationError::InvalidPreference),
        };
        if !matches!(self.temperature.as_str(), "celsius" | "fahrenheit")
            || !matches!(self.pressure.as_str(), "kpa" | "psi")
        {
            return Err(ConfigurationError::InvalidPreference);
        }
        let delta_reference = match self.delta_reference.as_str() {
            "personal-best" => "personal-best",
            "session-best" => "session-best",
            "previous-lap" => "previous-lap",
            _ => return Err(ConfigurationError::InvalidPreference),
        };
        Ok(Preferences {
            speed,
            fuel,
            delta_reference,
        })
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Configuration {
    pub revision: u64,
    pub consumers: Consumers,
    pub cadence: Cadence,
    pub preferences: WirePreferences,
    pub source: Source,
}

impl Configuration {
    fn validate(&self) -> Result<(), ConfigurationError> {
        if self.revision == 0 {
            return Err(ConfigurationError::InvalidRevision);
        }
        let cadence = self.cadence;
        if [
            cadence.fast_ns,
            cadence.mid_ns,
            cadence.slow_ns,
            cadence.spotter_ns,
            cadence.session_ns,
            cadence.relative_ns,
            cadence.standings_ns,
            cadence.fuel_ns,
            cadence.dirty_ceiling_ns,
        ]
        .iter()
        .any(|value| *value < 0)
        {
            return Err(ConfigurationError::InvalidCadence);
        }
        self.preferences.projection()?;
        if !self.source.performance.source_hz.is_finite() {
            return Err(ConfigurationError::InvalidJson);
        }
        Ok(())
    }
}

pub fn decode_frame(input: &[u8]) -> Result<Configuration, ConfigurationError> {
    let frame = super::decode(input).map_err(ConfigurationError::Frame)?;
    if frame.kind != Kind::Configuration {
        return Err(ConfigurationError::WrongKind);
    }
    if frame.payload.len() > MAX_CONFIGURATION_PAYLOAD {
        return Err(ConfigurationError::TooLarge);
    }
    let configuration: Configuration =
        serde_json::from_slice(frame.payload).map_err(|_| ConfigurationError::InvalidJson)?;
    configuration.validate()?;
    Ok(configuration)
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Ack {
    pub revision: u64,
    pub epoch: u64,
    pub sequence: u64,
}

pub fn encode_ack(ack: Ack) -> Result<Vec<u8>, ConfigurationError> {
    if ack.revision == 0 || ack.epoch == 0 || ack.sequence == 0 {
        return Err(ConfigurationError::InvalidAck);
    }
    let payload = serde_json::to_vec(&ack).map_err(|_| ConfigurationError::InvalidJson)?;
    if payload.len() > MAX_ACK_PAYLOAD {
        return Err(ConfigurationError::TooLarge);
    }
    super::encode(Kind::ConfigurationAck, &payload).map_err(ConfigurationError::Frame)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn go_configuration_frame_decodes_closed_policy_and_rust_ack_is_stable() {
        let frame = include_bytes!("../../testdata/configuration-frame-go-v1.bin");
        let configuration = decode_frame(frame).unwrap();
        assert_eq!(configuration.revision, 7);
        assert_eq!(
            configuration.consumers,
            Consumers {
                overlay_v2: true,
                engineer: true,
                strategy: false
            }
        );
        assert_eq!(configuration.cadence.fast_ns, 50_000_000);
        assert_eq!(
            configuration
                .preferences
                .projection()
                .unwrap()
                .delta_reference,
            "personal-best"
        );
        assert_eq!(
            configuration.source.descriptor_capabilities,
            ["shared-memory", "rest"]
        );
        assert_eq!(configuration.source.performance.source_hz, 60.0);
        let ack = encode_ack(Ack {
            revision: 7,
            epoch: 1,
            sequence: 42,
        })
        .unwrap();
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/testdata/configuration-ack-frame-rust-v1.bin"
        );
        if std::env::var("VANTARE_IPC_ORACLE_UPDATE").as_deref() == Ok("1") {
            std::fs::write(path, &ack).unwrap();
        }
        assert_eq!(std::fs::read(path).unwrap(), ack);
    }

    #[test]
    fn rejects_unknown_fields_negative_cadence_and_invalid_preference() {
        let frame = include_bytes!("../../testdata/configuration-frame-go-v1.bin");
        let decoded = super::super::decode(frame).unwrap();
        let mut payload: serde_json::Value = serde_json::from_slice(decoded.payload).unwrap();
        payload["unexpected"] = serde_json::json!(1);
        let malformed =
            super::super::encode(Kind::Configuration, &serde_json::to_vec(&payload).unwrap())
                .unwrap();
        assert!(matches!(
            decode_frame(&malformed),
            Err(ConfigurationError::InvalidJson)
        ));
        payload.as_object_mut().unwrap().remove("unexpected");
        payload["cadence"]["fastNs"] = serde_json::json!(-1);
        let malformed =
            super::super::encode(Kind::Configuration, &serde_json::to_vec(&payload).unwrap())
                .unwrap();
        assert!(matches!(
            decode_frame(&malformed),
            Err(ConfigurationError::InvalidCadence)
        ));
        payload["cadence"]["fastNs"] = serde_json::json!(0);
        payload["preferences"]["speed"] = serde_json::json!("invalid");
        let malformed =
            super::super::encode(Kind::Configuration, &serde_json::to_vec(&payload).unwrap())
                .unwrap();
        assert!(matches!(
            decode_frame(&malformed),
            Err(ConfigurationError::InvalidPreference)
        ));
        let oversized = super::super::encode(
            Kind::Configuration,
            &vec![b' '; MAX_CONFIGURATION_PAYLOAD + 1],
        )
        .unwrap();
        assert!(matches!(
            decode_frame(&oversized),
            Err(ConfigurationError::TooLarge)
        ));
    }
}
