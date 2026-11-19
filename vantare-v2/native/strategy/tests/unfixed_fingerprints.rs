//! Huellas del cálculo SIN nada fijado por parada (#2690, E5e).
//!
//! Cada caso guarda el SHA-256 del resultado completo (JSON con las claves
//! ordenadas y la duración a cero) y un resumen legible. Las huellas se
//! generaron con el código anterior a E5e: si un cambio altera cualquier
//! resultado de este corpus, el test falla y dice qué caso cambió.
//!
//! Solo entran casos que no dependen del reloj: el plazo es de 10 s o más y
//! termina antes el cálculo o su límite de candidatos. Las carreras por tiempo
//! quedan fuera (su semilla interna tiene un plazo propio de 200 ms); las
//! cubren los tests de paridad con Go, que no usan plazo.
//!
//! Para regenerar las huellas (solo si el cambio de resultado es intencionado y
//! está revisado): `VANTARE_STRATEGY_HUELLAS=escribir cargo test -p vantare-strategy
//! --test unfixed_fingerprints`. Desde E5e solo se han regenerado las 76 que
//! #2691 cambia a propósito (ver más abajo).
//!
//! Además de la huella del caso entero se guarda cada caso troceado por partes
//! (#2691, más abajo), en `testdata/unfixed/partes/`. Esas partes son las de
//! ANTES de acumular el desgaste de neumáticos y no se regeneran: lo que #2691
//! cambia a propósito está listado, parte a parte, en
//! `testdata/unfixed/desviaciones-2691/`, y cualquier otra diferencia falla.
use std::sync::atomic::AtomicBool;

use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use vantare_strategy::application::{
    EditedPlan, SourceStatus, calculate_detailed, prepare_manual, recalculate_edited_plan_detailed,
    recalculate_edited_plan_fixed,
};
use vantare_strategy::solver::{
    DecisionVector, FixedStop, Input, PitDecision, ResultV2, Scalar, SolverOutcome, StintDecision,
    WeatherScenarioSet, Window, manual_service_grid, replay_decision_v2,
    replay_decision_v2_with_resources, resource_requirements_v2, solve_greedy_fallback,
    solve_greedy_fallback_fixed, solve_v2_cancellable, solve_v2_fixed, solve_weather_scenarios,
};

#[derive(Default)]
struct Case {
    id: String,
    summary: String,
    output: Value,
    /// La entrada trae inventario físico de neumáticos: la búsqueda prueba a
    /// seguir con el mismo juego y a montar otro, también uno usado.
    inventory: bool,
    /// Solo en los casos generados con el replay que quita el cambio de ruedas
    /// de la última parada y llega a evaluar el último tramo: el desgaste que
    /// ese tramo paga de más por empezar con ruedas usadas
    /// (pérdida × vueltas del tramo anterior × vueltas del último).
    extra_wear: Option<f64>,
}

/// JSON con las claves ordenadas: no depende de cómo guarde los mapas `serde_json`.
/// `durationMillis` es tiempo real y se escribe siempre como 0.
fn canonical(value: &Value, out: &mut String) {
    match value {
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            out.push('{');
            for (index, key) in keys.into_iter().enumerate() {
                if index > 0 {
                    out.push(',');
                }
                out.push_str(&Value::String(key.clone()).to_string());
                out.push(':');
                if key == "durationMillis" {
                    out.push('0');
                } else {
                    canonical(&map[key], out);
                }
            }
            out.push('}');
        }
        Value::Array(items) => {
            out.push('[');
            for (index, item) in items.iter().enumerate() {
                if index > 0 {
                    out.push(',');
                }
                canonical(item, out);
            }
            out.push(']');
        }
        other => out.push_str(&other.to_string()),
    }
}

fn fingerprint(value: &Value) -> String {
    let mut text = String::new();
    canonical(value, &mut text);
    format!("{:x}", Sha256::digest(text.as_bytes()))
}

fn unfixed(name: &str) -> std::path::PathBuf {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("testdata/unfixed")
        .join(name)
}

fn read_lines(name: &str) -> Vec<Value> {
    serde_json::from_slice(&std::fs::read(unfixed(name)).expect("huellas guardadas"))
        .expect("JSON de huellas")
}

fn write_lines(name: &str, lines: &[Value]) {
    let path = unfixed(name);
    let lines: Vec<String> = lines.iter().map(Value::to_string).collect();
    std::fs::create_dir_all(path.parent().expect("carpeta")).expect("crear carpeta");
    std::fs::write(&path, format!("[\n{}\n]\n", lines.join(",\n"))).expect("escribir huellas");
}

/// Lo que #2691 cambia a propósito en una sección: una línea por caso y parte.
/// Sin fichero, nada.
fn read_deviations(section: &str) -> Vec<Value> {
    let name = format!("desviaciones-2691/{section}.json");
    if unfixed(&name).exists() {
        read_lines(&name)
    } else {
        Vec::new()
    }
}

