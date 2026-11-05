//! Manual form values and atomic document edits, independent of the UI.
use crate::{
    document::{Document, new_event},
    solver::{Budget, Discretization, Formation, Input, PitCost, Rules, Scalar},
};
use serde_json::{Value, json};
use std::ops::{Index, IndexMut};

/// Text is retained until confirmation, including incomplete or invalid input.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ManualEvent {
    pub name: String,
    pub duration_minutes: String,
    pub fuel_capacity_liters: String,
    pub pit_transit_seconds: String,
    pub track: String,
    pub class: String,
    pub variant_name: String,
    pub variant_note: String,
    pub variant_mode: String,
    pub race_laps: String,
    pub base_pace_seconds: String,
    pub fuel_per_lap_liters: String,
    pub ve_capacity_percent: String,
    pub ve_per_lap_percent: String,
    pub tyre_life_laps: String,
    pub degradation_seconds: String,
    pub refuel_rate: String,
    pub ve_rate: String,
    pub tyre_service_seconds: String,
    pub formation_seconds: String,
    pub fuel_step: String,
    pub ve_step: String,
    pub reserve_laps: String,
    pub service_mode: String,
    pub start_at: String,
    pub team: String,
    pub driver_name: String,
    pub driver_initials: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(usize)]
pub enum ManualField {
    Name,
    DurationMinutes,
    FuelCapacityLiters,
    PitTransitSeconds,
    Track,
    Class,
    VariantName,
    VariantNote,
    VariantMode,
    RaceLaps,
    BasePaceSeconds,
    FuelPerLapLiters,
    VeCapacityPercent,
    VePerLapPercent,
    TyreLifeLaps,
    DegradationSeconds,
    RefuelRate,
    VeRate,
    TyreServiceSeconds,
    FormationSeconds,
    FuelStep,
    VeStep,
    ReserveLaps,
    ServiceMode,
    StartAt,
    Team,
    DriverName,
    DriverInitials,
}

use ManualField as Field;

impl ManualField {
    pub fn is_scalar(self) -> bool {
        matches!(
            self,
            Self::RaceLaps
                | Self::BasePaceSeconds
                | Self::FuelPerLapLiters
                | Self::VeCapacityPercent
                | Self::VePerLapPercent
                | Self::TyreLifeLaps
                | Self::DegradationSeconds
                | Self::RefuelRate
                | Self::VeRate
                | Self::TyreServiceSeconds
                | Self::FormationSeconds
                | Self::FuelStep
                | Self::VeStep
                | Self::ReserveLaps
                | Self::ServiceMode
        )
    }
}

impl Index<ManualField> for ManualEvent {
    type Output = String;
    fn index(&self, field: ManualField) -> &String {
        match field {
            Field::Name => &self.name,
            Field::DurationMinutes => &self.duration_minutes,
            Field::FuelCapacityLiters => &self.fuel_capacity_liters,
            Field::PitTransitSeconds => &self.pit_transit_seconds,
            Field::Track => &self.track,
            Field::Class => &self.class,
            Field::VariantName => &self.variant_name,
            Field::VariantNote => &self.variant_note,
            Field::VariantMode => &self.variant_mode,
            Field::RaceLaps => &self.race_laps,
            Field::BasePaceSeconds => &self.base_pace_seconds,
            Field::FuelPerLapLiters => &self.fuel_per_lap_liters,
            Field::VeCapacityPercent => &self.ve_capacity_percent,
            Field::VePerLapPercent => &self.ve_per_lap_percent,
            Field::TyreLifeLaps => &self.tyre_life_laps,
            Field::DegradationSeconds => &self.degradation_seconds,
            Field::RefuelRate => &self.refuel_rate,
            Field::VeRate => &self.ve_rate,
            Field::TyreServiceSeconds => &self.tyre_service_seconds,
            Field::FormationSeconds => &self.formation_seconds,
            Field::FuelStep => &self.fuel_step,
            Field::VeStep => &self.ve_step,
            Field::ReserveLaps => &self.reserve_laps,
            Field::ServiceMode => &self.service_mode,
            Field::StartAt => &self.start_at,
            Field::Team => &self.team,
            Field::DriverName => &self.driver_name,
            Field::DriverInitials => &self.driver_initials,
        }
    }
}

