#![allow(
    clippy::unwrap_used,
    clippy::case_sensitive_file_extension_comparisons,
    clippy::naive_bytecount,
    clippy::unchecked_time_subtraction
)]
//! E5c: the plan as text and as a CSV, and the file the host writes. The content is
//! one report with two writings; the file is written only to a path a ticket of the
//! main process brought, replacing a CSV atomically and leaving nothing behind.
use super::*;
use crate::strategy::{
    accepted::{StrategyAcceptedState, StrategyUnreachable, StrategyUnreachableCause},
    calculation::{StrategyPitPinned, StrategyPitService, StrategyTimeline},
    export::{
        Origin, Source, csv, report, suggested_name, text, write_for_tests, write_through_for_tests,
    },
};
use serde_json::Number;
use std::{
    fs,
    path::Path,
    time::{Duration, Instant},
};

const NOW: &str = "2026-11-19T18:42:00Z";
/// The id of a request of the main process: the host only holds tickets for those.
const ID: u32 = 0x8000_0009;

fn n(value: f64) -> Number {
    Number::from_f64(value).unwrap()
}

struct Root(PathBuf);
impl Root {
    fn new() -> Self {
        // the way the dialog spells it: no short names, no links
        let temp = fs::canonicalize(std::env::temp_dir()).unwrap();
        let temp = temp
            .to_str()
            .unwrap()
            .strip_prefix(r"\\?\")
            .map_or(temp.clone(), PathBuf::from);
        let path = temp.join(vantare_services::random_id().unwrap());
        fs::create_dir(&path).unwrap();
        Self(path)
    }
    fn state(&self) -> State {
        State::new(self.0.clone())
    }
    fn primary(&self) -> PathBuf {
        self.0.join(PRIMARY)
    }
    fn file(&self, name: &str) -> PathBuf {
        self.0.join(name)
    }
    fn text(&self, name: &str) -> String {
        self.file(name).to_str().unwrap().to_owned()
    }
    /// The files and folders in the root, with their bytes.
    fn listing(&self) -> std::collections::BTreeMap<String, Option<Vec<u8>>> {
        fs::read_dir(&self.0)
            .unwrap()
            .map(|entry| {
                let entry = entry.unwrap();
                let path = entry.path();
                (
                    entry.file_name().to_string_lossy().into_owned(),
                    path.is_file().then(|| fs::read(&path).unwrap()),
                )
            })
            .collect()
    }
}
impl Drop for Root {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

// ------------------------------------------------------------- a Fuji plan by hand

fn pit(lap: u32, fuel: f64, energy: f64, tyres: bool, seconds: f64) -> StrategyPit {
    StrategyPit {
        lap,
        fuel_liters: n(fuel),
        ve_percent: n(energy),
        change_tyres: tyres,
        service: StrategyPitService::Parallel,
        pit_seconds: n(seconds),
        pinned: StrategyPitPinned::default(),
    }
}

/// The six-hour Fuji of the design: 236 laps, five stops, a tank of 82 L.
fn fuji_entries() -> StrategyComputeForm {
    StrategyComputeForm {
        fields: StrategyFields {
            name: "Fuji 6 Horas".into(),
            duration_minutes: "360".into(),
            fuel_capacity_liters: "82".into(),
            pit_transit_seconds: "25".into(),
            track: "Fuji Speedway".into(),
            class: "Hypercar".into(),
            variant_name: "Seco".into(),
            variant_mode: "dry".into(),
            driver_name: "Isaac".into(),
            driver_initials: "IS".into(),
            ..StrategyFields::default()
        },
        inputs: StrategySolverFields {
            base_pace_seconds: "90.472".into(),
            fuel_per_lap_liters: "1.83".into(),
            race_laps: "236".into(),
            ve_capacity_percent: "100".into(),
            ve_per_lap_percent: "2.316".into(),
            tyre_life_laps: "43".into(),
            degradation_seconds: "0".into(),
            refuel_rate: "2".into(),
            ve_rate: "2.5".into(),
            tyre_service_seconds: "30".into(),
            formation_seconds: "0".into(),
            fuel_step: "1".into(),
            ve_step: "1".into(),
            reserve_laps: "0.8".into(),
            service_mode: "parallel".into(),
        },
    }
}

fn fuji_result() -> StrategyCalculationView {
    let laps = [43, 85, 127, 170, 212];
    let mut from = 1;
    let mut stints = Vec::new();
    for to in laps.into_iter().chain([236]) {
        stints.push(StrategyStint {
            from_lap: from,
            to_lap: to,
        });
        from = to + 1;
    }
    StrategyCalculationView {
        certificate: Some(StrategyCertificate::Proven),
        steps: StrategyServiceSteps {
            fuel_liters: Some(n(1.0)),
            ve_percent: Some(n(1.0)),
        },
        degraded: false,
        reason: None,
        metrics: Some(StrategyMetrics {
            total_seconds: n(21_664.2),
            laps: 236,
            pit_count: 5,
            fuel_reserve_real_laps: Some(n(1.14)),
            fuel_reserve_required_laps: n(0.8),
        }),
        timeline: Some(StrategyTimeline {
            pilot: "Isaac".into(),
            base_pace_seconds: n(90.472),
            fuel_start_liters: n(82.0),
            fuel_finish_liters: n(2.1),
            ve_start_percent: n(100.0),
            ve_finish_percent: n(2.6),
            stints,
            pits: vec![
                pit(43, 78.0, 99.0, true, 64.6),
                pit(85, 77.0, 97.0, true, 63.8),
                pit(127, 77.0, 97.0, true, 63.8),
                pit(170, 78.0, 98.0, true, 64.2),
                pit(212, 41.0, 56.0, true, 55.0),
            ],
        }),
    }
}

fn zone() -> chrono::FixedOffset {
    chrono::FixedOffset::east_opt(3600).unwrap()
}

fn proposal<'a>(
    entries: &'a StrategyComputeForm,
    result: &'a StrategyCalculationView,
) -> Source<'a> {
    Source {
        origin: Origin::Proposal,
        race: &entries.fields.name,
        strategy: &entries.fields.variant_name,
        entries,
        result,
    }
}

fn accepted<'a>(
    entries: &'a StrategyComputeForm,
    result: &'a StrategyCalculationView,
    state: StrategyAcceptedState,
    unreachable: Option<StrategyUnreachable>,
) -> Source<'a> {
    Source {
        origin: Origin::Accepted {
            at: NOW,
            state,
            unreachable,
        },
        ..proposal(entries, result)
    }
}

fn written(source: &Source) -> (String, Vec<u8>) {
    let report = report(source, &zone()).expect("a report");
    (text(&report), csv(&report))
}

/// The CSV as a spreadsheet reads it: no BOM, fields split on `;` outside quotes.
fn parsed(bytes: &[u8]) -> Vec<Vec<String>> {
    parsed_by(bytes, ';')
}

fn parsed_by(bytes: &[u8], separator: char) -> Vec<Vec<String>> {
    let body = std::str::from_utf8(bytes).unwrap().strip_prefix('\u{feff}').unwrap();
    assert!(body.ends_with("\r\n"));
    let mut rows = vec![vec![String::new()]];
    let mut quoted = false;
    let mut chars = body.chars().peekable();
    while let Some(c) = chars.next() {
        let row = rows.last_mut().unwrap();
        match c {
            '"' if quoted && chars.peek() == Some(&'"') => {
                chars.next();
                row.last_mut().unwrap().push('"');
            }
            '"' => quoted = !quoted,
            c if c == separator && !quoted => row.push(String::new()),
            '\r' if !quoted && chars.peek() == Some(&'\n') => {
                chars.next();
                rows.push(vec![String::new()]);
            }
            _ => row.last_mut().unwrap().push(c),
        }
    }
    rows.pop(); // after the last CRLF
    rows
}

// ----------------------------------------------------------------- the text and CSV

#[test]
fn the_proposal_as_text_byte_for_byte() {
    let (entries, result) = (fuji_entries(), fuji_result());
    let (text, _) = written(&proposal(&entries, &result));
    assert_eq!(
        text,
        "PROPUESTA SIN ACEPTAR\n\
         Carrera: Fuji 6 Horas · Estrategia: Seco\n\
         Circuito: Fuji Speedway · Clase: Hypercar\n\
         Carrera de 360 min · 236 vueltas\n\
         Duración del plan 6:01:04 · 5 paradas · sobra 1,14 v al final (pediste 0,80 v)\n\
         Comprobado: es el plan más rápido con estos datos (de 1 L en 1 L y de 1 % en 1 %)\n\
         \n\
         Salida con 82 L · 100 %\n\
         Stint 1 · vueltas 1–43 (43 vueltas) · Isaac\n\
         Parada 1 · vuelta 43 · +78 L · +99 % · ruedas nuevas · a la vez · 1:04,6 en boxes\n\
         Stint 2 · vueltas 44–85 (42 vueltas) · Isaac\n\
         Parada 2 · vuelta 85 · +77 L · +97 % · ruedas nuevas · a la vez · 1:03,8 en boxes\n\
         Stint 3 · vueltas 86–127 (42 vueltas) · Isaac\n\
         Parada 3 · vuelta 127 · +77 L · +97 % · ruedas nuevas · a la vez · 1:03,8 en boxes\n\
         Stint 4 · vueltas 128–170 (43 vueltas) · Isaac\n\
         Parada 4 · vuelta 170 · +78 L · +98 % · ruedas nuevas · a la vez · 1:04,2 en boxes\n\
         Stint 5 · vueltas 171–212 (42 vueltas) · Isaac\n\
         Parada 5 · vuelta 212 · +41 L · +56 % · ruedas nuevas · a la vez · 0:55,0 en boxes\n\
         Stint 6 · vueltas 213–236 (24 vueltas) · Isaac\n\
         Llegada con 2,1 L · 2,6 %\n\
         \n\
         Datos: depósito 82 L · consumo 1,83 L/v · energía 2,316 %/v · ritmo 1:30,472 · servicio a la vez\n\
         Hecho con Vantare"
    );
}