fn check(section: &str, cases: &[Case]) {
    let whole: Vec<Value> = cases
        .iter()
        .map(|case| json!({"id": case.id, "sha256": fingerprint(&case.output), "summary": case.summary}))
        .collect();
    let parts: Vec<Value> = cases.iter().map(part_fingerprints).collect();
    // Cada modo escribe solo lo suyo: «escribir», las huellas enteras; «partes»,
    // las troceadas de antes de #2691 (no se regeneran); «desviaciones», la
    // lista de lo que #2691 cambia.
    let mode = std::env::var("VANTARE_STRATEGY_HUELLAS").unwrap_or_default();
    match mode.as_str() {
        "escribir" => return write_lines(&format!("{section}.json"), &whole),
        "partes" => return write_lines(&format!("partes/{section}.json"), &parts),
        _ => {}
    }
    let stored = read_lines(&format!("{section}.json"));
    let before = read_lines(&format!("partes/{section}.json"));
    assert_eq!(before.len(), cases.len(), "{section}: casos por partes");
    assert_eq!(stored.len(), cases.len(), "{section}: casos guardados");

    let deviations = if mode == "desviaciones" {
        let found = find_deviations(cases, &parts, &before, &stored);
        let name = format!("desviaciones-2691/{section}.json");
        if found.is_empty() {
            let _ = std::fs::remove_file(unfixed(&name));
        } else {
            write_lines(&name, &found);
        }
        found
    } else {
        read_deviations(section)
    };

    let mut problems = Vec::new();
    for (index, case) in cases.iter().enumerate() {
        let listed: Vec<&Value> = deviations
            .iter()
            .filter(|deviation| deviation["id"] == case.id.as_str())
            .collect();
        problems.extend(part_problems(case, &parts[index], &before[index], &listed));
        // La huella entera es la de ahora. Las de los casos listados se
        // regeneraron con #2691; las demás son las originales.
        if stored[index] != whole[index] {
            problems.push(format!(
                "{}: huella entera: {}",
                case.id,
                difference(&stored[index], &whole[index])
            ));
        }
    }
    for deviation in &deviations {
        if !cases.iter().any(|case| deviation["id"] == case.id.as_str()) {
            problems.push(format!("{}: listado y no existe", deviation["id"]));
        }
    }
    assert!(
        problems.is_empty(),
        "{section}: {} diferencias con las huellas guardadas:\n{}",
        problems.len(),
        problems
            .iter()
            .take(20)
            .cloned()
            .collect::<Vec<_>>()
            .join("\n")
    );
}

/// Las partes del resultado de una búsqueda. Con inventario físico de
/// neumáticos la búsqueda prueba ruedas sin cambiar aunque su plan final no las
/// lleve, así que pueden moverse sus contadores y su lista de candidatos.
const SEARCH_PARTS: [&str; 4] = ["solve", "plans", "robust", "thresholdSensitivity"];

/// Lo que #2691 puede mover en una parte: solo si su plan lleva ruedas que no
/// son nuevas, o si es una búsqueda con inventario físico.
fn may_change(case: &Case, before: &Value, part: &str) -> bool {
    before["ruedasUsadas"].get(part).is_some() || (case.inventory && SEARCH_PARTS.contains(&part))
}

fn part_names(now: &Value, before: &Value) -> std::collections::BTreeSet<String> {
    [now, before]
        .into_iter()
        .filter_map(|line| line["partes"].as_object())
        .flat_map(|parts| parts.keys().cloned())
        .collect()
}

/// Compara las partes de un caso con las de antes de #2691. Solo pueden
/// diferir las listadas, y solo si podían cambiar (`may_change`).
fn part_problems(case: &Case, now: &Value, before: &Value, listed: &[&Value]) -> Vec<String> {
    let mut problems = Vec::new();
    for part in part_names(now, before) {
        let entry = listed
            .iter()
            .find(|deviation| deviation["parte"] == part.as_str());
        let (old, new) = (&before["partes"][&part], &now["partes"][&part]);
        if old == new {
            if entry.is_some() {
                problems.push(format!("{}: «{part}» está listada y no cambia", case.id));
            }
            continue;
        }
        let Some(entry) = entry else {
            problems.push(format!(
                "{}: «{part}» cambia y no está en la lista de desviaciones",
                case.id
            ));
            continue;
        };
        if !may_change(case, before, &part) {
            problems.push(format!(
                "{}: «{part}» cambia y todas sus paradas montan ruedas nuevas",
                case.id
            ));
        }
        if entry["antes"]["huella"] != *old || entry["ahora"]["huella"] != *new {
            problems.push(format!(
                "{}: «{part}» no cambia a lo listado (ahora {new})",
                case.id
            ));
        }
    }
    // La fórmula cerrada del replay sin cambio de ruedas en la última parada.
    if let Some(extra) = case.extra_wear {
        let part = "noEnergyNorTyresAtLastStop";
        let seconds = |cifras: &Value| {
            cifras["desgaste"]
                .as_str()
                .and_then(|text| text.parse::<f64>().ok())
        };
        let old = seconds(&before["ruedasUsadas"][part]["cifras"]);
        let new = seconds(&figures(&case.output[part]));
        let changes = before["partes"][part] != now["partes"][part];
        match (old, new) {
            // Seis decimales guardados: dos redondeos de medio millonésimo.
            (Some(old), Some(new)) if (new - old - extra).abs() <= 1.5e-6 => {
                if changes != (extra > 1e-9) {
                    problems.push(format!(
                        "{}: con {extra} s de desgaste de más, «{part}» {}",
                        case.id,
                        if changes { "cambia" } else { "no cambia" }
                    ));
                }
            }
            _ => problems.push(format!(
                "{}: «{part}» pasa de {old:?} a {new:?} s de desgaste y debía subir {extra} s",
                case.id
            )),
        }
    }
    problems
}