impl IndexMut<ManualField> for ManualEvent {
    fn index_mut(&mut self, field: ManualField) -> &mut String {
        match field {
            Field::Name => &mut self.name,
            Field::DurationMinutes => &mut self.duration_minutes,
            Field::FuelCapacityLiters => &mut self.fuel_capacity_liters,
            Field::PitTransitSeconds => &mut self.pit_transit_seconds,
            Field::Track => &mut self.track,
            Field::Class => &mut self.class,
            Field::VariantName => &mut self.variant_name,
            Field::VariantNote => &mut self.variant_note,
            Field::VariantMode => &mut self.variant_mode,
            Field::RaceLaps => &mut self.race_laps,
            Field::BasePaceSeconds => &mut self.base_pace_seconds,
            Field::FuelPerLapLiters => &mut self.fuel_per_lap_liters,
            Field::VeCapacityPercent => &mut self.ve_capacity_percent,
            Field::VePerLapPercent => &mut self.ve_per_lap_percent,
            Field::TyreLifeLaps => &mut self.tyre_life_laps,
            Field::DegradationSeconds => &mut self.degradation_seconds,
            Field::RefuelRate => &mut self.refuel_rate,
            Field::VeRate => &mut self.ve_rate,
            Field::TyreServiceSeconds => &mut self.tyre_service_seconds,
            Field::FormationSeconds => &mut self.formation_seconds,
            Field::FuelStep => &mut self.fuel_step,
            Field::VeStep => &mut self.ve_step,
            Field::ReserveLaps => &mut self.reserve_laps,
            Field::ServiceMode => &mut self.service_mode,
            Field::StartAt => &mut self.start_at,
            Field::Team => &mut self.team,
            Field::DriverName => &mut self.driver_name,
            Field::DriverInitials => &mut self.driver_initials,
        }
    }
}

impl ManualEvent {
    pub fn read(doc: &Document, event_index: usize, variant_index: usize) -> Self {
        let mut form = Self::default();
        let event = &doc.value()["events"][event_index];
        for (field, key) in EVENT_FIELDS {
            form[*field] = display(&event[*key]["value"]);
        }
        form.start_at = display(&event["startAt"]["value"]);
        form.team = display(&event["team"]["value"]);
        form.driver_name = display(&event["drivers"][0]["name"]["value"]);
        form.driver_initials = display(&event["drivers"][0]["ini"]["value"]);
        form.base_pace_seconds =
            display(&event["planningInputs"]["overrides"]["base_pace_seconds"]["value"]);
        form.fuel_per_lap_liters =
            display(&event["planningInputs"]["overrides"]["fuel_per_lap_liters"]["value"]);
        let variant = &event["strategies"][variant_index];
        for (field, key) in VARIANT_FIELDS {
            form[*field] = display(&variant[*key]["value"]);
        }
        if let Ok(input) =
            serde_json::from_value::<Input>(variant["overrides"]["nativeScalarInput"].clone())
        {
            form.race_laps = input.race_laps.to_string();
            for (field, value) in [
                (Field::BasePaceSeconds, input.base_lap_seconds.value),
                (Field::FuelPerLapLiters, input.fuel_per_lap_liters.value),
                (Field::VeCapacityPercent, input.ve_capacity_percent.value),
                (Field::VePerLapPercent, input.ve_per_lap_percent.value),
                (Field::TyreLifeLaps, input.tyre_life_laps.value),
                (
                    Field::DegradationSeconds,
                    input.degradation_per_lap_seconds.value,
                ),
                (Field::RefuelRate, input.pit_cost.refuel_rate_l_per_s.value),
                (Field::VeRate, input.pit_cost.ve_rate_p_per_s.value),
                (Field::TyreServiceSeconds, input.pit_cost.tyre_seconds.value),
                (Field::FormationSeconds, input.formation.seconds.value),
                (Field::FuelStep, input.discretization.fuel_liters),
                (Field::VeStep, input.discretization.ve_percent),
            ] {
                form[field] = value.to_string();
            }
            form.reserve_laps = display(&input.fuel_reserve["laps"]["value"]);
            form.service_mode = input.pit_cost.service_mode;
        }
        form
    }