#[test]
fn the_proposal_as_a_csv_byte_for_byte_with_bom_semicolons_decimal_commas_and_crlf() {
    let (entries, result) = (fuji_entries(), fuji_result());
    let (_, bytes) = written(&proposal(&entries, &result));
    assert_eq!(&bytes[..3], [0xEF, 0xBB, 0xBF]);
    let expected = "Estado;PROPUESTA SIN ACEPTAR\r\n\
         Carrera;Fuji 6 Horas\r\n\
         Estrategia;Seco\r\n\
         Circuito;Fuji Speedway\r\n\
         Clase;Hypercar\r\n\
         Duración de la carrera (min);360\r\n\
         Garantía;Comprobado: es el plan más rápido con estos datos (de 1 L en 1 L y de 1 % en 1 %)\r\n\
         Duración del plan;6:01:04\r\n\
         Vueltas;236\r\n\
         Paradas;5\r\n\
         Sobra al final (vueltas);1,14\r\n\
         Reserva pedida (vueltas);0,80\r\n\
         Combustible de salida (L);82\r\n\
         Energía de salida (%);100\r\n\
         Combustible de llegada (L);2,1\r\n\
         Energía de llegada (%);2,6\r\n\
         \r\n\
         Tipo;Número;Vuelta desde;Vuelta hasta;Vueltas;Piloto;Combustible (L);Energía (%);Neumáticos;Servicio;Tiempo en boxes (s);Origen\r\n\
         Stint;1;1;43;43;Isaac;;;;;;\r\n\
         Parada;1;43;43;;;78;99;Nuevos;a la vez;64,6;Automático\r\n\
         Stint;2;44;85;42;Isaac;;;;;;\r\n\
         Parada;2;85;85;;;77;97;Nuevos;a la vez;63,8;Automático\r\n\
         Stint;3;86;127;42;Isaac;;;;;;\r\n\
         Parada;3;127;127;;;77;97;Nuevos;a la vez;63,8;Automático\r\n\
         Stint;4;128;170;43;Isaac;;;;;;\r\n\
         Parada;4;170;170;;;78;98;Nuevos;a la vez;64,2;Automático\r\n\
         Stint;5;171;212;42;Isaac;;;;;;\r\n\
         Parada;5;212;212;;;41;56;Nuevos;a la vez;55;Automático\r\n\
         Stint;6;213;236;24;Isaac;;;;;;\r\n\
         \r\n\
         Depósito (L);82\r\n\
         Consumo (L por vuelta);1,83\r\n\
         Energía (% por vuelta);2,316\r\n\
         Ritmo (s por vuelta);90,472\r\n\
         Servicio en la parada;a la vez\r\n\
         Hecho con Vantare\r\n";
    assert_eq!(std::str::from_utf8(&bytes[3..]).unwrap(), expected);
    // no bare line feed anywhere
    assert_eq!(
        bytes.iter().filter(|b| **b == b'\n').count(),
        bytes.windows(2).filter(|pair| pair == b"\r\n").count()
    );
}

#[test]
fn text_and_csv_say_the_same_stops() {
    let (entries, mut result) = (fuji_entries(), fuji_result());
    result.timeline.as_mut().unwrap().pits[1].pinned.ve_percent = true;
    let (text, bytes) = written(&proposal(&entries, &result));
    let rows = parsed(&bytes);
    let table: Vec<_> = rows
        .iter()
        .filter(|row| row[0] == "Parada")
        .map(|row| (row[1].clone(), row[2].clone(), row[6].clone(), row[7].clone()))
        .collect();
    let lines: Vec<_> = text
        .lines()
        .filter(|line| line.starts_with("Parada "))
        .map(|line| {
            let parts: Vec<_> = line.split(" · ").collect();
            (
                parts[0].strip_prefix("Parada ").unwrap().to_owned(),
                parts[1].strip_prefix("vuelta ").unwrap().to_owned(),
                parts[2].strip_prefix('+').unwrap().strip_suffix(" L").unwrap().to_owned(),
                parts[3]
                    .strip_prefix('+')
                    .unwrap()
                    .strip_suffix(" %")
                    .or_else(|| parts[3].strip_prefix('+').unwrap().strip_suffix(" % (fijado a mano)"))
                    .unwrap()
                    .to_owned(),
            )
        })
        .collect();
    assert_eq!(table, lines);
    assert_eq!(table.len(), 5);
    // the stints and the figures too
    assert_eq!(
        rows.iter().filter(|row| row[0] == "Stint").count(),
        text.lines().filter(|line| line.starts_with("Stint ")).count()
    );
    for figure in ["6:01:04", "236", "1,14", "0,80", "82", "2,1", "2,6", "Isaac"] {
        assert!(text.contains(figure), "text: {figure}");
        assert!(
            rows.iter().any(|row| row.iter().any(|cell| cell.contains(figure))),
            "csv: {figure}"
        );
    }
}

#[test]
fn an_accepted_plan_says_when_it_was_accepted_in_the_zone_of_the_person() {
    let (entries, result) = (fuji_entries(), fuji_result());
    let (text, bytes) = written(&accepted(&entries, &result, StrategyAcceptedState::Accepted, None));
    assert!(text.starts_with("PLAN ACEPTADO · 19/11/2026 19:42\nCarrera: Fuji 6 Horas"));
    assert_eq!(
        parsed(&bytes)[0],
        ["Estado", "PLAN ACEPTADO · 19/11/2026 19:42"]
    );
    assert!(!text.contains("AVISO") && !text.contains("DESACTUALIZADO"));
    // a zone that crosses midnight moves the date too
    let late = report(
        &accepted(&entries, &result, StrategyAcceptedState::Accepted, None),
        &chrono::FixedOffset::east_opt(6 * 3600).unwrap(),
    )
    .unwrap();
    assert!(super::export::text(&late).starts_with("PLAN ACEPTADO · 20/11/2026 00:42\n"));
}

#[test]
fn a_stale_plan_says_so_and_whether_it_still_reaches_the_finish() {
    let (entries, result) = (fuji_entries(), fuji_result());
    let (stale, bytes) = written(&accepted(&entries, &result, StrategyAcceptedState::Stale, None));
    let mut lines = stale.lines();
    assert_eq!(
        lines.next(),
        Some("PLAN ACEPTADO · 19/11/2026 19:42 · DESACTUALIZADO")
    );
    assert_eq!(
        lines.next(),
        Some("AVISO: los datos de la carrera han cambiado desde que se aceptó este plan")
    );
    assert_eq!(
        lines.next(),
        Some("Con los datos nuevos el plan todavía llega a meta, pero puede que ya no sea el más rápido")
    );
    assert_eq!(parsed(&bytes).iter().filter(|row| row[0] == "Aviso").count(), 2);
    for (cause, fail_lap, sentence) in [
        (
            StrategyUnreachableCause::ResourceExhausted,
            Some(170),
            "se queda sin combustible, energía o neumáticos en la vuelta 170",
        ),
        (
            StrategyUnreachableCause::ResourceExhausted,
            None,
            "se queda sin combustible, energía o neumáticos antes de meta",
        ),
        (
            StrategyUnreachableCause::ReserveNotMet,
            None,
            "termina sin la reserva de combustible que pediste",
        ),
        (
            StrategyUnreachableCause::ScheduleMismatch,
            None,
            "el calendario ya no cubre las vueltas de la carrera",
        ),
        (
            StrategyUnreachableCause::Other,
            None,
            "no se ha podido comprobar que llegue a meta",
        ),
    ] {
        let source = accepted(
            &entries,
            &result,
            StrategyAcceptedState::StaleUnreachable,
            Some(StrategyUnreachable { cause, fail_lap }),
        );
        let (text, bytes) = written(&source);
        assert!(
            text.starts_with(
                "PLAN ACEPTADO · 19/11/2026 19:42 · DESACTUALIZADO · NO LLEGA A META\nAVISO: "
            ),
            "{text}"
        );
        assert!(
            text.contains(&format!("Con los datos nuevos este plan NO llega a meta: {sentence}\n")),
            "{text}"
        );
        assert!(parsed(&bytes)
            .iter()
            .any(|row| row[0] == "Aviso" && row[1].ends_with(sentence)));
    }
}

#[test]
fn a_plan_without_guarantee_says_so_in_both_formats() {
    let entries = fuji_entries();
    let mut result = fuji_result();
    result.certificate = Some(StrategyCertificate::NotProven);
    result.reason = Some(StrategyReason::SearchBudgetExhausted);
    let (text, bytes) = written(&proposal(&entries, &result));
    assert!(text.contains(
        "SIN GARANTÍA: plan válido, pero no se ha comprobado que sea el más rápido\nLa búsqueda se detuvo antes de poder comprobarlo\n"
    ));
    let rows = parsed(&bytes);
    let guarantees: Vec<_> = rows.iter().filter(|row| row[0] == "Garantía").collect();
    assert_eq!(guarantees.len(), 2);
    assert!(guarantees[0][1].starts_with("SIN GARANTÍA"));
    // a coarser grid is said too, with its steps
    result.reason = Some(StrategyReason::FineGridNoFallback);
    result.degraded = true;
    let (text, _) = written(&proposal(&entries, &result));
    assert!(text.contains("prueba con pasos más gruesos\n"));
    assert!(text.contains(
        "El paso de carga es más grueso que el que pediste: de 1 L en 1 L y de 1 % en 1 %\n"
    ));
    // a proven plan on a coarser grid says it is the best of that grid only
    result.certificate = Some(StrategyCertificate::Proven);
    result.reason = None;
    let (text, _) = written(&proposal(&entries, &result));
    assert!(text.contains("El paso de carga es más grueso que el que pediste\n"));
    assert!(text.contains("podría haber uno algo más rápido"));
    assert!(!text.contains("Comprobado: es el plan más rápido con estos datos"));
}

#[test]
fn what_the_person_fixed_by_hand_is_marked_stop_by_stop() {
    let entries = fuji_entries();
    let mut result = fuji_result();
    let timeline = result.timeline.as_mut().unwrap();
    timeline.pits[1].pinned = StrategyPitPinned {
        fuel_liters: true,
        ve_percent: true,
        change_tyres: false,
    };
    timeline.pits[4].pinned.change_tyres = true;
    timeline.pits[4].change_tyres = false;
    let (text, bytes) = written(&proposal(&entries, &result));
    assert!(text.contains(
        "Parada 2 · vuelta 85 · +77 L (fijado a mano) · +97 % (fijado a mano) · ruedas nuevas · a la vez"
    ));
    assert!(text.contains(
        "Parada 5 · vuelta 212 · +41 L · +56 % · mismas ruedas (fijado a mano) · a la vez"
    ));
    assert_eq!(text.matches("(fijado a mano)").count(), 3);
    let origins: Vec<_> = parsed(&bytes)
        .iter()
        .filter(|row| row[0] == "Parada")
        .map(|row| row[11].clone())
        .collect();
    assert_eq!(
        origins,
        [
            "Automático",
            "Fijado a mano: combustible, energía",
            "Automático",
            "Automático",
            "Fijado a mano: neumáticos"
        ]
    );
}