/// La lista de lo que cambia frente a las partes de antes de #2691, para
/// revisarla: una línea por caso y parte, con el antes y el ahora.
fn find_deviations(
    cases: &[Case],
    parts: &[Value],
    before: &[Value],
    stored: &[Value],
) -> Vec<Value> {
    let mut found = Vec::new();
    for (index, case) in cases.iter().enumerate() {
        for part in part_names(&parts[index], &before[index]) {
            let (old, new) = (
                &before[index]["partes"][&part],
                &parts[index]["partes"][&part],
            );
            if old == new {
                continue;
            }
            let worn = &before[index]["ruedasUsadas"][&part];
            found.push(json!({
                "id": case.id,
                "parte": part,
                "motivo": if worn.is_object() {
                    "algún plan de esta parte no cambia ruedas en alguna parada"
                } else {
                    "búsqueda con inventario de neumáticos: prueba planes sin cambio de ruedas"
                },
                "antes": {"huella": old, "cifras": worn["cifras"], "resumen": stored[index]["summary"]},
                "ahora": {
                    "huella": new,
                    "cifras": figures(&case.output[&part]),
                    "resumen": case.summary,
                },
            }));
        }
    }
    found
}

/// Qué cambia entre la huella guardada y la de ahora, para el mensaje del test.
fn difference(expected: &Value, actual: &Value) -> String {
    let Some(parts) = actual["partes"].as_object() else {
        return format!(
            "antes «{}», ahora «{}»",
            expected["summary"].as_str().unwrap_or_default(),
            actual["summary"].as_str().unwrap_or_default()
        );
    };
    let stored = expected["partes"].as_object();
    let mut names: Vec<&str> = parts
        .iter()
        .filter(|(name, part)| stored.and_then(|stored| stored.get(name.as_str())) != Some(*part))
        .map(|(name, _)| name.as_str())
        .collect();
    names.extend(
        stored
            .into_iter()
            .flat_map(|stored| stored.keys())
            .filter(|name| !parts.contains_key(name.as_str()))
            .map(String::as_str),
    );
    if names.is_empty() {
        return format!(
            "cambian las marcas de ruedas usadas: antes {}, ahora {}",
            expected["ruedasUsadas"], actual["ruedasUsadas"]
        );
    }
    format!("cambian las partes {names:?}")
}

// ---------------------------------------------------------------------------
// Huellas por partes (#2691).
// ---------------------------------------------------------------------------
//
// Cada caso se guarda además troceado por las claves de primer nivel de su
// resultado («solve», «replay», «noEnergyNorTyresAtLastStop»...). De cada parte
// se guarda una huella corta (los 16 primeros caracteres del SHA-256) y, si el
// plan que evalúa lleva ruedas que no son nuevas, dos marcas:
//
// - `sinCambio`: alguna parada no cambia ruedas;
// - `reutiliza`: alguna parada monta un juego que ya había rodado antes.
//
// Con las marcas van el tiempo y el desgaste del plan, legibles (en texto con
// seis decimales: un número con todos sus decimales no siempre se lee del
// fichero igual que se escribió). Sirven para ver, parte a parte, qué mueve un
// cambio del modelo de desgaste y comprobar que las partes en que todas las
// paradas montan ruedas nuevas no se mueven.
//
// Cada línea repite el SHA-256 del caso entero: es el mismo de la huella
// original, así que las partes guardadas son las de ese resultado y no otras.
// Se escriben con `VANTARE_STRATEGY_HUELLAS=partes`, que no toca las huellas
// enteras.

fn part_fingerprints(case: &Case) -> Value {
    let whole = serde_json::Map::from_iter([("todo".to_owned(), case.output.clone())]);
    let parts = case.output.as_object().unwrap_or(&whole);
    let mut hashes = serde_json::Map::new();
    let mut worn = serde_json::Map::new();
    for (name, part) in parts {
        hashes.insert(name.clone(), json!(fingerprint(part)[..16]));
        let (mut keeps, mut reuses) = (false, false);
        worn_tyres(part, &mut keeps, &mut reuses);
        if keeps || reuses {
            worn.insert(
                name.clone(),
                json!({"sinCambio": keeps, "reutiliza": reuses, "cifras": figures(part)}),
            );
        }
    }
    let mut line = json!({"id": case.id, "sha256": fingerprint(&case.output), "partes": hashes});
    if !worn.is_empty() {
        line["ruedasUsadas"] = Value::Object(worn);
    }
    line
}

/// Busca en un resultado planes con ruedas que no son nuevas: paradas con
/// `changeTyres` a `false`, o tramos que montan un juego ya usado antes.
fn worn_tyres(value: &Value, keeps: &mut bool, reuses: &mut bool) {
    match value {
        Value::Object(map) => {
            if let Some(stops) = map.get("pitStops").and_then(Value::as_array) {
                *keeps |= stops.iter().any(|stop| stop["changeTyres"] == false);
                if let Some(stints) = map.get("stints").and_then(Value::as_array) {
                    *reuses |= remounts(stints, stops);
                }
            }
            for inner in map.values() {
                worn_tyres(inner, keeps, reuses);
            }
        }
        Value::Array(items) => {
            for inner in items {
                worn_tyres(inner, keeps, reuses);
            }
        }
        _ => {}
    }
}

/// Si algún tramo monta, tras una parada con cambio, ruedas que ya rodaron.
fn remounts(stints: &[Value], stops: &[Value]) -> bool {
    let ids = |stint: &Value| -> Vec<String> {
        stint["tyreFitment"]
            .as_object()
            .into_iter()
            .flat_map(|fitment| fitment.values())
            .filter_map(|id| id.as_str().map(str::to_owned))
            .collect()
    };
    let mut used = std::collections::BTreeSet::new();
    for (index, stint) in stints.iter().enumerate() {
        let mounted = ids(stint);
        let changed = index > 0
            && stops
                .get(index - 1)
                .is_some_and(|stop| stop["changeTyres"] == true);
        if changed && mounted.iter().any(|id| used.contains(id)) {
            return true;
        }
        used.extend(mounted);
    }
    false
}

