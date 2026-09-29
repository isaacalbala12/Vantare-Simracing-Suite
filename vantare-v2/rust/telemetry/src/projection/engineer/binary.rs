//! Versioned Engineer value body for the R21 binary codec candidate.
//! The IPC envelope owns metadata and identity; this module owns only the
//! complete typed projection. No Rust memory layout crosses the pipe.

use super::{EngineerView, FieldView, Number, Orientation, Vector3, VehicleView};

const MAX_BODY_BYTES: usize = 8 * 1024 * 1024;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum BinaryError {
    TooLarge,
    InvalidQuality,
    InvalidCapability,
    NonFiniteNumber,
}

struct Writer {
    bytes: Vec<u8>,
}

impl Writer {
    fn new() -> Self {
        Self {
            bytes: Vec::with_capacity(32 * 1024),
        }
    }

    fn byte(&mut self, value: u8) {
        self.bytes.push(value);
    }

    fn short(&mut self, value: u16) {
        self.bytes.extend_from_slice(&value.to_le_bytes());
    }

    fn integer(&mut self, value: i32) {
        self.bytes.extend_from_slice(&value.to_le_bytes());
    }

    fn number(&mut self, value: f64) -> Result<(), BinaryError> {
        if !value.is_finite() {
            return Err(BinaryError::NonFiniteNumber);
        }
        self.bytes.extend_from_slice(&value.to_le_bytes());
        Ok(())
    }

    fn string(&mut self, value: &str) -> Result<(), BinaryError> {
        let size = u16::try_from(value.len()).map_err(|_| BinaryError::TooLarge)?;
        self.short(size);
        self.bytes.extend_from_slice(value.as_bytes());
        Ok(())
    }

    fn field<T: WireValue>(&mut self, field: &FieldView<T>) -> Result<(), BinaryError> {
        let provenance = match field.provenance {
            "unknown" => 0,
            "observed" => 1,
            "derived" => 2,
            "estimated" => 3,
            _ => return Err(BinaryError::InvalidQuality),
        };
        let freshness = match field.freshness {
            "missing" => 0,
            "fresh" => 1,
            "stale" => 2,
            "invalid" => 3,
            _ => return Err(BinaryError::InvalidQuality),
        };
        self.byte(u8::from(field.present) | provenance << 1 | freshness << 3);
        field.value.write(self)
    }

    fn vehicle(&mut self, vehicle: &VehicleView<'_>) -> Result<(), BinaryError> {
        self.string(vehicle.id)?;
        self.field(&vehicle.driver_name)?;
        self.field(&vehicle.vehicle_name)?;
        self.field(&vehicle.vehicle_class)?;
        self.field(&vehicle.is_player)?;
        self.field(&vehicle.lap_number)?;
        self.field(&vehicle.gear)?;
        self.field(&vehicle.engine_rpm)?;
        self.field(&vehicle.speed_mps)?;
        self.field(&vehicle.throttle)?;
        self.field(&vehicle.brake)?;
        self.field(&vehicle.clutch)?;
        self.field(&vehicle.position)?;
        self.field(&vehicle.completed_laps)?;
        self.field(&vehicle.in_pit)?;
        self.field(&vehicle.pit_stop_count)?;
        self.field(&vehicle.sector)?;
        self.field(&vehicle.lap_distance_meters)?;
        self.field(&vehicle.best_lap_seconds)?;
        self.field(&vehicle.last_lap_seconds)?;
        self.field(&vehicle.estimated_lap_seconds)?;
        self.field(&vehicle.penalty_count)?;
        self.field(&vehicle.time_behind_leader_seconds)?;
        self.field(&vehicle.laps_behind_leader)?;
        self.field(&vehicle.time_behind_next_seconds)?;
        self.field(&vehicle.laps_behind_next)?;
        self.field(&vehicle.fuel_liters)?;
        self.field(&vehicle.fuel_capacity_liters)?;
        self.field(&vehicle.relative_time_gap_seconds)?;
        self.field(&vehicle.relative_lap_delta)?;
        self.field(&vehicle.world_position)?;
        self.field(&vehicle.local_velocity)?;
        self.field(&vehicle.orientation)
    }
}