#[test]
fn a_race_without_stops_or_with_a_resource_the_car_does_not_use_is_written_plainly() {
    let mut entries = fuji_entries();
    entries.inputs.ve_per_lap_percent = "0".into();
    entries.fields.track.clear();
    entries.fields.class.clear();
    let mut result = fuji_result();
    result.metrics.as_mut().unwrap().pit_count = 0;
    result.metrics.as_mut().unwrap().fuel_reserve_real_laps = None;
    let timeline = result.timeline.as_mut().unwrap();
    timeline.pits.clear();
    timeline.stints = vec![StrategyStint {
        from_lap: 1,
        to_lap: 1,
    }];
    timeline.ve_start_percent = n(0.0);
    timeline.ve_finish_percent = n(0.0);
    let (text, bytes) = written(&proposal(&entries, &result));
    assert!(text.contains("Duración del plan 6:01:04 · sin paradas · reserva pedida 0,80 v\n"));
    assert!(text.contains("Stint 1 · vueltas 1–1 (1 vuelta) · Isaac\n"));
    assert!(text.contains("Salida con 82 L\n") && text.contains("Llegada con 2,1 L\n"));
    assert!(!text.contains("Circuito") && !text.contains("Clase"));
    assert!(!text.contains("energía 0"));
    assert!(!parsed(&bytes).iter().any(|row| row[0] == "Parada"));
}

#[test]
fn a_result_with_no_plan_has_nothing_to_write() {
    let entries = fuji_entries();
    let mut result = fuji_result();
    for edit in [
        |result: &mut StrategyCalculationView| result.timeline = None,
        |result: &mut StrategyCalculationView| result.metrics = None,
        |result: &mut StrategyCalculationView| {
            result.certificate = Some(StrategyCertificate::NoSolution);
        },
        |result: &mut StrategyCalculationView| result.certificate = None,
    ] {
        edit(&mut result);
        assert!(report(&proposal(&entries, &result), &zone()).is_none());
        result = fuji_result();
    }
}

// ------------------------------------------------- spreadsheets and hostile names

const DANGER: [&str; 6] = ["=", "+", "-", "@", "\t", "\r"];

#[test]
fn a_text_that_a_spreadsheet_would_run_is_written_as_plain_text() {
    let result = fuji_result();
    for start in DANGER.into_iter().chain([" =", "\u{a0}@", "\n="]) {
        let hostile = format!("{start}SUM(1+1)");
        let mut entries = fuji_entries();
        entries.fields.name = hostile.clone();
        entries.fields.variant_name = hostile.clone();
        entries.fields.track = hostile.clone();
        entries.fields.class = hostile.clone();
        let mut result = result.clone();
        result.timeline.as_mut().unwrap().pilot = hostile.clone();
        let (text, bytes) = written(&proposal(&entries, &result));
        let rows = parsed(&bytes);
        let mut texts = 0;
        for row in &rows {
            for cell in row {
                // a number this module wrote starts with a digit; every text that
                // would start a formula is led by an apostrophe
                let first = cell.chars().find(|c| !matches!(c, ' ' | '\u{a0}'));
                assert!(
                    !cell.starts_with(['=', '+', '-', '@', '\t', '\r', '\n'])
                        && !first.is_some_and(|c| matches!(c, '=' | '+' | '-' | '@' | '\t' | '\r' | '\n')),
                    "{start:?}: {cell:?}"
                );
                if cell.contains("SUM(1+1)") {
                    texts += 1;
                    assert!(cell.starts_with('\''), "{start:?}: {cell:?}");
                    assert_eq!(cell.replace('\'', ""), hostile.replace('\'', ""), "kept as written");
                }
            }
        }
        // the race, the strategy, the track, the class and the pilot of every stint
        assert_eq!(texts, 4 + 6, "{start:?}");
        // the text begins every line with a word of ours, never with the person's
        for line in text.lines() {
            assert!(
                !line.starts_with(['=', '+', '-', '@', '\t', '\r']),
                "{start:?}: {line:?}"
            );
        }
        for line in text.lines().filter(|line| line.contains("SUM")) {
            assert!(
                line.starts_with("Carrera: ")
                    || line.starts_with("Circuito: ")
                    || line.starts_with("Stint "),
                "{line:?}"
            );
        }
    }
}

#[test]
fn quotes_semicolons_and_line_breaks_are_escaped_and_read_back_whole() {
    let mut entries = fuji_entries();
    entries.fields.name = "Fuji; \"6\" Horas".into();
    entries.fields.variant_name = "línea\r\nnueva;\"x\"".into();
    entries.fields.track = "plain".into();
    entries.fields.class = "ñandú · Ünïcode · 日本".into();
    let result = fuji_result();
    let (_, bytes) = written(&proposal(&entries, &result));
    let raw = std::str::from_utf8(&bytes).unwrap();
    assert!(raw.contains("Carrera;\"Fuji; \"\"6\"\" Horas\"\r\n"));
    assert!(raw.contains("Estrategia;\"línea\r\nnueva;\"\"x\"\"\"\r\n"));
    assert!(raw.contains("Clase;ñandú · Ünïcode · 日本\r\n"));
    let rows = parsed(&bytes);
    let value = |label: &str| rows.iter().find(|row| row[0] == label).unwrap()[1].clone();
    assert_eq!(value("Carrera"), "Fuji; \"6\" Horas");
    assert_eq!(value("Estrategia"), "línea\r\nnueva;\"x\"");
    assert_eq!(value("Clase"), "ñandú · Ünïcode · 日本");
    // every row of the first block has two fields and the table twelve
    for row in &rows {
        assert!(matches!(row.len(), 1 | 2 | 12), "{row:?}");
    }
}

#[test]
fn spanish_letters_travel_as_utf_8_after_the_byte_order_mark() {
    let mut entries = fuji_entries();
    entries.fields.name = "Gran Premio de España · Montmeló".into();
    let (text, bytes) = written(&proposal(&entries, &fuji_result()));
    assert!(text.contains("Carrera: Gran Premio de España · Montmeló"));
    assert_eq!(&bytes[..3], "\u{feff}".as_bytes());
    assert!(std::str::from_utf8(&bytes[3..])
        .unwrap()
        .contains("Carrera;Gran Premio de España · Montmeló\r\n"));
    assert!(bytes[3..].starts_with("Estado;".as_bytes()));
}

fn biggest() -> (StrategyComputeForm, StrategyCalculationView) {
    let big = "\"".repeat(crate::strategy::TEXT_LIMIT);
    let mut entries = fuji_entries();
    entries.fields.name.clone_from(&big);
    entries.fields.variant_name.clone_from(&big);
    entries.fields.track.clone_from(&big);
    entries.fields.class.clone_from(&big);
    let mut result = fuji_result();
    let timeline = result.timeline.as_mut().unwrap();
    timeline.pilot = big;
    timeline.stints.clear();
    timeline.pits.clear();
    for index in 0..=u32::try_from(crate::strategy::STRATEGY_PIT_LIMIT).unwrap() {
        timeline.stints.push(StrategyStint {
            from_lap: index * 10 + 1,
            to_lap: index * 10 + 10,
        });
        if (index as usize) < crate::strategy::STRATEGY_PIT_LIMIT {
            let mut stop = pit(index * 10 + 10, 999.999, 100.0, true, 3599.9);
            stop.pinned = StrategyPitPinned {
                fuel_liters: true,
                ve_percent: true,
                change_tyres: true,
            };
            timeline.pits.push(stop);
        }
    }
    (entries, result)
}

#[test]
fn the_biggest_plan_fits_the_limit_and_the_frame() {
    let (entries, result) = biggest();
    let (text, bytes) = written(&proposal(&entries, &result));
    assert!(text.len() < crate::strategy::STRATEGY_EXPORT_LIMIT, "{}", text.len());
    assert!(bytes.len() < crate::strategy::STRATEGY_EXPORT_LIMIT, "{}", bytes.len());
    // the answer travels in one frame, whatever the escaping of the quotes costs
    let frame = serde_json::to_vec(&crate::protocol::HostToUi::Response {
        id: 1,
        result: crate::protocol::Reply::StrategyExport {
            value: StrategyExportText { text },
        },
    })
    .unwrap();
    assert!(frame.len() < crate::frame::LIMIT / 8, "{}", frame.len());
}

// ------------------------------------------------------------------ the file name

#[test]
fn the_suggested_name_is_the_race_and_the_strategy_without_anything_dangerous() {
    // whatever the texts hold, the name is one the host accepts again
    for (race, strategy) in [
        ("../../Windows/system32", "x"),
        ("LPT\u{b2}", ""),
        ("=cmd|' /C calc'!A0", ""),
        ("a\u{202e}b", "c\u{2066}d"),
        ("\\\\servidor\\recurso", "C:\\x"),
        ("aux", "prn"),
        ("NUL.txt", ""),
        (".env.local", ""),
        ("~$plan", "..\\.."),
    ] {
        let name = suggested_name(race, strategy);
        assert!(crate::strategy::valid_file_name(&name), "{name:?}");
        assert!(name.ends_with(".csv") && !name.starts_with('.'), "{name:?}");
    }
    for (race, strategy, expected) in [
        ("Fuji 6 Horas", "Seco", "Fuji 6 Horas - Seco.csv"),
        ("Fuji 6 Horas", "", "Fuji 6 Horas.csv"),
        ("", "", "Plan de estrategia.csv"),
        ("  ", "\t", "Plan de estrategia.csv"),
        ("a/b\\c:d*e?f\"g<h>i|j", "k", "a b c d e f g h i j - k.csv"),
        ("...", "...", "Plan de estrategia.csv"),
        (".env", "", "env.csv"),
        ("CON", "", "Plan CON.csv"),
        ("nul", "", "Plan nul.csv"),
        ("COM1", "", "Plan COM1.csv"),
        ("con.txt", "", "Plan con.txt.csv"),
        ("fin.", "", "fin.csv"),
        ("a\u{202e}b\u{200f}c\u{7}d\0e", "", "a b c d e.csv"),
        ("Gran Premio de España", "Ñandú", "Gran Premio de España - Ñandú.csv"),
    ] {
        assert_eq!(suggested_name(race, strategy), expected, "{race:?} {strategy:?}");
    }
    // a name that is too long is cut on a character, never in the middle of one
    let long = suggested_name(&"ñ".repeat(300), &"é".repeat(300));
    assert!(long.len() <= 125 && long.ends_with(".csv"));
    assert!(crate::strategy::valid_file_name(&long));
    let long = suggested_name(&"a".repeat(512), "");
    assert_eq!(long.len(), 120 + 4);
}

// ----------------------------------------------------------------- the atomic write

#[test]
fn a_new_file_is_written_whole_and_nothing_is_left_beside_it() {
    let root = Root::new();
    let path = root.file("plan.csv");
    write_for_tests(&path, b"\xEF\xBB\xBFuno\r\n").unwrap();
    assert_eq!(
        root.listing(),
        [("plan.csv".to_owned(), Some(b"\xEF\xBB\xBFuno\r\n".to_vec()))].into()
    );
}