/// Tiempo total y desgaste del plan de una parte, donde los tenga.
fn figures(part: &Value) -> Value {
    let first = |candidates: [&Value; 3], wanted: fn(&Value) -> bool| {
        candidates
            .into_iter()
            .find(|value| wanted(value))
            .cloned()
            .unwrap_or(Value::Null)
    };
    let evaluation = first(
        [
            &part["evaluation"],
            &part["result"]["expected"],
            &part["outcome"]["result"]["expected"],
        ],
        Value::is_object,
    );
    let feasible = first(
        [
            &part["feasible"],
            &part["result"]["feasible"],
            &part["outcome"]["result"]["feasible"],
        ],
        Value::is_boolean,
    );
    let seconds = |value: &Value| value.as_f64().map(|seconds| format!("{seconds:.6}"));
    json!({
        "plan": feasible,
        "total": seconds(&evaluation["totalSeconds"]),
        "desgaste": seconds(&evaluation["degradationSeconds"]),
    })
}

/// Las huellas por partes se sacaron de los mismos resultados que las huellas
/// originales: cada línea lleva el SHA-256 del caso entero, que es el de la
/// huella original de ese caso. Las únicas huellas enteras que ya no coinciden
/// con él son las de los casos listados en las desviaciones de #2691.
#[test]
fn the_part_fingerprints_belong_to_the_original_fingerprints() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("testdata/unfixed");
    let read = |path: std::path::PathBuf| -> Vec<Value> {
        serde_json::from_slice(&std::fs::read(&path).expect("huellas guardadas"))
            .expect("JSON de huellas")
    };
    let (mut cases, mut regenerated) = (0, 0);
    for section in [
        "oracle-scalar",
        "oracle-extended",
        "manual",
        "generated",
        "coarsened",
    ] {
        let whole = read(root.join(format!("{section}.json")));
        let parts = read(root.join(format!("partes/{section}.json")));
        let deviations = read_deviations(section);
        assert_eq!(whole.len(), parts.len(), "{section}: número de casos");
        for (whole, parts) in whole.iter().zip(&parts) {
            assert_eq!(whole["id"], parts["id"], "{section}: orden de los casos");
            // Un caso con partes listadas en las desviaciones de #2691 tiene
            // otra huella entera, regenerada; los demás, la original.
            let listed = deviations
                .iter()
                .any(|deviation| deviation["id"] == whole["id"]);
            assert_eq!(
                listed,
                whole["sha256"] != parts["sha256"],
                "{section}: {} cambia de huella entera exactamente si está listado",
                whole["id"]
            );
            regenerated += usize::from(listed);
            assert!(
                parts["partes"]
                    .as_object()
                    .is_some_and(|map| !map.is_empty()),
                "{section}: {} sin partes",
                whole["id"]
            );
            cases += 1;
        }
    }
    assert_eq!(cases, 696, "las huellas originales son 696");
    assert_eq!(regenerated, 76, "las regeneradas con #2691 son 76");
}

fn outcome_summary(outcome: &SolverOutcome) -> String {
    format!(
        "{:?} plan={} paradas={} segundos={:?} motivo={:?}",
        outcome.certificate.status,
        outcome.result.feasible,
        outcome.result.pit_stops.len(),
        outcome.cost_seconds,
        outcome.certificate.reason
    )
}

fn solved(result: Result<SolverOutcome, String>) -> (Value, String) {
    match result {
        Ok(outcome) => (json!(outcome), outcome_summary(&outcome)),
        Err(error) => (json!({ "error": error }), format!("error: {error}")),
    }
}

fn fallible<T: serde::Serialize>(result: Result<T, String>) -> Value {
    match result {
        Ok(value) => json!(value),
        Err(error) => json!({ "error": error }),
    }
}

/// El plan publicado como decisión reproducible por el `replay`.
fn decision_of(result: &ResultV2) -> DecisionVector {
    result.best.clone().unwrap_or_else(|| DecisionVector {
        stints: result
            .stints
            .iter()
            .enumerate()
            .map(|(index, &laps)| StintDecision {
                index,
                laps,
                ..StintDecision::default()
            })
            .collect(),
        pit_stops: result
            .pit_stops
            .iter()
            .map(|stop| PitDecision {
                lap: stop.lap,
                fuel_liters: stop.fuel_liters,
                ve_percent: stop.ve_percent,
                change_tyres: stop.change_tyres,
                ..PitDecision::default()
            })
            .collect(),
    })
}

fn edited_of(result: &ResultV2) -> EditedPlan {
    EditedPlan {
        stints: result.stints.clone(),
        pit_stop_laps: result.pit_stops.iter().map(|stop| stop.lap).collect(),
    }
}

fn recalculated(input: &Input, edited: &EditedPlan) -> Value {
    match recalculate_edited_plan_detailed(input, edited, &AtomicBool::new(false)) {
        Ok((outcome, fallback)) => {
            json!({"outcome": outcome, "fallback": format!("{fallback:?}")})
        }
        Err(error) => json!({ "error": error }),
    }
}

// ---------------------------------------------------------------------------
// 1. Entradas de los oráculos Go, por las funciones públicas.
// ---------------------------------------------------------------------------

#[test]
fn scalar_oracle_inputs_keep_their_results_without_fixed_stops() {
    let cases = oracle_cases(&[("solver", include_str!("../testdata/oracle/solver.json"))]);
    assert!(cases.len() > 100, "el corpus escalar se ha quedado corto");
    check("oracle-scalar", &cases);
}