    pub fn to_input(&self) -> Result<Input, String> {
        let race = self
            .race_laps
            .trim()
            .parse::<u32>()
            .map_err(|_| "Vueltas enteras requeridas")?;
        let reserve = crate::document::manual(json!(parse_number(&self.reserve_laps)?));
        let evidence = reserve["evidence"].clone();
        let input = Input {
            contract_version: "strategy.solver.v2".into(),
            race_laps: race,
            base_lap_seconds: Scalar::manual(parse_number(&self.base_pace_seconds)?),
            pit_cost: PitCost {
                transit_seconds: Scalar::manual(parse_number(&self.pit_transit_seconds)?),
                refuel_rate_l_per_s: Scalar::manual(parse_number(&self.refuel_rate)?),
                ve_rate_p_per_s: Scalar::manual(parse_number(&self.ve_rate)?),
                tyre_seconds: Scalar::manual(parse_number(&self.tyre_service_seconds)?),
                service_mode: self.service_mode.trim().into(),
            },
            formation: Formation {
                seconds: Scalar::manual(parse_number(&self.formation_seconds)?),
                presence: "valid".into(),
            },
            event_rules: Rules::default(),
            budget: Budget {
                p95_millis: 2000,
                max_candidates: 250_000,
                max_iterations: 1_000_000,
            },
            fuel_capacity_liters: Scalar::manual(parse_number(&self.fuel_capacity_liters)?),
            ve_capacity_percent: Scalar::manual(parse_number(&self.ve_capacity_percent)?),
            tyre_life_laps: Scalar::manual(parse_number(&self.tyre_life_laps)?),
            fuel_per_lap_liters: Scalar::manual(parse_number(&self.fuel_per_lap_liters)?),
            ve_per_lap_percent: Scalar::manual(parse_number(&self.ve_per_lap_percent)?),
            degradation_per_lap_seconds: Scalar::manual(parse_number(&self.degradation_seconds)?),
            discretization: Discretization {
                fuel_liters: parse_number(&self.fuel_step)?,
                ve_percent: parse_number(&self.ve_step)?,
            },
            fuel_reserve: json!({"kind":"laps","laps":reserve,"selection":evidence}),
            virtual_energy_reserve: Value::Null,
            extra: std::collections::BTreeMap::new(),
        };
        input.validate()?;
        Ok(input)
    }

    pub fn append(&self, doc: &mut Document) -> Result<usize, String> {
        let name = self.name.trim();
        if name.is_empty() {
            return Err("Nombre del evento requerido".into());
        }
        let duration = self
            .duration_minutes
            .trim()
            .parse::<u32>()
            .map_err(|_| "Duración entera requerida")?;
        let tank = parse_number(&self.fuel_capacity_liters)?;
        let pit = parse_number(&self.pit_transit_seconds)?;
        let events = doc.value()["events"]
            .as_array()
            .map_or(&[][..], Vec::as_slice);
        let index = events.len();
        let id = (1..=index + 1)
            .map(|n| format!("native-event-{n}"))
            .find(|id| !events.iter().any(|event| event["id"] == id.as_str()))
            .ok_or("No se pudo crear ID")?;
        let mut event = new_event(&id, name, duration, tank, pit);
        event["teamMode"] = crate::document::manual(json!("solo"));
        for (field, key) in [
            (Field::Track, "track"),
            (Field::Class, "cls"),
            (Field::Team, "team"),
        ] {
            event[key] = crate::document::manual(json!(self[field].trim()));
        }
        for (field, key) in [
            (Field::VariantName, "name"),
            (Field::VariantNote, "note"),
            (Field::VariantMode, "mode"),
        ] {
            if !self[field].trim().is_empty() {
                event["strategies"][0][key] = crate::document::manual(json!(self[field].trim()));
            }
        }
        if !self.start_at.trim().is_empty() {
            chrono::DateTime::parse_from_rfc3339(self.start_at.trim())
                .map_err(|_| "Salida requerida en RFC 3339 con zona horaria")?;
            event["startAt"] = crate::document::manual(json!(self.start_at.trim()));
        }
        for (field, key) in [(Field::DriverName, "name"), (Field::DriverInitials, "ini")] {
            if !self[field].trim().is_empty() {
                event["drivers"][0][key] = crate::document::manual(json!(self[field].trim()));
            }
        }
        let mut overrides = serde_json::Map::new();
        for (field, key) in [
            (Field::BasePaceSeconds, "base_pace_seconds"),
            (Field::FuelPerLapLiters, "fuel_per_lap_liters"),
        ] {
            if !self[field].trim().is_empty() {
                overrides.insert(key.into(), manual_override(parse_number(&self[field])?));
            }
        }
        if !overrides.is_empty() {
            event["planningInputs"] = json!({"overrides": overrides});
        }
        // Commit all edits together: failed validation leaves the collection intact.
        let mut next = doc.clone();
        next.append_event(&event)?;
        next.put("/activeEventId", &json!(id))?;
        next.put(
            &format!("/events/{index}/activeStrategyId"),
            &json!("variant-1"),
        )?;
        *doc = next;
        Ok(index)
    }