#[test]
fn a_csv_that_exists_is_replaced_whole() {
    let root = Root::new();
    let path = root.file("plan.csv");
    fs::write(&path, vec![b'x'; 5000]).unwrap();
    write_for_tests(&path, b"nuevo\r\n").unwrap();
    assert_eq!(fs::read(&path).unwrap(), b"nuevo\r\n");
    assert_eq!(root.listing().len(), 1);
    // and again, with more bytes than before
    write_for_tests(&path, &vec![b'y'; 9000]).unwrap();
    assert_eq!(fs::read(&path).unwrap(), vec![b'y'; 9000]);
    assert_eq!(root.listing().len(), 1);
}

#[test]
fn a_write_that_cannot_happen_leaves_the_target_and_the_folder_as_they_were() {
    let root = Root::new();
    // a folder in the way
    let folder = root.file("plan.csv");
    fs::create_dir(&folder).unwrap();
    fs::write(folder.join("dentro.txt"), b"a").unwrap();
    let before = root.listing();
    assert_eq!(
        write_for_tests(&folder, b"x"),
        Err(HostError::StrategyFileUnavailable)
    );
    assert_eq!(root.listing(), before);
    assert_eq!(fs::read(folder.join("dentro.txt")).unwrap(), b"a");
    // a folder that is not there
    assert_eq!(
        write_for_tests(&root.file("no-existe").join("plan.csv"), b"x"),
        Err(HostError::StrategyFileUnavailable)
    );
    // a read-only file is not replaced
    let locked = root.file("solo-lectura.csv");
    fs::write(&locked, b"intacto").unwrap();
    let mut permissions = fs::metadata(&locked).unwrap().permissions();
    permissions.set_readonly(true);
    fs::set_permissions(&locked, permissions.clone()).unwrap();
    let before = root.listing();
    assert_eq!(
        write_for_tests(&locked, b"x"),
        Err(HostError::StrategyFileUnavailable)
    );
    assert_eq!(root.listing(), before);
    #[allow(clippy::permissions_set_readonly_false)]
    permissions.set_readonly(false);
    fs::set_permissions(&locked, permissions).unwrap();
}

#[cfg(windows)]
#[test]
fn a_csv_another_program_holds_open_is_in_use_and_stays_whole() {
    use std::os::windows::fs::OpenOptionsExt;
    let root = Root::new();
    let path = root.file("plan.csv");
    fs::write(&path, "abierto en una hoja de cálculo".as_bytes()).unwrap();
    // what a spreadsheet does: it shares reading, never deleting or renaming
    let held = fs::OpenOptions::new()
        .read(true)
        .share_mode(1)
        .open(&path)
        .unwrap();
    let before = root.listing();
    assert_eq!(write_for_tests(&path, b"nuevo"), Err(HostError::StrategyFileInUse));
    assert_eq!(root.listing(), before);
    drop(held);
    write_for_tests(&path, b"nuevo").unwrap();
    assert_eq!(fs::read(&path).unwrap(), b"nuevo");
    assert_eq!(root.listing().len(), 1);
}

#[test]
fn no_temporary_file_survives_a_write_that_fails_halfway() {
    // the rename fails when the target is a folder that appears after the checks:
    // the closest honest equivalent is a target that is a non-empty folder
    let root = Root::new();
    let target = root.file("plan.csv");
    fs::create_dir(&target).unwrap();
    for _ in 0..5 {
        let _ = write_for_tests(&target, b"x");
    }
    assert_eq!(root.listing().len(), 1);
    assert!(Path::new(&target).is_dir());
}