#[test]
fn extended_oracle_inputs_keep_their_results_without_fixed_stops() {
    let mut cases = oracle_cases(&[
        (
            "resources",
            include_str!("../testdata/oracle/solver-resources.json"),
        ),
        (
            "tyres",
            include_str!("../testdata/oracle/solver-tyres.json"),
        ),
        (
            "drivers",
            include_str!("../testdata/oracle/solver-drivers.json"),
        ),
        (
            "weather",
            include_str!("../testdata/oracle/solver-weather.json"),
        ),
        (
            "projection",
            include_str!("../testdata/oracle/solver-projection.json"),
        ),
        (
            "extended",
            include_str!("../testdata/oracle/solver-extended.json"),
        ),
        (
            "optimality",
            include_str!("../testdata/oracle/solver-optimality.json"),
        ),
        (
            "boundaries",
            include_str!("../testdata/oracle/solver-boundaries.json"),
        ),
    ]);
    let scenarios: Vec<Value> =
        serde_json::from_str(include_str!("../testdata/oracle/solver-scenarios.json"))
            .expect("escenarios");
    for case in scenarios {
        let input: Input = serde_json::from_value(case["input"].clone()).expect("entrada");
        let set: WeatherScenarioSet = serde_json::from_value(case["set"].clone()).expect("set");
        let result = solve_weather_scenarios(&input, &set);
        cases.push(Case {
            id: format!("scenarios/{}", case["name"].as_str().expect("nombre")),
            summary: if result.is_ok() { "ok" } else { "error" }.into(),
            output: fallible(result),
            inventory: case["input"]["tyreInventory"].is_object(),
            extra_wear: None,
        });
    }
    assert!(cases.len() > 180, "el corpus extendido se ha quedado corto");
    check("oracle-extended", &cases);
}

/// Los casos de los oráculos Go: los que traen una decisión se reproducen con el
/// `replay`; los demás se calculan.
fn oracle_cases(files: &[(&str, &str)]) -> Vec<Case> {
    let mut work = Vec::new();
    for (file, data) in files {
        let oracle: Vec<Value> = serde_json::from_str(data).expect("oráculo");
        work.extend(oracle.into_iter().map(|case| (*file, case)));
    }
    // Los casos son independientes: se reparten entre hilos y se recogen en el
    // mismo orden, como hacen los tests de paridad con Go.
    let threads = std::thread::available_parallelism().map_or(1, |n| n.get().min(4));
    let per = work.len().div_ceil(threads).max(1);
    std::thread::scope(|scope| {
        let handles: Vec<_> = work
            .chunks(per)
            .map(|chunk| {
                scope.spawn(move || {
                    chunk
                        .iter()
                        .filter_map(|(file, case)| oracle_case(file, case))
                        .collect::<Vec<_>>()
                })
            })
            .collect();
        handles
            .into_iter()
            .flat_map(|handle| handle.join().expect("hilo de oráculos"))
            .collect()
    })
}

fn oracle_case(file: &str, case: &Value) -> Option<Case> {
    let name = case["name"].as_str().expect("nombre");
    let id = format!("{file}/{name}");
    let raw = &case["input"];
    let timed = raw.get("raceDurationSeconds").is_some_and(|v| !v.is_null());
    if timed || raw["budget"]["p95Millis"].as_u64().unwrap_or(0) < 10_000 {
        return None; // dependen del reloj: ver la cabecera
    }
    let Ok(input) = serde_json::from_value::<Input>(raw.clone()) else {
        return Some(Case {
            id,
            summary: "entrada ilegible".into(),
            output: json!({"error": "entrada ilegible"}),
            ..Case::default()
        });
    };
    if case["decision"].is_object() {
        let decision: DecisionVector =
            serde_json::from_value(case["decision"].clone()).expect("decisión");
        let replay = if case["initial"].is_array() {
            replay_decision_v2_with_resources(
                &input,
                &decision,
                case["initial"][0].as_f64().expect("combustible"),
                case["initial"][1].as_f64().expect("energía"),
            )
        } else {
            replay_decision_v2(&input, &decision)
        };
        let summary = match &replay {
            Ok(replay) => format!(
                "replay plan={} motivos={:?}",
                replay.feasible,
                replay.reasons.iter().map(|r| &r.code).collect::<Vec<_>>()
            ),
            Err(error) => format!("replay error: {error}"),
        };
        Some(Case {
            id,
            summary,
            output: json!({
                "replay": fallible(replay),
                "requirements": fallible(resource_requirements_v2(&input, &decision)),
            }),
            ..Case::default()
        })
    } else {
        let (output, summary) = solved(solve_v2_cancellable(&input, &AtomicBool::new(false)));
        Some(Case {
            id,
            summary,
            output: json!({
                "solve": output,
                "greedy": greedy(&input),
                "grid": fallible(manual_service_grid(&input)),
            }),
            inventory: raw["tyreInventory"].is_object(),
            extra_wear: None,
        })
    }
}

fn greedy(input: &Input) -> Value {
    match solve_greedy_fallback(input) {
        Ok(outcome) => json!(outcome),
        Err(refusal) => json!({ "refusal": refusal.code() }),
    }
}

// ---------------------------------------------------------------------------
// 2. El camino del Hub: Fuji manual, cálculo y «Recalcular».
// ---------------------------------------------------------------------------