    pub fn confirm(&self, doc: &mut Document, event: usize, variant: usize) -> Result<(), String> {
        let mut next = doc.clone();
        for (field, key) in EVENT_FIELDS.iter().chain(VARIANT_FIELDS) {
            let pointer = if matches!(
                field,
                Field::VariantName | Field::VariantNote | Field::VariantMode
            ) {
                format!("/events/{event}/strategies/{variant}/{key}")
            } else {
                format!("/events/{event}/{key}")
            };
            let value = match field {
                Field::DurationMinutes => json!(
                    self[*field]
                        .trim()
                        .parse::<u32>()
                        .map_err(|_| "Duración entera requerida")?
                ),
                Field::FuelCapacityLiters | Field::PitTransitSeconds => {
                    json!(parse_number(&self[*field])?)
                }
                _ => json!(self[*field].trim()),
            };
            if next.value().pointer(&format!("{pointer}/value")) != Some(&value) {
                next.edit_sourced(&pointer, &value)?;
            }
        }
        for (field, key) in [
            (Field::StartAt, "startAt"),
            (Field::Team, "team"),
            (Field::DriverName, "name"),
            (Field::DriverInitials, "ini"),
        ] {
            let pointer = if matches!(field, Field::DriverName | Field::DriverInitials) {
                format!("/events/{event}/drivers/0/{key}")
            } else {
                format!("/events/{event}/{key}")
            };
            let entered = self[field].trim();
            let previous = next.value().pointer(&format!("{pointer}/value"));
            if previous.is_none() && entered.is_empty() {
                continue;
            }
            let value = if field == Field::StartAt && entered.is_empty() {
                Value::Null
            } else {
                if field == Field::StartAt {
                    chrono::DateTime::parse_from_rfc3339(entered)
                        .map_err(|_| "Salida requerida en RFC 3339 con zona horaria")?;
                }
                json!(entered)
            };
            if previous != Some(&value) {
                if previous.is_some() {
                    next.edit_sourced(&pointer, &value)?;
                } else {
                    next.put(&pointer, &crate::document::manual(value))?;
                }
            }
        }
        *doc = next;
        Ok(())
    }