#[test]
fn the_wire_names_are_the_documented_ones() {
    let target = |text: &str| serde_json::from_str::<StrategyExportTarget>(text);
    assert_eq!(
        target(r#"{"kind":"proposal","computeId":7}"#).unwrap(),
        StrategyExportTarget::Proposal { compute_id: 7 }
    );
    assert_eq!(
        target(r#"{"kind":"accepted"}"#).unwrap(),
        StrategyExportTarget::Accepted {}
    );
    for bad in [
        r#"{"kind":"proposal"}"#,
        r#"{"kind":"proposal","computeId":-1}"#,
        r#"{"kind":"proposal","computeId":7,"path":"C:/x.csv"}"#,
        r#"{"kind":"accepted","computeId":7}"#,
        r#"{"kind":"file"}"#,
        r#"{"computeId":7}"#,
        r#""accepted""#,
    ] {
        assert!(target(bad).is_err(), "{bad}");
    }
    assert_eq!(
        serde_json::to_string(&StrategyExportFileValue::Ticket {
            suggested_name: "a.csv".into()
        })
        .unwrap(),
        r#"{"kind":"ticket","suggestedName":"a.csv"}"#
    );
    assert_eq!(
        serde_json::to_string(&StrategyExportFileValue::Saved {
            file: StrategyFile { name: "a.csv".into() }
        })
        .unwrap(),
        r#"{"kind":"saved","file":{"name":"a.csv"}}"#
    );
    assert_eq!(
        serde_json::to_string(&StrategyExportFileValue::Cancelled).unwrap(),
        r#"{"kind":"cancelled"}"#
    );
    for (error, wire) in [
        (HostError::StrategyNothingToExport, "strategyNothingToExport"),
        (HostError::StrategyExportNotCsv, "strategyExportNotCsv"),
    ] {
        assert_eq!(
            serde_json::to_string(&error).unwrap(),
            format!(r#"{{"kind":"{wire}"}}"#)
        );
    }
}


// ------------------------------------------------------------- the session and tickets

const LIFETIME: Duration = Duration::from_secs(STRATEGY_PICK_LIFETIME_SECONDS);

fn event_fields() -> StrategyFields {
    StrategyFields {
        name: "Fuji".into(),
        duration_minutes: "90".into(),
        fuel_capacity_liters: "12".into(),
        pit_transit_seconds: "25".into(),
        track: "Fuji".into(),
        class: "GT3".into(),
        variant_name: "Base".into(),
        variant_mode: "dry".into(),
        driver_name: "Pilot".into(),
        driver_initials: "PI".into(),
        ..StrategyFields::default()
    }
}

/// A race of 24 laps with a tank of twelve: several stops, proven in milliseconds.
fn event_inputs() -> StrategySolverFields {
    StrategySolverFields {
        base_pace_seconds: "90.5".into(),
        fuel_per_lap_liters: "1.83".into(),
        race_laps: "24".into(),
        ve_capacity_percent: "0".into(),
        ve_per_lap_percent: "0".into(),
        tyre_life_laps: "60".into(),
        degradation_seconds: "0".into(),
        refuel_rate: "4".into(),
        ve_rate: "2.5".into(),
        tyre_service_seconds: "30".into(),
        formation_seconds: "0".into(),
        fuel_step: "1".into(),
        ve_step: "1".into(),
        reserve_laps: "0".into(),
        service_mode: "parallel".into(),
    }
}

fn event_form(change: impl FnOnce(&mut StrategyComputeForm)) -> StrategyComputeForm {
    let mut form = StrategyComputeForm {
        fields: event_fields(),
        inputs: event_inputs(),
    };
    change(&mut form);
    form
}

fn compute(state: &mut State, form: &StrategyComputeForm) -> StrategyView {
    let view = state.view();
    state
        .compute(
            view.active_event_id.as_deref().unwrap(),
            view.active_strategy_id.as_deref().unwrap(),
            &view.revision,
            form,
        )
        .unwrap();
    state.test_join_calculation();
    state.view()
}

/// A saved event with its plan calculated: the proposal on screen.
fn planned(root: &Root) -> (State, StrategyView) {
    let mut state = root.state();
    let empty = state.open().unwrap();
    let created = state
        .create(
            &empty.revision,
            &event_fields(),
            None,
            None,
            Some(&event_inputs()),
            NOW,
        )
        .unwrap();
    state.save(&created.revision).unwrap();
    let view = compute(&mut state, &event_form(|_| {}));
    assert_eq!(view.plan.state, StrategyPlanState::Calculated);
    (state, view)
}

fn proposal_of(view: &StrategyView) -> StrategyExportTarget {
    StrategyExportTarget::Proposal {
        compute_id: view.plan.compute_id.unwrap(),
    }
}

fn export(state: &State, target: &StrategyExportTarget) -> Result<String, HostError> {
    state
        .export_text(&state.view().revision, target)
        .map(|value| value.text)
}

fn accept(state: &mut State) -> StrategyView {
    let view = state.view();
    state
        .accept(&view.revision, view.plan.compute_id.unwrap(), NOW)
        .unwrap()
}

/// What the renderer's request opens, then what the main process answers.
fn ask(
    state: &mut State,
    target: &StrategyExportTarget,
    now: Instant,
) -> Result<StrategyExportFileValue, HostError> {
    let revision = state.view().revision;
    state.export_file(ID, &revision, target.clone(), now)
}

fn answer(
    state: &mut State,
    path: Option<&str>,
    now: Instant,
) -> Result<StrategyExportFileValue, HostError> {
    match state.picked(
        &StrategyFileSelection {
            id: ID,
            path: path.map(str::to_owned),
        },
        now,
    )? {
        Picked::Export(value) => Ok(value),
        Picked::View(_) => panic!("a view answers a file dialog, not an export"),
    }
}

fn choose(
    state: &mut State,
    target: &StrategyExportTarget,
    path: &str,
) -> Result<StrategyExportFileValue, HostError> {
    let now = Instant::now();
    ask(state, target, now)?;
    answer(state, Some(path), now)
}

#[test]
fn the_proposal_the_accepted_plan_and_a_stale_one_are_exported_from_the_session() {
    let root = Root::new();
    let (mut state, proposal) = planned(&root);
    let text = export(&state, &proposal_of(&proposal)).unwrap();
    assert!(
        text.starts_with("PROPUESTA SIN ACEPTAR\nCarrera: Fuji · Estrategia: Base\n"),
        "{text}"
    );
    assert!(text.contains("Stint 1 · vueltas 1–") && text.contains("Parada 1 · vuelta "));
    assert!(text.ends_with("Hecho con Vantare"));
    // nothing accepted yet
    assert_eq!(
        export(&state, &StrategyExportTarget::Accepted {}),
        Err(HostError::StrategyNothingToExport)
    );
    accept(&mut state);
    let text = export(&state, &StrategyExportTarget::Accepted {}).unwrap();
    // the date is in the zone of the machine: the shape is what is fixed
    let line = text.lines().next().unwrap();
    let date = line.strip_prefix("PLAN ACEPTADO · ").unwrap();
    assert!(
        date.len() == 16
            && date.char_indices().all(|(index, c)| match index {
                2 | 5 => c == '/',
                10 => c == ' ',
                13 => c == ':',
                _ => c.is_ascii_digit(),
            }),
        "{line}"
    );
    assert!(!text.contains("DESACTUALIZADO"));
    // the data changes: the accepted plan is stale, never gone, and says so
    let view = state.view();
    let changed = state
        .confirm(
            view.active_event_id.as_deref().unwrap(),
            view.active_strategy_id.as_deref().unwrap(),
            &view.revision,
            &event_fields(),
            Some(&StrategySolverFields {
                fuel_per_lap_liters: "1.95".into(),
                ..event_inputs()
            }),
        )
        .unwrap();
    assert_ne!(
        changed.plan.accepted.as_ref().unwrap().state,
        StrategyAcceptedState::Accepted
    );
    let text = export(&state, &StrategyExportTarget::Accepted {}).unwrap();
    assert!(text.contains("DESACTUALIZADO"), "{text}");
    assert!(text.contains("AVISO: los datos de la carrera han cambiado"));
    // and it is still the plan as it was accepted: the old consumption
    assert!(text.contains("consumo 1,83 L/v"), "{text}");
    // nothing of this changed the document or the plan on screen
    assert_eq!(state.view(), changed);
}

#[test]
fn only_a_plan_that_is_calculated_not_edited_and_with_a_timeline_is_exported() {
    let root = Root::new();
    let (mut state, proposal) = planned(&root);
    let good = proposal_of(&proposal);
    let before = state.view();
    let id = proposal.plan.compute_id.unwrap();
    // another calculation or an old revision is a conflict that carries the view
    for (revision, target) in [
        (
            before.revision.clone(),
            StrategyExportTarget::Proposal { compute_id: id + 1 },
        ),
        (
            before.revision.clone(),
            StrategyExportTarget::Proposal { compute_id: 0 },
        ),
        ("0".repeat(64), good.clone()),
    ] {
        for error in [
            state.export_text(&revision, &target).unwrap_err(),
            state
                .export_file(ID, &revision, target.clone(), Instant::now())
                .unwrap_err(),
        ] {
            assert!(
                matches!(error, HostError::StrategyConflict { .. }),
                "{error:?}"
            );
        }
    }
    assert_eq!(
        state.export_text("no-es-una-revision", &good),
        Err(HostError::Rejected)
    );
    assert_eq!(state.view(), before);
    // an impossible plan has no timeline
    let impossible = event_form(|form| form.fields.fuel_capacity_liters = "1".into());
    let view = compute(&mut state, &impossible);
    assert!(view.plan.result.as_ref().unwrap().timeline.is_none());
    assert_eq!(
        export(&state, &proposal_of(&view)),
        Err(HostError::StrategyNothingToExport)
    );
    assert_eq!(
        ask(&mut state, &proposal_of(&view), Instant::now()),
        Err(HostError::StrategyNothingToExport)
    );
    // a running calculation is busy
    let view = state.view();
    state
        .compute(
            view.active_event_id.as_deref().unwrap(),
            view.active_strategy_id.as_deref().unwrap(),
            &view.revision,
            &event_form(|_| {}),
        )
        .unwrap();
    let running = state.view();
    assert_eq!(export(&state, &proposal_of(&running)), Err(HostError::Busy));
    state.test_join_calculation();
    let done = state.view();
    export(&state, &proposal_of(&done)).unwrap();
    // an edited schedule has to be recalculated first
    let stop = done.plan.edit.as_ref().unwrap().stops[0].clone();
    let edited = state
        .move_stop(
            &done.revision,
            done.plan.compute_id.unwrap(),
            0,
            if stop.lap < stop.max_lap { 1 } else { -1 },
        )
        .unwrap();
    assert_eq!(
        export(&state, &proposal_of(&edited)),
        Err(HostError::StrategyEditPending)
    );
    // no session, no export
    let mut closed = root.state();
    assert_eq!(
        closed.export_text(&"a".repeat(64), &good),
        Err(HostError::Denied)
    );
    assert_eq!(
        closed.export_file(ID, &"a".repeat(64), good, Instant::now()),
        Err(HostError::Denied)
    );
}

#[test]
fn the_request_is_acknowledged_with_a_safe_name_and_keeps_one_ticket() {
    let root = Root::new();
    let (mut state, proposal) = planned(&root);
    let target = proposal_of(&proposal);
    let now = Instant::now();
    assert_eq!(
        ask(&mut state, &target, now),
        Ok(StrategyExportFileValue::Ticket {
            suggested_name: "Fuji - Base.csv".into()
        })
    );
    // one at a time, and a file dialog cannot start beside it
    assert_eq!(ask(&mut state, &target, now), Err(HostError::Busy));
    let revision = state.view().revision;
    assert_eq!(
        state.pick_file(ID + 1, StrategyFileMode::SaveAs, &revision, now),
        Err(HostError::Busy)
    );
    // the ticket is for the main process only
    for id in [0, 1, 0x7fff_ffff, u32::MAX] {
        assert_eq!(
            state.export_file(id, &revision, target.clone(), now + LIFETIME),
            Err(HostError::Denied),
            "{id}"
        );
    }
    // once expired a new one is welcome
    assert!(ask(&mut state, &target, now + LIFETIME).is_ok());
}

#[test]
fn the_answer_writes_the_csv_and_gives_back_only_its_name() {
    let root = Root::new();
    let (mut state, proposal) = planned(&root);
    let target = proposal_of(&proposal);
    let before = state.view();
    let files = root.listing();
    let path = root.file("Fuji - Base.csv");
    let value = choose(&mut state, &target, &root.text("Fuji - Base.csv")).unwrap();
    assert_eq!(
        value,
        StrategyExportFileValue::Saved {
            file: StrategyFile {
                name: "Fuji - Base.csv".into()
            }
        }
    );
    let bytes = fs::read(&path).unwrap();
    assert_eq!(&bytes[..3], [0xEF, 0xBB, 0xBF]);
    let rows = parsed(&bytes);
    assert_eq!(rows[0], ["Estado", "PROPUESTA SIN ACEPTAR"]);
    assert!(rows.iter().any(|row| row == &["Carrera", "Fuji"]));
    // the same plan as the text
    let text = export(&state, &target).unwrap();
    let stops = text
        .lines()
        .filter(|line| line.starts_with("Parada "))
        .count();
    assert_eq!(rows.iter().filter(|row| row[0] == "Parada").count(), stops);
    // the document and the plan on screen are untouched, and nothing else is left
    assert_eq!(state.view(), before);
    let mut expected = files;
    expected.insert("Fuji - Base.csv".to_owned(), Some(bytes.clone()));
    assert_eq!(root.listing(), expected);
    // a CSV that exists is replaced after the dialog of the system asked
    fs::write(&path, b"otro contenido").unwrap();
    choose(&mut state, &target, &root.text("Fuji - Base.csv")).unwrap();
    assert_eq!(fs::read(&path).unwrap(), bytes);
    // the accepted plan goes to a file the same way
    accept(&mut state);
    choose(
        &mut state,
        &StrategyExportTarget::Accepted {},
        &root.text("aceptado.csv"),
    )
    .unwrap();
    assert!(
        parsed(&fs::read(root.file("aceptado.csv")).unwrap())[0][1].starts_with("PLAN ACEPTADO · ")
    );
}

#[test]
fn a_cancelled_dialog_writes_nothing_and_consumes_the_ticket() {
    let root = Root::new();
    let (mut state, proposal) = planned(&root);
    let target = proposal_of(&proposal);
    let before = root.listing();
    let now = Instant::now();
    ask(&mut state, &target, now).unwrap();
    assert_eq!(
        answer(&mut state, None, now),
        Ok(StrategyExportFileValue::Cancelled)
    );
    assert_eq!(root.listing(), before);
    // the ticket is gone
    assert_eq!(
        answer(&mut state, Some(&root.text("x.csv")), now),
        Err(HostError::Denied)
    );
    assert_eq!(root.listing(), before);
}

#[test]
fn a_ticket_serves_one_answer_only_for_its_own_id_and_only_while_it_lives() {
    let root = Root::new();
    let (mut state, proposal) = planned(&root);
    let target = proposal_of(&proposal);
    let before = root.listing();
    let now = Instant::now();
    // without a ticket nothing is written
    assert_eq!(
        answer(&mut state, Some(&root.text("a.csv")), now),
        Err(HostError::Denied)
    );
    ask(&mut state, &target, now).unwrap();
    // another id changes nothing and leaves the ticket for its owner
    for id in [ID + 1, 0, 1, u32::MAX] {
        let error = state
            .picked(
                &StrategyFileSelection {
                    id,
                    path: Some(root.text("b.csv")),
                },
                now,
            )
            .map(|_| ())
            .unwrap_err();
        assert_eq!(error, HostError::Denied, "{id}");
    }
    assert_eq!(root.listing(), before);
    // the first answer is the only one
    answer(&mut state, Some(&root.text("c.csv")), now).unwrap();
    assert_eq!(
        answer(&mut state, Some(&root.text("d.csv")), now),
        Err(HostError::Denied)
    );
    assert!(root.file("c.csv").is_file() && !root.file("d.csv").exists());
    // an expired ticket creates nothing, and is gone
    ask(&mut state, &target, now).unwrap();
    assert_eq!(
        answer(&mut state, Some(&root.text("e.csv")), now + LIFETIME),
        Err(HostError::StrategyPickExpired)
    );
    assert!(!root.file("e.csv").exists());
    assert_eq!(
        answer(&mut state, Some(&root.text("e.csv")), now),
        Err(HostError::Denied)
    );
    // and one millisecond before it is still good
    ask(&mut state, &target, now).unwrap();
    answer(
        &mut state,
        Some(&root.text("f.csv")),
        now + LIFETIME - Duration::from_millis(1),
    )
    .unwrap();
    assert!(root.file("f.csv").is_file());
}

#[test]
fn an_export_ticket_is_never_answered_as_a_file_dialog_and_the_other_way_round() {
    let root = Root::new();
    let (mut state, proposal) = planned(&root);
    let target = proposal_of(&proposal);
    let now = Instant::now();
    // an export ticket answered the old way is denied and keeps the ticket
    ask(&mut state, &target, now).unwrap();
    let selection = StrategyFileSelection {
        id: ID,
        path: Some(root.text("a.csv")),
    };
    assert_eq!(state.picked_file(&selection, now), Err(HostError::Denied));
    assert!(!root.file("a.csv").exists());
    answer(&mut state, Some(&root.text("a.csv")), now).unwrap();
    // a file dialog ticket answers with a view, as before
    let revision = state.view().revision;
    state
        .pick_file(ID, StrategyFileMode::SaveAs, &revision, now)
        .unwrap();
    let picked = state
        .picked(
            &StrategyFileSelection {
                id: ID,
                path: Some(root.text("copia.json")),
            },
            now,
        )
        .unwrap();
    assert!(matches!(picked, Picked::View(_)));
    assert!(root.file("copia.json").is_file());
}

#[test]
fn what_changes_between_the_ticket_and_the_answer_stops_the_write() {
    let root = Root::new();
    let (mut state, proposal) = planned(&root);
    let target = proposal_of(&proposal);
    let now = Instant::now();
    // the document changed: another revision
    ask(&mut state, &target, now).unwrap();
    accept(&mut state);
    let error = answer(&mut state, Some(&root.text("a.csv")), now).unwrap_err();
    assert!(
        matches!(error, HostError::StrategyConflict { .. }),
        "{error:?}"
    );
    assert!(!root.file("a.csv").exists());
    // the proposal on screen is another calculation
    ask(&mut state, &target, now).unwrap();
    let fresh = compute(&mut state, &event_form(|_| {}));
    assert_ne!(fresh.plan.compute_id, proposal.plan.compute_id);
    let error = answer(&mut state, Some(&root.text("b.csv")), now).unwrap_err();
    assert!(
        matches!(error, HostError::StrategyConflict { .. }),
        "{error:?}"
    );
    assert!(!root.file("b.csv").exists());
    // the same plan on screen is written
    ask(&mut state, &proposal_of(&fresh), now).unwrap();
    answer(&mut state, Some(&root.text("c.csv")), now).unwrap();
    assert!(root.file("c.csv").is_file());
}

#[test]
fn a_path_that_is_not_a_plain_csv_is_refused_and_nothing_is_written() {
    let root = Root::new();
    let (mut state, proposal) = planned(&root);
    let target = proposal_of(&proposal);
    // what the main process could not have chosen
    let mut unavailable = vec![
        String::new(),
        "plan.csv".to_owned(),
        "relativo/plan.csv".to_owned(),
        format!("{}\0.csv", root.text("a")),
        format!("{}/../plan.csv", root.0.display()),
        root.text(".env.csv"),
        root.text("CON.csv"),
        root.text("nul.csv"),
        "x".repeat(STRATEGY_PICK_PATH_MAX + 1),
    ];
    if cfg!(windows) {
        unavailable.extend([
            r"\\?\C:\plan.csv".to_owned(),
            r"\\servidor\recurso\plan.csv".to_owned(),
            r"\\.\COM1".to_owned(),
            r"C:plan.csv".to_owned(),
            r"C:\plan.csv:flujo.csv".to_owned(),
        ]);
    }
    let before = root.listing();
    for path in &unavailable {
        assert_eq!(
            choose(&mut state, &target, path),
            Err(HostError::StrategyFileUnavailable),
            "{path:?}"
        );
    }
    // a file that is not a CSV: the host never writes a CSV over something else
    for name in ["plan.json", "plan.txt", "plan", "plan.csv.exe", "plan.xlsx"] {
        assert_eq!(
            choose(&mut state, &target, &root.text(name)),
            Err(HostError::StrategyExportNotCsv),
            "{name}"
        );
        assert!(!root.file(name).exists());
    }
    assert_eq!(root.listing(), before);
    // any case of the extension is a CSV
    for name in ["a.csv", "b.CSV", "c.Csv"] {
        choose(&mut state, &target, &root.text(name)).unwrap();
    }
}

#[test]
fn a_csv_never_replaces_the_document_or_the_primary_file() {
    let root = Root::new();
    let (mut state, proposal) = planned(&root);
    let target = proposal_of(&proposal);
    let primary = fs::read(root.primary()).unwrap();
    // the primary file is not a CSV, so it is refused before anything else
    assert_eq!(
        choose(&mut state, &target, &root.text(PRIMARY)),
        Err(HostError::StrategyExportNotCsv)
    );
    assert_eq!(fs::read(root.primary()).unwrap(), primary);
    // a document that lives in a file called .csv is protected all the same
    let elsewhere = Root::new();
    let document = elsewhere.file("estrategia.csv");
    fs::write(&document, &primary).unwrap();
    let mut other = elsewhere.state();
    other.open().unwrap();
    let revision = other.view().revision;
    let now = Instant::now();
    other
        .pick_file(ID, StrategyFileMode::Open, &revision, now)
        .unwrap();
    other
        .picked(
            &StrategyFileSelection {
                id: ID,
                path: Some(elsewhere.text("estrategia.csv")),
            },
            now,
        )
        .unwrap();
    assert_eq!(other.file().unwrap().name, "estrategia.csv");
    let before = fs::read(&document).unwrap();
    let view = compute(&mut other, &event_form(|_| {}));
    assert_eq!(
        choose(
            &mut other,
            &proposal_of(&view),
            &elsewhere.text("estrategia.csv")
        ),
        Err(HostError::StrategyTargetExists)
    );
    assert_eq!(fs::read(&document).unwrap(), before);
}

#[test]
fn a_target_that_cannot_be_written_is_unavailable_and_leaves_nothing_behind() {
    let root = Root::new();
    let (mut state, proposal) = planned(&root);
    let target = proposal_of(&proposal);
    // a folder in the way, and a folder that is not there
    fs::create_dir(root.file("carpeta.csv")).unwrap();
    let before = root.listing();
    assert_eq!(
        choose(&mut state, &target, &root.text("carpeta.csv")),
        Err(HostError::StrategyFileUnavailable)
    );
    assert_eq!(
        choose(
            &mut state,
            &target,
            root.file("falta").join("plan.csv").to_str().unwrap()
        ),
        Err(HostError::StrategyFileUnavailable)
    );
    assert_eq!(root.listing(), before);
}

#[test]
fn no_path_goes_over_the_wire_only_a_name() {
    let root = Root::new();
    let (mut state, proposal) = planned(&root);
    let target = proposal_of(&proposal);
    let secret = root.0.to_str().unwrap().to_owned();
    let mut wire: Vec<String> = Vec::new();
    let now = Instant::now();
    wire.push(serde_json::to_string(&ask(&mut state, &target, now)).unwrap());
    wire.push(
        serde_json::to_string(&answer(&mut state, Some(&root.text("Fuji - Base.csv")), now))
            .unwrap(),
    );
    // every failure of the flow, with the path that caused it
    for path in [
        root.text("plan.json"),
        root.text(PRIMARY),
        root.file("falta")
            .join("plan.csv")
            .to_str()
            .unwrap()
            .to_owned(),
        format!("{secret}/../x.csv"),
    ] {
        wire.push(serde_json::to_string(&choose(&mut state, &target, &path)).unwrap());
    }
    wire.push(serde_json::to_string(&export(&state, &target)).unwrap());
    let conflict = state.export_text(&"0".repeat(64), &target).unwrap_err();
    wire.push(serde_json::to_string(&conflict).unwrap());
    for json in &wire {
        assert!(!json.contains(&secret), "{json}");
    }
    // and the debug form of the trusted answer hides it too
    let selection = StrategyFileSelection {
        id: ID,
        path: Some(root.text("x.csv")),
    };
    assert!(!format!("{selection:?}").contains(&secret));
}

// ------------------------------------- numbers, hostile names and the file system

#[test]
fn a_number_is_a_number_and_a_text_is_a_text_in_the_csv() {
    let mut entries = fuji_entries();
    let mut result = fuji_result();
    // a plan that finishes short of the reserve: a negative figure
    result
        .metrics
        .as_mut()
        .unwrap()
        .fuel_reserve_real_laps = Some(n(-3.5));
    result.timeline.as_mut().unwrap().fuel_finish_liters = n(0.96);
    let (_, bytes) = written(&proposal(&entries, &result));
    let rows = parsed(&bytes);
    let value = |label: &str| rows.iter().find(|row| row[0] == label).unwrap()[1].clone();
    // the numbers are written as numbers: a decimal comma, a minus, no apostrophe
    assert_eq!(value("Sobra al final (vueltas)"), "-3,50");
    assert_eq!(value("Combustible de llegada (L)"), "0,96");
    assert_eq!(value("Reserva pedida (vueltas)"), "0,80");
    assert_eq!(value("Vueltas"), "236");
    assert!(rows.iter().all(|row| row.iter().all(|cell| !cell.starts_with('\''))));
    // the texts of the person are the ones that get the apostrophe
    for hostile in ["=1+1", "-cmd", "@SUM(A1)", " =x", "\u{a0}=x", "+1"] {
        entries.fields.name = hostile.into();
        let (_, bytes) = written(&proposal(&entries, &result));
        let rows = parsed(&bytes);
        let race = rows.iter().find(|row| row[0] == "Carrera").unwrap();
        assert_eq!(race[1], format!("'{hostile}"), "{hostile:?}");
        // and a number beside it is still a bare number
        assert_eq!(
            rows.iter().find(|row| row[0] == "Sobra al final (vueltas)").unwrap()[1],
            "-3,50"
        );
    }
    // a text that does not start a formula is left as it is
    entries.fields.name = "Fuji - 6 Horas = largas @ casa".into();
    let (_, bytes) = written(&proposal(&entries, &result));
    assert_eq!(
        parsed(&bytes).iter().find(|row| row[0] == "Carrera").unwrap()[1],
        "Fuji - 6 Horas = largas @ casa"
    );
}

#[test]
fn names_that_do_not_end_in_plain_csv_are_refused_and_nothing_is_created() {
    let root = Root::new();
    let (mut state, proposal) = planned(&root);
    let target = proposal_of(&proposal);
    let before = root.listing();
    for name in [
        "plan.csv.",
        "plan.CSV.",
        "plan.csv .",
        "plan.csv ",
        ".csv",
        "plan.csv.exe",
        "plan.exe.csv.txt",
        "plan.csv:flujo",
        "plan.csv::$DATA",
        "plan.csv:flujo.csv",
    ] {
        let error = choose(&mut state, &target, &root.text(name)).unwrap_err();
        assert!(
            matches!(
                error,
                HostError::StrategyExportNotCsv | HostError::StrategyFileUnavailable
            ),
            "{name}: {error:?}"
        );
        assert_eq!(root.listing(), before, "{name}");
    }
    // the plain ones are accepted
    for name in ["plan.csv", "plan.CSV", "a.b.csv", " plan.csv"] {
        choose(&mut state, &target, &root.text(name)).unwrap_or_else(|error| {
            panic!("{name}: {error:?}");
        });
    }
}

/// A document that lives in `estrategia.csv`, with its plan calculated.
fn csv_document(root: &Root) -> (State, StrategyExportTarget, Vec<u8>) {
    let (mut state, _) = planned(root);
    let revision = state.view().revision;
    let now = Instant::now();
    let copy = root.file("estrategia.csv");
    fs::copy(root.primary(), &copy).unwrap();
    state
        .pick_file(ID, StrategyFileMode::Open, &revision, now)
        .unwrap();
    state
        .picked(
            &StrategyFileSelection {
                id: ID,
                path: Some(root.text("estrategia.csv")),
            },
            now,
        )
        .unwrap();
    assert_eq!(state.file().unwrap().name, "estrategia.csv");
    let view = compute(&mut state, &event_form(|_| {}));
    let bytes = fs::read(&copy).unwrap();
    (state, proposal_of(&view), bytes)
}

#[test]
fn the_open_document_is_never_overwritten_by_any_spelling_of_its_path() {
    let root = Root::new();
    let (mut state, target, document) = csv_document(&root);
    let folder = root.0.to_str().unwrap().to_owned();
    let mut spellings = vec![
        root.text("estrategia.csv"),
        root.text("ESTRATEGIA.CSV"),
        root.text("Estrategia.Csv"),
        format!("{folder}/./estrategia.csv"),
        format!("{folder}/estrategia.csv"),
    ];
    if cfg!(windows) {
        spellings.push(format!("{folder}\\.\\estrategia.csv"));
        spellings.push(folder.to_uppercase() + "\\estrategia.csv");
        // the 8.3 name of the document, when the volume keeps them
        let short = std::process::Command::new("cmd")
            .arg("/C")
            .arg(format!(
                "for %I in (\"{}\") do @echo %~sI",
                root.text("estrategia.csv")
            ))
            .output()
            .unwrap();
        let short = String::from_utf8_lossy(&short.stdout).trim().to_owned();
        if !short.is_empty() && !short.eq_ignore_ascii_case(&root.text("estrategia.csv")) {
            spellings.push(short);
        }
    }
    for path in &spellings {
        let result = choose(&mut state, &target, path);
        assert!(result.is_err(), "{path}: {result:?}");
        assert_eq!(fs::read(root.file("estrategia.csv")).unwrap(), document, "{path}");
    }
    // `..` never gets past the checks of the path
    assert_eq!(
        choose(
            &mut state,
            &target,
            &format!("{folder}/../{}/estrategia.csv", root.0.file_name().unwrap().to_str().unwrap())
        ),
        Err(HostError::StrategyFileUnavailable)
    );
    assert_eq!(fs::read(root.file("estrategia.csv")).unwrap(), document);
}

#[test]
fn a_hard_link_to_the_document_is_replaced_as_a_name_and_the_document_is_left_whole() {
    let root = Root::new();
    let (mut state, proposal) = planned(&root);
    let target = proposal_of(&proposal);
    let document = fs::read(root.primary()).unwrap();
    fs::hard_link(root.primary(), root.file("enlace.csv")).unwrap();
    // the link is another name of the same bytes: replacing the NAME never writes
    // through it
    choose(&mut state, &target, &root.text("enlace.csv")).unwrap();
    assert_eq!(fs::read(root.primary()).unwrap(), document);
    assert_ne!(fs::read(root.file("enlace.csv")).unwrap(), document);
}

#[cfg(windows)]
#[test]
fn a_folder_or_file_reached_through_a_junction_is_refused_and_nothing_is_created() {
    let root = Root::new();
    let elsewhere = Root::new();
    let (mut state, proposal) = planned(&root);
    let target = proposal_of(&proposal);
    let through = Root::new();
    let status = std::process::Command::new("cmd")
        .args(["/C", "mklink", "/J"])
        .arg(through.file("vinculo"))
        .arg(&elsewhere.0)
        .output()
        .unwrap();
    assert!(status.status.success(), "{status:?}");
    let before = elsewhere.listing();
    // the folder is a junction
    assert_eq!(
        choose(
            &mut state,
            &target,
            through.file("vinculo").join("plan.csv").to_str().unwrap()
        ),
        Err(HostError::StrategyFileUnavailable)
    );
    // the target itself is a junction named like a CSV
    let named = Root::new();
    let status = std::process::Command::new("cmd")
        .args(["/C", "mklink", "/J"])
        .arg(named.file("plan.csv"))
        .arg(&elsewhere.0)
        .output()
        .unwrap();
    assert!(status.status.success(), "{status:?}");
    assert_eq!(
        choose(&mut state, &target, &named.text("plan.csv")),
        Err(HostError::StrategyFileUnavailable)
    );
    assert_eq!(elsewhere.listing(), before);
    // remove the junctions before the folders go
    let _ = fs::remove_dir(through.file("vinculo"));
    let _ = fs::remove_dir(named.file("plan.csv"));
}

#[cfg(unix)]
#[test]
fn a_symbolic_link_as_target_or_folder_is_refused_and_nothing_is_created() {
    let root = Root::new();
    let elsewhere = Root::new();
    let (mut state, proposal) = planned(&root);
    let target = proposal_of(&proposal);
    fs::write(elsewhere.file("real.csv"), b"mio").unwrap();
    std::os::unix::fs::symlink(elsewhere.file("real.csv"), root.file("enlace.csv")).unwrap();
    std::os::unix::fs::symlink(&elsewhere.0, root.file("carpeta")).unwrap();
    let before = elsewhere.listing();
    for path in [root.text("enlace.csv"), root.file("carpeta").join("plan.csv").to_str().unwrap().to_owned()] {
        assert_eq!(
            choose(&mut state, &target, &path),
            Err(HostError::StrategyFileUnavailable),
            "{path}"
        );
    }
    assert_eq!(elsewhere.listing(), before);
}

#[test]
fn the_temporary_file_goes_whichever_step_fails() {
    let root = Root::new();
    let path = root.file("plan.csv");
    fs::write(&path, b"viejo").unwrap();
    let before = root.listing();
    let failure = || std::io::Error::from(std::io::ErrorKind::Other);
    // writing fails after part of the bytes are down
    assert_eq!(
        write_through_for_tests(
            &path,
            b"nuevo",
            |file, bytes| {
                std::io::Write::write_all(file, &bytes[..2])?;
                Err(failure())
            },
            |_, _| unreachable!("never published"),
        ),
        Err(HostError::StrategyFileUnavailable)
    );
    assert_eq!(root.listing(), before);
    // publishing fails: the rename is refused
    assert_eq!(
        write_through_for_tests(
            &path,
            b"nuevo",
            std::io::Write::write_all,
            |_, _| Err(failure()),
        ),
        Err(HostError::StrategyFileUnavailable)
    );
    assert_eq!(root.listing(), before);
    // a failure that means «another program has it» is its own error
    assert_eq!(
        write_through_for_tests(
            &path,
            b"nuevo",
            std::io::Write::write_all,
            |_, _| Err(std::io::Error::from_raw_os_error(32)),
        ),
        Err(HostError::StrategyFileInUse)
    );
    assert_eq!(root.listing(), before);
    // for a file that did not exist, «access denied» is not «in use»
    let new = root.file("nuevo.csv");
    assert_eq!(
        write_through_for_tests(
            &new,
            b"x",
            std::io::Write::write_all,
            |_, _| Err(std::io::Error::from_raw_os_error(5)),
        ),
        Err(HostError::StrategyFileUnavailable)
    );
    assert_eq!(root.listing(), before);
    // and the same write without failures replaces the file whole
    write_through_for_tests(
        &path,
        b"nuevo",
        std::io::Write::write_all,
        |from, to| fs::rename(from, to),
    )
    .unwrap();
    assert_eq!(fs::read(&path).unwrap(), b"nuevo");
    assert_eq!(root.listing().len(), 1);
}

#[test]
fn the_footer_is_one_line_in_each_format_so_it_can_be_dropped() {
    let (entries, result) = (fuji_entries(), fuji_result());
    let (text, bytes) = written(&proposal(&entries, &result));
    assert_eq!(text.matches("Hecho con Vantare").count(), 1);
    assert!(text.ends_with("Hecho con Vantare"));
    assert_eq!(
        std::str::from_utf8(&bytes).unwrap().matches("Hecho con Vantare").count(),
        1
    );
}

// ------------------------------------- the review of the security of E5c

const STARTS: [&str; 5] = ["=", "+", "-", "@", "\t"];

#[test]
fn a_list_separator_inside_a_text_never_lets_a_formula_start_a_cell() {
    let result = fuji_result();
    for separator in [",", ";", "\t", ", ", " ,"] {
        for start in STARTS {
            let hostile = format!("a{separator}{start}cmd|' /C calc'!A0");
            let mut entries = fuji_entries();
            entries.fields.name = hostile.clone();
            entries.fields.variant_name = hostile.clone();
            entries.fields.track = hostile.clone();
            entries.fields.class = hostile.clone();
            let mut result = result.clone();
            result.timeline.as_mut().unwrap().pilot = hostile.clone();
            let (text, bytes) = written(&proposal(&entries, &result));
            // read as the file means it: the quotes are respected
            let rows = parsed(&bytes);
            let race = rows.iter().find(|row| row[0] == "Carrera").unwrap();
            assert_eq!(race.len(), 2, "{hostile:?}");
            // read by a reader with another list separator, or one that ignores
            // the quotes: every cell of every text row still starts as text
            let raw = std::str::from_utf8(&bytes).unwrap().strip_prefix('\u{feff}').unwrap();
            for line in raw.split("\r\n") {
                let texts = line.starts_with("Carrera;")
                    || line.starts_with("Estrategia;")
                    || line.starts_with("Circuito;")
                    || line.starts_with("Clase;")
                    || line.starts_with("Stint;");
                if !texts {
                    continue;
                }
                for cell in line.split([';', ',', '\t']) {
                    let cell = cell.trim_start_matches([' ', '"', '\u{a0}']);
                    assert!(
                        !cell.starts_with(['=', '+', '-', '@']),
                        "{hostile:?}: {cell:?} in {line:?}"
                    );
                }
            }
            // the cell with a comma is quoted, and the text line starts with a word of ours
            if separator.contains(',') {
                assert!(raw.contains("Carrera;\""), "{hostile:?}");
            }
            for line in text.lines() {
                assert!(!line.starts_with(['=', '+', '-', '@', '\t']), "{line:?}");
            }
        }
    }
    // the reviewer's own counter-example
    let mut entries = fuji_entries();
    entries.fields.name = "a,=cmd|' /C calc'!A0".into();
    let (_, bytes) = written(&proposal(&entries, &result));
    let raw = std::str::from_utf8(&bytes).unwrap();
    assert!(raw.contains("Carrera;\"a,'=cmd|' /C calc'!A0\"\r\n"), "{raw}");
}

#[test]
fn what_makes_a_line_read_in_another_order_is_turned_into_a_space() {
    let mut entries = fuji_entries();
    let hostile = "Fuji\u{2028}=cmd\u{2029}x\u{202e}RLO\u{2066}\u{200f}\u{061c}fin";
    entries.fields.name = hostile.into();
    entries.fields.variant_name = hostile.into();
    entries.fields.track = hostile.into();
    entries.fields.class = hostile.into();
    let mut result = fuji_result();
    result.timeline.as_mut().unwrap().pilot = hostile.into();
    let (text, bytes) = written(&proposal(&entries, &result));
    let clean = "Fuji =cmd x RLO   fin";
    for forbidden in [
        '\u{2028}', '\u{2029}', '\u{202a}', '\u{202b}', '\u{202c}', '\u{202d}', '\u{202e}',
        '\u{2066}', '\u{2067}', '\u{2068}', '\u{2069}', '\u{200e}', '\u{200f}', '\u{061c}',
    ] {
        assert!(!text.contains(forbidden), "{forbidden:?}");
        assert!(!std::str::from_utf8(&bytes).unwrap().contains(forbidden), "{forbidden:?}");
    }
    assert!(text.contains(&format!("Carrera: {clean} · Estrategia: {clean}\n")));
    // the text keeps its lines: nothing of the person ended one
    assert_eq!(text.lines().count(), text.split('\n').count());
    assert!(!text.lines().any(|line| line.starts_with("=cmd")));
    let rows = parsed(&bytes);
    assert_eq!(rows.iter().find(|row| row[0] == "Carrera").unwrap()[1], clean);
}

#[test]
fn the_console_devices_are_never_a_file_name() {
    for name in ["CONIN$", "conout$", "CONIN$.txt", "CONOUT$ .csv"] {
        let suggested = suggested_name(name, "");
        assert!(suggested.starts_with("Plan "), "{name}: {suggested}");
        assert!(crate::strategy::valid_file_name(&suggested));
    }
    for device in ["CONIN$", "CONOUT$.csv", "conin$"] {
        assert!(crate::strategy::file::device_name(std::ffi::OsStr::new(device)));
    }
    let root = Root::new();
    let (mut state, proposal) = planned(&root);
    let before = root.listing();
    for name in ["CONIN$.csv", "conout$.csv"] {
        assert_eq!(
            choose(&mut state, &proposal_of(&proposal), &root.text(name)),
            Err(HostError::StrategyFileUnavailable),
            "{name}"
        );
    }
    assert_eq!(root.listing(), before);
}

#[test]
fn a_permission_that_forbids_replacing_is_unavailable_and_only_a_program_holding_it_is_in_use() {
    let root = Root::new();
    let path = root.file("plan.csv");
    fs::write(&path, b"mio").unwrap();
    let before = root.listing();
    // «access denied» on a file that can be opened for writing is a permission
    assert_eq!(
        write_through_for_tests(
            &path,
            b"nuevo",
            std::io::Write::write_all,
            |_, _| Err(std::io::Error::from_raw_os_error(5)),
        ),
        Err(HostError::StrategyFileUnavailable)
    );
    assert_eq!(root.listing(), before);
    // a lock violation is a program holding it, with no probe needed
    assert_eq!(
        write_through_for_tests(
            &path,
            b"nuevo",
            std::io::Write::write_all,
            |_, _| Err(std::io::Error::from_raw_os_error(33)),
        ),
        Err(HostError::StrategyFileInUse)
    );
    assert_eq!(root.listing(), before);
}

#[test]
fn a_panic_in_the_middle_of_a_write_leaves_no_temporary_file() {
    let root = Root::new();
    let path = root.file("plan.csv");
    fs::write(&path, b"viejo").unwrap();
    let before = root.listing();
    let panicked = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _ = write_through_for_tests(
            &path,
            b"nuevo",
            |file, bytes| {
                std::io::Write::write_all(file, &bytes[..2]).unwrap();
                panic!("a crash halfway");
            },
            |_, _| Ok(()),
        );
    }));
    assert!(panicked.is_err());
    assert_eq!(root.listing(), before);
}