fn fuji(laps: u32, energy: bool, candidates: usize) -> Input {
    let mut input: Input = serde_json::from_str(include_str!("../testdata/fuji-1450-input.json"))
        .expect("entrada congelada de Fuji");
    input.extra.clear();
    input.race_laps = laps;
    input.budget.p95_millis = 60_000; // manda el límite de candidatos, no el reloj
    input.budget.max_candidates = candidates;
    input.budget.max_iterations = 1_000_000;
    if !energy {
        input.ve_capacity_percent.value = 0.0;
        input.ve_per_lap_percent.value = 0.0;
    }
    input
}

/// El calendario de referencia de Fuji 6 h (236 vueltas), con una parada movida.
fn witness(index: Option<usize>, delta: i32) -> EditedPlan {
    let mut edited = EditedPlan {
        stints: vec![43, 42, 42, 43, 42, 24],
        pit_stop_laps: vec![43, 85, 127, 170, 212],
    };
    if let Some(index) = index {
        edited.pit_stop_laps[index] = edited.pit_stop_laps[index]
            .checked_add_signed(delta)
            .expect("vuelta");
        edited.stints[index] = edited.stints[index]
            .checked_add_signed(delta)
            .expect("vuelta");
        edited.stints[index + 1] = edited.stints[index + 1]
            .checked_add_signed(-delta)
            .expect("vuelta");
    }
    edited
}

#[test]
fn the_manual_route_keeps_its_results_without_fixed_stops() {
    let mut cases = Vec::new();
    for (laps, energy, candidates) in [
        (60, false, 250_000),
        (160, false, 250_000),
        (236, false, 250_000),
        (240, false, 250_000),
        (60, true, 250_000),
        (160, true, 60_000),
        (236, true, 250_000),
        (240, true, 60_000),
        (480, true, 20_000),
    ] {
        let prepared = prepare_manual(fuji(laps, energy, candidates)).expect("entrada válida");
        let (output, summary) =
            match calculate_detailed(&prepared, SourceStatus::Open, &AtomicBool::new(false)) {
                Ok(calculation) => (
                    json!({
                        "outcome": calculation.outcome,
                        "route": format!("{:?}", calculation.route),
                        "fallback": format!("{:?}", calculation.fallback),
                    }),
                    format!(
                        "{} ruta={:?} respaldo={:?}",
                        outcome_summary(&calculation.outcome),
                        calculation.route,
                        calculation.fallback
                    ),
                ),
                Err(error) => (json!({ "error": error }), format!("error: {error}")),
            };
        cases.push(Case {
            id: format!("calcular/fuji-{laps}-energia-{energy}-{candidates}"),
            summary,
            output,
            ..Case::default()
        });
    }
    for (index, delta) in [
        (None, 0),
        (Some(0), -1),
        (Some(1), 1),
        (Some(3), -1),
        (Some(4), -1),
    ] {
        for energy in [true, false] {
            let edited = witness(index, delta);
            let input = fuji(236, energy, 20_000);
            let output = recalculated(&input, &edited);
            cases.push(Case {
                id: format!("recalcular/fuji-236-energia-{energy}-{index:?}-{delta}"),
                summary: output["outcome"]["certificate"]["status"].to_string()
                    + " "
                    + output["fallback"].as_str().unwrap_or("error"),
                output,
                ..Case::default()
            });
        }
    }
    let impossible = EditedPlan {
        stints: vec![100, 136],
        pit_stop_laps: vec![100],
    };
    for (energy, candidates) in [(true, 1), (false, 250_000)] {
        let output = recalculated(&fuji(236, energy, candidates), &impossible);
        cases.push(Case {
            id: format!("recalcular/imposible-energia-{energy}"),
            summary: output["outcome"]["certificate"]["status"].to_string()
                + " "
                + output["fallback"].as_str().unwrap_or("error"),
            output,
            ..Case::default()
        });
    }
    check("manual", &cases);
}

// ---------------------------------------------------------------------------
// 3. Entradas generadas con semilla fija.
// ---------------------------------------------------------------------------

struct Rng(u64);
impl Rng {
    fn below(&mut self, bound: u64) -> u64 {
        self.0 = self
            .0
            .wrapping_mul(6_364_136_223_846_793_005)
            .wrapping_add(1_442_695_040_888_963_407);
        (self.0 >> 33) % bound
    }
    fn pick<T: Copy>(&mut self, options: &[T]) -> T {
        options[usize::try_from(self.below(options.len() as u64)).expect("índice")]
    }
}

fn reserve(rng: &mut Rng) -> Value {
    let evidence = json!({
        "provenance": {"kind": "manual", "sourceId": "test:e5e"},
        "confidence": {"level": "low", "basis": "corpus generado"},
    });
    let sourced = |value: f64| json!({"value": value, "evidence": evidence});
    match rng.below(5) {
        0 => Value::Null,
        1 => json!({"kind": "none", "selection": evidence}),
        2 => {
            json!({"kind": "laps", "laps": sourced(rng.pick(&[0.5, 0.8, 1.0, 2.0])), "selection": evidence})
        }
        3 => {
            json!({"kind": "amount", "amount": sourced(rng.pick(&[0.5, 1.0, 3.0])), "selection": evidence})
        }
        _ => {
            json!({"kind": "percent", "percent": sourced(rng.pick(&[1.0, 2.5, 5.0])), "selection": evidence})
        }
    }
}