    fn supported_input(
        &self,
        doc: &Document,
        event_index: usize,
        variant_index: usize,
    ) -> Result<Input, String> {
        let event = doc.value()["events"]
            .as_array()
            .and_then(|events| events.get(event_index))
            .ok_or("Selecciona un evento con variante")?;
        // Never silently solve an imported forecast/rules/projection as a dry
        // scalar race. Those dimensions must be ported before this UI uses them.
        if event["source"]["value"] != "custom"
            || event["planningInputs"]["overrides"]
                .as_object()
                .is_some_and(|a| {
                    a.keys().any(|key| {
                        !["base_pace_seconds", "fuel_per_lap_liters"].contains(&key.as_str())
                    })
                })
            || event["weatherScenarios"]
                .as_array()
                .is_some_and(|a| !a.is_empty())
            || !event["planningInputs"]["projection"].is_null()
            || event["drivers"].as_array().is_some_and(|a| a.len() > 1)
            || event["availability"]
                .as_object()
                .is_some_and(|a| !a.is_empty())
            || event["tyreInventory"]["sets"]
                .as_array()
                .is_some_and(|a| !a.is_empty())
            || event["tyreInventory"]["byCompound"]
                .as_object()
                .is_some_and(|a| !a.is_empty())
        {
            return Err("Este evento tiene clima, proyección, pilotos, disponibilidad o inventario que el solver escalar aún no admite".into());
        }
        let input = self.to_input()?;
        let variant = doc
            .value()
            .pointer(&format!("/events/{event_index}/strategies/{variant_index}"))
            .ok_or("Variante ausente")?;
        if let Ok(previous) =
            serde_json::from_value::<Input>(variant["overrides"]["nativeScalarInput"].clone())
        {
            previous.validate()?;
            if previous.event_rules.min_pit_stops.is_some()
                || previous.event_rules.max_pit_stops.is_some()
                || !previous.event_rules.required_windows.is_empty()
                || !previous.event_rules.extra.is_empty()
                || !previous.extra.is_empty()
                || !previous.virtual_energy_reserve.is_null()
                || previous.fuel_reserve["kind"]
                    .as_str()
                    .is_some_and(|kind| kind != "laps")
            {
                return Err("La entrada guardada tiene reglas o reservas que este formulario aún no edita; no se sustituyen por un cálculo sin ellas".into());
            }
        } else if !variant["overrides"]["nativeScalarInput"].is_null() {
            return Err("Datos guardados ilegibles; se conservan sin sobrescribir".into());
        }
        if self.variant_mode.trim() != "dry"
            || variant["mode"]["value"] != "dry"
            || variant["tyres"].as_object().is_some_and(|a| !a.is_empty())
            || variant["overrides"]
                .as_object()
                .is_some_and(|a| a.keys().any(|key| key != "nativeScalarInput"))
        {
            return Err("La variante contiene modo, neumáticos o restricciones aún no portados; se conservan, pero no se ignoran al calcular".into());
        }
        Ok(input)
    }

    pub fn scalar_support(
        &self,
        doc: &Document,
        event: usize,
        variant: usize,
    ) -> Result<(), String> {
        self.supported_input(doc, event, variant).map(|_| ())
    }

    pub fn prepare(
        &self,
        doc: &mut Document,
        event: usize,
        variant: usize,
    ) -> Result<Input, String> {
        let input = self.supported_input(doc, event, variant)?;
        let pointer = format!("/events/{event}/strategies/{variant}/overrides");
        let mut next = doc.clone();
        self.confirm(&mut next, event, variant)?;
        let planning = format!("/events/{event}/planningInputs");
        if next.value().pointer(&planning).is_none_or(Value::is_null) {
            next.put(&planning, &json!({}))?;
        }
        if next
            .value()
            .pointer(&format!("{planning}/overrides"))
            .is_none_or(Value::is_null)
        {
            next.put(&format!("{planning}/overrides"), &json!({}))?;
        }
        for (key, value) in [
            ("base_pace_seconds", input.base_lap_seconds.value),
            ("fuel_per_lap_liters", input.fuel_per_lap_liters.value),
        ] {
            next.put(
                &format!("{planning}/overrides/{key}"),
                &manual_override(value),
            )?;
        }
        if next.value().pointer(&pointer).is_none_or(Value::is_null) {
            next.put(&pointer, &json!({}))?;
        }
        next.put(
            &format!("{pointer}/nativeScalarInput"),
            &serde_json::to_value(&input).map_err(|e| e.to_string())?,
        )?;
        *doc = next;
        Ok(input)
    }
}