#[test]
fn a_name_of_the_longest_size_still_has_a_temporary_file_that_fits() {
    let root = Root::new();
    let name = format!("{}.csv", "a".repeat(200));
    let path = root.file(&name);
    write_for_tests(&path, b"uno").unwrap();
    write_for_tests(&path, b"dos").unwrap();
    assert_eq!(fs::read(&path).unwrap(), b"dos");
    assert_eq!(root.listing().len(), 1);
}

#[test]
fn the_accepted_plan_that_was_asked_for_is_the_one_written() {
    let root = Root::new();
    let (mut state, _) = planned(&root);
    accept(&mut state);
    let before = root.listing();
    let target = StrategyExportTarget::Accepted {};
    let now = Instant::now();
    ask(&mut state, &target, now).unwrap();
    // the plan is removed and accepted again during the dialog, a moment later
    let view = state.view();
    let removed = state.unaccept(&view.revision).unwrap();
    state
        .accept(
            &removed.revision,
            view.plan.compute_id.unwrap(),
            "2026-11-19T19:05:00Z",
        )
        .unwrap();
    let error = answer(&mut state, Some(&root.text("a.csv")), now).unwrap_err();
    assert!(matches!(error, HostError::StrategyConflict { .. }), "{error:?}");
    assert_eq!(root.listing(), before);
    // and it is written when nothing moved
    ask(&mut state, &target, now).unwrap();
    answer(&mut state, Some(&root.text("a.csv")), now).unwrap();
    assert!(root.file("a.csv").is_file());
}