/// `small`: carrera corta y rejilla gruesa, para que la búsqueda termine entera
/// y certifique. El resto son carreras en las que manda el límite de candidatos.
fn generated(rng: &mut Rng, small: bool) -> Input {
    let mut input = fuji(0, true, 0);
    let laps = u32::try_from(3 + rng.below(if small { 10 } else { 38 })).expect("vueltas");
    input.race_laps = laps;
    input.base_lap_seconds = Scalar::manual(rng.pick(&[60.0, 90.472_412_109_375, 121.5]));
    if small {
        input.fuel_capacity_liters = Scalar::manual(rng.pick(&[10.0, 17.5, 20.0, 30.0]));
        input.fuel_per_lap_liters =
            Scalar::manual(rng.pick(&[1.5, 1.830_120_132_082_984_5, 2.5, 3.3, 4.0]));
        input.discretization.fuel_liters = rng.pick(&[2.0, 2.5, 5.0]);
    } else {
        input.fuel_capacity_liters = Scalar::manual(rng.pick(&[6.0, 10.0, 17.5, 30.0, 40.0, 82.0]));
        input.fuel_per_lap_liters =
            Scalar::manual(rng.pick(&[1.0, 1.5, 1.830_120_132_082_984_5, 2.0, 2.5, 3.3]));
        input.discretization.fuel_liters = rng.pick(&[0.0, 0.5, 1.0, 2.0, 5.0]);
    }
    if rng.below(3) == 0 {
        input.ve_capacity_percent = Scalar::manual(0.0);
        input.ve_per_lap_percent = Scalar::manual(0.0);
    } else if small {
        input.ve_capacity_percent = Scalar::manual(100.0);
        input.ve_per_lap_percent = Scalar::manual(rng.pick(&[10.0, 12.5, 17.0, 33.0]));
        input.discretization.ve_percent = rng.pick(&[20.0, 25.0, 50.0]);
    } else {
        input.ve_capacity_percent = Scalar::manual(rng.pick(&[100.0, 100.0, 80.0]));
        input.ve_per_lap_percent =
            Scalar::manual(rng.pick(&[2.315_803_641_364_688, 5.0, 10.0, 12.5, 33.0]));
        input.discretization.ve_percent = rng.pick(&[0.0, 1.0, 2.0, 5.0, 10.0]);
    }
    input.tyre_life_laps = Scalar::manual(rng.pick(&[0.0, 0.0, 5.0, 8.0, 12.0, 43.0]));
    input.degradation_per_lap_seconds = Scalar::manual(rng.pick(&[0.0, 0.0, 0.05, 0.25]));
    input.pit_cost.transit_seconds = Scalar::manual(rng.pick(&[5.0, 20.0, 25.0]));
    input.pit_cost.tyre_seconds = Scalar::manual(rng.pick(&[0.0, 10.0, 30.0]));
    input.pit_cost.service_mode = rng.pick(&["parallel", "sequential"]).into();
    input.formation.seconds = Scalar::manual(rng.pick(&[0.0, 95.0]));
    input.fuel_reserve = reserve(rng);
    input.virtual_energy_reserve = reserve(rng);
    match rng.below(5) {
        0 => input.event_rules.min_pit_stops = Some(usize::try_from(rng.below(4)).expect("n")),
        1 => input.event_rules.max_pit_stops = Some(usize::try_from(rng.below(5)).expect("n")),
        2 => {
            let minimum = usize::try_from(rng.below(3)).expect("n");
            input.event_rules.min_pit_stops = Some(minimum);
            input.event_rules.max_pit_stops =
                Some(minimum + usize::try_from(rng.below(3)).expect("n"));
        }
        _ => {}
    }
    for _ in 0..rng.below(3) {
        if laps < 3 {
            break;
        }
        let from = u32::try_from(1 + rng.below(u64::from(laps - 1))).expect("vuelta");
        let to = (from + u32::try_from(rng.below(4)).expect("ancho")).min(laps - 1);
        input.event_rules.required_windows.push(Window {
            from_lap: from,
            to_lap: to,
        });
    }
    input.budget.max_candidates = if small {
        rng.pick(&[0, 1_000_000, 1_000_000, 2_000])
    } else {
        rng.pick(&[0, 300, 5_000, 60_000])
    };
    input
}

/// Todo lo que el crate dice de una entrada: búsqueda, respaldo, replay del plan
/// (bueno y estropeado a propósito) y recálculo de su calendario.
fn everything(input: &Input) -> (Value, String, Option<f64>) {
    let cancel = AtomicBool::new(false);
    let solve = solve_v2_cancellable(input, &cancel);
    let mut output = json!({
        "greedy": greedy(input),
        "grid": fallible(manual_service_grid(input)),
    });
    let plan = solve
        .as_ref()
        .ok()
        .filter(|outcome| outcome.result.feasible)
        .map(|outcome| outcome.result.clone())
        .or_else(|| solve_greedy_fallback(input).ok().map(|o| o.result));
    let mut extra_wear = None;
    if let Some(result) = plan {
        let decision = decision_of(&result);
        output["replay"] = fallible(replay_decision_v2(input, &decision));
        output["requirements"] = fallible(resource_requirements_v2(input, &decision));
        output["shortStart"] = fallible(replay_decision_v2_with_resources(
            input,
            &decision,
            result.fuel_start_liters / 2.0,
            result.ve_start_percent / 2.0,
        ));
        let mut broken = decision.clone();
        if let Some(stop) = broken.pit_stops.first_mut() {
            stop.fuel_liters = 0.0;
            output["noFuelAtFirstStop"] = fallible(replay_decision_v2(input, &broken));
        }
        let mut broken = decision;
        if let Some(stop) = broken.pit_stops.last_mut() {
            stop.ve_percent = 0.0;
            stop.change_tyres = false;
            let replay = replay_decision_v2(input, &broken);
            // El último tramo empieza con las ruedas del anterior, que eran
            // nuevas: paga de más pérdida × vueltas del anterior × las suyas.
            // Si el plan se queda sin recursos antes, ese tramo no se evalúa.
            if let Ok(replay) = &replay
                && replay.reasons.first().map(|reason| reason.code.as_str())
                    != Some("resource_exhausted")
                && let [.., previous, last] = result.stints[..]
            {
                extra_wear = Some(
                    input.degradation_per_lap_seconds.value * f64::from(previous) * f64::from(last),
                );
            }
            output["noEnergyNorTyresAtLastStop"] = fallible(replay);
        }
        let edited = edited_of(&result);
        output["recalculate"] = recalculated(input, &edited);
        let mut moved = edited;
        if moved.stints.len() > 1 && moved.stints[1] > 1 {
            moved.stints[0] += 1;
            moved.stints[1] -= 1;
            moved.pit_stop_laps[0] += 1;
            output["recalculateMoved"] = recalculated(input, &moved);
        }
    }
    let (solved, summary) = solved(solve);
    output["solve"] = solved;
    (output, summary, extra_wear)
}