trait WireValue {
    fn write(&self, writer: &mut Writer) -> Result<(), BinaryError>;
}

impl WireValue for &str {
    fn write(&self, writer: &mut Writer) -> Result<(), BinaryError> {
        writer.string(self)
    }
}

impl WireValue for bool {
    fn write(&self, writer: &mut Writer) -> Result<(), BinaryError> {
        writer.byte(u8::from(*self));
        Ok(())
    }
}

impl WireValue for i32 {
    fn write(&self, writer: &mut Writer) -> Result<(), BinaryError> {
        writer.integer(*self);
        Ok(())
    }
}

impl WireValue for u8 {
    fn write(&self, writer: &mut Writer) -> Result<(), BinaryError> {
        writer.byte(*self);
        Ok(())
    }
}

impl WireValue for Number {
    fn write(&self, writer: &mut Writer) -> Result<(), BinaryError> {
        writer.number(self.0)
    }
}

impl WireValue for Vector3 {
    fn write(&self, writer: &mut Writer) -> Result<(), BinaryError> {
        self.x.write(writer)?;
        self.y.write(writer)?;
        self.z.write(writer)
    }
}

impl WireValue for Orientation {
    fn write(&self, writer: &mut Writer) -> Result<(), BinaryError> {
        self.row0.write(writer)?;
        self.row1.write(writer)?;
        self.row2.write(writer)
    }
}

/// A complete Engineer projection in a fixed, auditable field order. This is
/// a candidate body only: the production IPC still uses the JSON encoder.
pub fn encode_binary_view(view: &EngineerView<'_>) -> Result<Vec<u8>, BinaryError> {
    let mut writer = Writer::new();
    let mut capabilities = 0_u8;
    for capability in &view.capabilities {
        capabilities |= match *capability {
            "session" => 1 << 0,
            "standings" => 1 << 1,
            "controls" => 1 << 2,
            "pit" => 1 << 3,
            "fuel" => 1 << 4,
            "gaps" => 1 << 5,
            "spatial" => 1 << 6,
            _ => return Err(BinaryError::InvalidCapability),
        };
    }
    writer.byte(capabilities);
    writer.field(&view.track_name)?;
    writer.field(&view.session_type)?;
    writer.field(&view.source_time_seconds)?;
    writer.field(&view.end_time_seconds)?;
    writer.field(&view.remaining_seconds)?;
    writer.field(&view.maximum_laps)?;
    writer.field(&view.vehicle_count)?;
    writer.field(&view.player_present)?;
    writer.vehicle(&view.player)?;
    let count = u16::try_from(view.vehicles.len()).map_err(|_| BinaryError::TooLarge)?;
    writer.short(count);
    for vehicle in &view.vehicles {
        writer.vehicle(vehicle)?;
    }
    if writer.bytes.len() > MAX_BODY_BYTES {
        return Err(BinaryError::TooLarge);
    }
    Ok(writer.bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::Engine;

    #[test]
    fn real_grid_binary_body_is_bounded_and_stable() {
        let frame = include_bytes!("../../../../../testdata/lmu-fixture.bin");
        let engine = Engine::new(30, 15).unwrap();
        let candidate = engine
            .prepare(frame, "1.3.0.0", 100, 100, 100_000_000_000)
            .unwrap();
        let view = super::super::build_typed(
            candidate.batch(),
            candidate.session_remaining(),
            candidate.gaps(),
        );
        let first = encode_binary_view(&view).unwrap();
        let second = encode_binary_view(&view).unwrap();
        assert_eq!(first, second);
        assert!(first.len() < 150_000, "binary body size {}", first.len());
        assert_eq!(first[0] & 0x7f, 0x7f);
        assert_eq!(first[1], 0b01011); // observed, fresh, present track
    }
}