const EVENT_FIELDS: &[(Field, &str)] = &[
    (Field::Name, "name"),
    (Field::DurationMinutes, "durationMin"),
    (Field::FuelCapacityLiters, "tankLiters"),
    (Field::PitTransitSeconds, "pitLossSeconds"),
    (Field::Track, "track"),
    (Field::Class, "cls"),
];
const VARIANT_FIELDS: &[(Field, &str)] = &[
    (Field::VariantName, "name"),
    (Field::VariantNote, "note"),
    (Field::VariantMode, "mode"),
];
fn parse_number(value: &str) -> Result<f64, String> {
    let number = value
        .trim()
        .parse::<f64>()
        .map_err(|_| "Entrada numérica explícita requerida")?;
    if !number.is_finite() {
        return Err("Número no finito".into());
    }
    Ok(number)
}

fn display(value: &Value) -> String {
    value.as_str().map_or_else(
        || {
            if value.is_null() {
                String::new()
            } else {
                value.to_string()
            }
        },
        str::to_owned,
    )
}

fn manual_override(value: f64) -> Value {
    let scalar = Scalar::manual(value);
    json!({"value": value, "presence": "valid", "provenance": scalar.provenance, "confidence": scalar.confidence})
}

pub fn select_event(doc: &mut Document, event: usize, variant: usize) -> Result<(), String> {
    let event_value = doc.value()["events"]
        .as_array()
        .and_then(|a| a.get(event))
        .ok_or("Evento ausente")?;
    let id = event_value["id"].clone();
    let variant_id = event_value["strategies"]
        .as_array()
        .and_then(|a| a.get(variant))
        .map(|v| v["id"].clone());
    let mut next = doc.clone();
    next.put("/activeEventId", &id)?;
    if let Some(id) = variant_id {
        next.put(&format!("/events/{event}/activeStrategyId"), &id)?;
    }
    *doc = next;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn form() -> ManualEvent {
        ManualEvent {
            name: "Manual race".into(),
            duration_minutes: "120".into(),
            fuel_capacity_liters: "90".into(),
            pit_transit_seconds: "30".into(),
            track: "Imola".into(),
            class: "GT3".into(),
            variant_name: "Base".into(),
            variant_mode: "dry".into(),
            race_laps: "10".into(),
            base_pace_seconds: "100".into(),
            fuel_per_lap_liters: "2".into(),
            ve_capacity_percent: "100".into(),
            ve_per_lap_percent: "3".into(),
            tyre_life_laps: "20".into(),
            degradation_seconds: "0".into(),
            refuel_rate: "2".into(),
            ve_rate: "5".into(),
            tyre_service_seconds: "15".into(),
            formation_seconds: "0".into(),
            fuel_step: "1".into(),
            ve_step: "1".into(),
            reserve_laps: "0".into(),
            service_mode: "parallel".into(),
            ..ManualEvent::default()
        }
    }

    fn document(form: &ManualEvent) -> Document {
        let mut doc = Document::empty("2026-09-30T00:00:00Z").expect("document");
        form.append(&mut doc).expect("event");
        doc
    }

    #[test]
    fn partial_text_is_retained_and_failed_confirmation_is_atomic() {
        let mut form = form();
        let mut doc = document(&form);
        let original = doc.bytes().to_vec();
        form.name = "Pending name".into();
        form.duration_minutes = "1e".into();
        assert!(form.confirm(&mut doc, 0, 0).is_err());
        assert!(form.append(&mut doc).is_err());
        assert_eq!(form.duration_minutes, "1e");
        assert_eq!(doc.bytes(), original);
        form.duration_minutes = "120".into();
        form.race_laps = "1e".into();
        assert!(form.prepare(&mut doc, 0, 0).is_err());
        assert_eq!(form.race_laps, "1e");
        assert_eq!(doc.bytes(), original);
    }

    #[test]
    fn reading_and_confirming_both_schemas_preserves_opaque_bytes_and_inputs() {
        for schema in ["2.0.0", "2.1.0"] {
            let form = form();
            let mut doc = document(&form);
            doc.put("/schemaVersion", &json!(schema)).expect("schema");
            let bytes = String::from_utf8(doc.bytes().to_vec())
                .expect("utf8")
                .replace("\"events\":", "\"future\" : {\"ratio\":1.2300},\"events\":");
            let mut doc = Document::parse(bytes.as_bytes()).expect("opaque field");
            let input = form.prepare(&mut doc, 0, 0).expect("prepare");
            let mut read = ManualEvent::read(&doc, 0, 0);
            assert_eq!(read.name, form.name);
            assert_eq!(read.track, form.track);
            assert_eq!(read.race_laps, form.race_laps);
            assert_eq!(
                serde_json::to_value(read.to_input().expect("read input")).expect("serialize"),
                serde_json::to_value(input).expect("serialize")
            );
            let before = doc.bytes().to_vec();
            read.confirm(&mut doc, 0, 0).expect("unchanged");
            assert_eq!(doc.bytes(), before);
            read.name = "Renamed".into();
            read.confirm(&mut doc, 0, 0).expect("edit");
            let restarted = Document::parse(doc.bytes()).expect("restart");
            assert_eq!(restarted.schema_version(), schema);
            assert_eq!(restarted.value()["events"][0]["name"]["value"], "Renamed");
            assert!(
                String::from_utf8_lossy(restarted.bytes())
                    .contains("\"future\" : {\"ratio\":1.2300}")
            );
        }
    }

    #[test]
    fn unsupported_dimensions_are_retained_instead_of_replaced_by_scalar_input() {
        let form = form();
        let original = document(&form);
        let mut drivers = original.value()["events"][0]["drivers"]
            .as_array()
            .expect("drivers")
            .clone();
        let mut second = drivers[0].clone();
        second["id"] = json!("driver-2");
        second["order"] = json!(1);
        drivers.push(second);
        let cases = [
            (
                "/events/0/planningInputs",
                json!({"overrides":{"ve_per_lap_percent":manual_override(3.0)}}),
            ),
            ("/events/0/drivers", json!(drivers)),
            ("/events/0/availability", json!({"driver-1":[]})),
            ("/events/0/tyreInventory", json!({"byCompound":{"dry":1}})),
            ("/events/0/strategies/0/tyres", json!({"front":"medium"})),
            ("/events/0/strategies/0/overrides", json!({"future":{}})),
            ("/events/0/strategies/0/mode/value", json!("wet")),
        ];
        for (pointer, value) in cases {
            let mut doc = original.clone();
            doc.put(pointer, &value)
                .expect("valid document with an unsupported dimension");
            let before = doc.bytes().to_vec();
            assert!(form.scalar_support(&doc, 0, 0).is_err(), "{pointer}");
            assert!(form.prepare(&mut doc, 0, 0).is_err(), "{pointer}");
            assert_eq!(doc.bytes(), before, "{pointer}");
        }
        let mut input = form.to_input().expect("input");
        input.event_rules.min_pit_stops = Some(1);
        input.validate().expect("valid solver rules");
        let mut doc = original;
        doc.put(
            "/events/0/strategies/0/overrides",
            &json!({"nativeScalarInput":input}),
        )
        .expect("stored rules");
        let before = doc.bytes().to_vec();
        assert!(form.prepare(&mut doc, 0, 0).is_err());
        assert_eq!(doc.bytes(), before);
    }

    #[test]
    fn selection_is_atomic_and_preserves_the_event_contents() {
        let form = form();
        let mut doc = document(&form);
        form.append(&mut doc).expect("second event");
        let before = doc.bytes().to_vec();
        assert!(select_event(&mut doc, 99, 0).is_err());
        assert_eq!(doc.bytes(), before);
        let events = doc.value()["events"].clone();
        select_event(&mut doc, 0, 0).expect("select first");
        assert_eq!(doc.value()["activeEventId"], "native-event-1");
        assert_eq!(doc.value()["events"], events);
    }

    #[test]
    fn numbers_are_explicit_and_nonfinite_values_are_rejected() {
        for invalid in ["", "NaN", "inf", "text"] {
            assert!(parse_number(invalid).is_err());
        }
        assert_eq!(
            parse_number("0").expect("explicit zero").to_bits(),
            0.0_f64.to_bits()
        );
    }
}