#[cfg(windows)]
#[test]
fn a_file_an_editor_holds_open_for_reading_and_writing_is_in_use_not_unavailable() {
    use std::os::windows::fs::OpenOptionsExt;
    let root = Root::new();
    let path = root.file("plan.csv");
    fs::write(&path, b"abierto en un editor").unwrap();
    // what Notepad or an editor does: it shares reading and writing, never deleting
    let held = fs::OpenOptions::new()
        .read(true)
        .write(true)
        .share_mode(3)
        .open(&path)
        .unwrap();
    let before = root.listing();
    assert_eq!(
        write_for_tests(&path, b"nuevo"),
        Err(HostError::StrategyFileInUse)
    );
    assert_eq!(root.listing(), before);
    drop(held);
    // a read-only file nobody holds is a permission, not a program
    let mut permissions = fs::metadata(&path).unwrap().permissions();
    permissions.set_readonly(true);
    fs::set_permissions(&path, permissions.clone()).unwrap();
    assert_eq!(
        write_for_tests(&path, b"nuevo"),
        Err(HostError::StrategyFileUnavailable)
    );
    #[allow(clippy::permissions_set_readonly_false)]
    permissions.set_readonly(false);
    fs::set_permissions(&path, permissions).unwrap();
    // and a plain one is replaced
    write_for_tests(&path, b"nuevo").unwrap();
    assert_eq!(fs::read(&path).unwrap(), b"nuevo");
}