#[test]
fn generated_inputs_keep_their_results_without_fixed_stops() {
    let mut rng = Rng(0x2690_E5E0);
    let mut cases = Vec::new();
    let (mut plans, mut proven, mut refused) = (0, 0, 0);
    for index in 0..320 {
        let input = generated(&mut rng, index % 4 != 0);
        let (output, summary, extra_wear) = everything(&input);
        plans += usize::from(output["solve"]["result"]["feasible"] == true);
        proven += usize::from(output["solve"]["certificate"]["status"] == "proven");
        refused += usize::from(output["greedy"]["refusal"].is_string());
        cases.push(Case {
            id: format!("generado-{index:03}"),
            summary,
            output,
            extra_wear,
            ..Case::default()
        });
    }
    // El corpus tiene que ejercitar de verdad los caminos, no solo errores.
    assert!(
        plans > 120 && proven > 80 && refused > 30,
        "corpus pobre: {plans} con plan, {proven} comprobados, {refused} respaldos negados"
    );
    check("generated", &cases);
}

/// Pasos finos: el presupuesto engorda la rejilla y el cálculo pasa a la
/// búsqueda extendida.
#[test]
fn coarsened_grids_keep_their_results_without_fixed_stops() {
    let mut rng = Rng(0x0E5E_2690);
    let mut cases = Vec::new();
    for index in 0..24 {
        let mut input = generated(&mut rng, false);
        input.race_laps = input.race_laps.min(14);
        input.event_rules.required_windows.clear();
        input.fuel_capacity_liters = Scalar::manual(rng.pick(&[82.0, 110.0]));
        input.discretization.fuel_liters = rng.pick(&[0.25, 0.4]);
        input.budget.max_candidates = 20_000;
        let (output, summary, extra_wear) = everything(&input);
        cases.push(Case {
            id: format!("rejilla-engordada-{index:02}"),
            summary,
            output,
            extra_wear,
            ..Case::default()
        });
    }
    check("coarsened", &cases);
}

// ---------------------------------------------------------------------------
// 4. No fijar nada, de cualquiera de las formas, es el mismo cálculo.
// ---------------------------------------------------------------------------

/// Una lista vacía y una lista con todas las paradas en automático dan, byte a
/// byte, lo mismo que las funciones sin lista: búsqueda, respaldo y recálculo.
#[test]
fn an_empty_or_all_automatic_list_is_the_calculation_without_a_list() {
    let text = |value: &Value| {
        let mut out = String::new();
        canonical(value, &mut out);
        out
    };
    let automatic = [FixedStop::default(); 4];
    let lists: [&[FixedStop]; 2] = [&[], &automatic];
    let mut rng = Rng(0x5EED_2690);
    let mut recalculations = 0;
    for index in 0..160 {
        let input = generated(&mut rng, index % 5 != 0);
        let cancel = AtomicBool::new(false);
        let without = solve_v2_cancellable(&input, &cancel);
        let plan = without
            .as_ref()
            .ok()
            .filter(|outcome| outcome.result.feasible)
            .map(|outcome| outcome.result.clone())
            .or_else(|| solve_greedy_fallback(&input).ok().map(|o| o.result));
        let (expected, _) = solved(without);
        let expected_greedy = greedy(&input);
        for fixed in lists {
            let (actual, _) = solved(solve_v2_fixed(&input, fixed, &cancel));
            assert_eq!(text(&actual), text(&expected), "caso {index}: búsqueda");
            let actual = match solve_greedy_fallback_fixed(&input, fixed) {
                Ok(outcome) => json!(outcome),
                Err(refusal) => json!({ "refusal": refusal.code() }),
            };
            assert_eq!(
                text(&actual),
                text(&expected_greedy),
                "caso {index}: respaldo"
            );
        }
        let Some(result) = plan else { continue };
        recalculations += 1;
        let edited = edited_of(&result);
        let expected = recalculated(&input, &edited);
        for fixed in lists {
            let actual = match recalculate_edited_plan_fixed(&input, &edited, fixed, &cancel) {
                Ok(recalculation) => {
                    assert_eq!(recalculation.unreachable_stop, None, "caso {index}");
                    json!({
                        "outcome": recalculation.outcome,
                        "fallback": format!("{:?}", recalculation.fallback),
                    })
                }
                Err(error) => json!({ "error": error }),
            };
            assert_eq!(text(&actual), text(&expected), "caso {index}: recálculo");
        }
    }
    assert!(
        recalculations > 80,
        "solo {recalculations} recálculos comparados"
    );
}