// ------------------------------------------------- amounts really fixed by hand (E5f)

/// Recalculates the edit of the session and waits for it.
fn recalculated(state: &mut State) -> StrategyView {
    let view = state.view();
    state
        .recalculate(&view.revision, view.plan.compute_id.unwrap())
        .unwrap();
    state.test_join_calculation();
    state.view()
}

// The marks of the export come from what the session fixed, not from a plan made
// by hand: fix an amount, recalculate, and the stop says so in the text, in the
// CSV and, once accepted and saved, in the accepted plan too.
#[test]
fn an_amount_fixed_in_the_session_is_marked_in_the_text_the_csv_and_the_accepted_plan() {
    let root = Root::new();
    let (mut state, _) = planned(&root);
    // 20 laps in stints of five: the tank holds six, so a stop has room for more
    compute(
        &mut state,
        &event_form(|form| form.inputs.race_laps = "20".into()),
    );
    for (index, lap) in [(0, 5), (1, 10), (2, 15)] {
        let view = state.view();
        state
            .move_boundary(&view.revision, view.plan.compute_id.unwrap(), index, lap)
            .unwrap();
    }
    let automatic = recalculated(&mut state);
    let before = export(&state, &proposal_of(&automatic)).unwrap();
    assert_eq!(before.matches("(fijado a mano)").count(), 0);

    // one litre more than the plan loads in the first stop
    let loads = automatic.plan.edit.as_ref().unwrap().stops[0]
        .fuel_liters
        .as_f64()
        .unwrap();
    let amount = n(loads + 1.0);
    let pending = state
        .set_stop_service(
            &automatic.revision,
            automatic.plan.compute_id.unwrap(),
            0,
            Some(&amount),
            None,
            None,
        )
        .unwrap();
    // what is fixed is not a plan to export until it is recalculated
    assert_eq!(
        export(&state, &proposal_of(&pending)),
        Err(HostError::StrategyEditPending)
    );
    let done = recalculated(&mut state);
    assert_eq!(done.plan.state, StrategyPlanState::Calculated);
    let target = proposal_of(&done);
    let text = export(&state, &target).unwrap();
    let stops: Vec<_> = text
        .lines()
        .filter(|line| line.starts_with("Parada "))
        .collect();
    assert_eq!(stops.len(), 3);
    assert!(
        stops[0].contains(&format!("+{} L (fijado a mano)", loads + 1.0)),
        "{}",
        stops[0]
    );
    assert_eq!(text.matches("(fijado a mano)").count(), 1, "{text}");
    let origins = |bytes: &[u8]| -> Vec<String> {
        parsed(bytes)
            .iter()
            .filter(|row| row[0] == "Parada")
            .map(|row| row[11].clone())
            .collect()
    };
    let expected = ["Fijado a mano: combustible", "Automático", "Automático"];
    choose(&mut state, &target, &root.text("propuesta.csv")).unwrap();
    assert_eq!(
        origins(&fs::read(root.file("propuesta.csv")).unwrap()),
        expected
    );
    // accepted and saved, the plan of the file says the same
    let accepted = accept(&mut state);
    state.save(&accepted.revision).unwrap();
    let kept = export(&state, &StrategyExportTarget::Accepted {}).unwrap();
    assert_eq!(kept.matches("(fijado a mano)").count(), 1, "{kept}");
    choose(
        &mut state,
        &StrategyExportTarget::Accepted {},
        &root.text("aceptado.csv"),
    )
    .unwrap();
    assert_eq!(
        origins(&fs::read(root.file("aceptado.csv")).unwrap()),
        expected
    );
    // back to automatic and recalculated: no mark is left in the proposal
    let view = state.view();
    state
        .clear_stop_services(&view.revision, view.plan.compute_id.unwrap())
        .unwrap();
    let cleared = recalculated(&mut state);
    let text = export(&state, &proposal_of(&cleared)).unwrap();
    assert_eq!(text.matches("(fijado a mano)").count(), 0, "{text}");
}
