//! Consume el DTO productivo por stdin; evalúa `Kind::ALL` sin crear ventanas.
use crate::{Kind, Settings, Widget};
use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
    fs::File,
    io::{self, BufRead, Write},
};

#[path = "offline_motion.rs"]
mod motion;

fn qualities(value: &Value, path: &str, counts: &mut BTreeMap<String, BTreeMap<String, u64>>) {
    if let Some(text) = value.as_str() {
        if matches!(text, "unavailable" | "not_requested") {
            *counts
                .entry(path.into())
                .or_default()
                .entry(text.into())
                .or_default() += 1;
        }
    } else if let Some(object) = value.as_object() {
        if object.len() == 1
            && let Some((quality, _)) = object.iter().next()
            && matches!(quality.as_str(), "reliable" | "estimated" | "stale")
        {
            *counts
                .entry(path.into())
                .or_default()
                .entry(quality.clone())
                .or_default() += 1;
        } else {
            for (key, value) in object {
                qualities(value, &format!("{path}/{key}"), counts);
            }
        }
    } else if let Some(array) = value.as_array() {
        for value in array {
            qualities(value, &format!("{path}[]"), counts);
        }
    }
}
fn run() -> Result<(), Box<dyn std::error::Error>> {
    let path = std::env::var_os("VANTARE_1638_OFFLINE_REPORT").ok_or("ruta QA explícita")?;
    let mut output = File::options().write(true).create_new(true).open(path)?;
    let prefs = vantare_domain::format::Preferences::default();
    let mut widgets: Vec<_> = Kind::ALL
        .iter()
        .map(|&kind| {
            let settings = Settings::default_for(kind);
            (
                kind,
                Widget::new(&settings, prefs),
                0_u64,
                settings.demand(),
            )
        })
        .collect();
    let mut counts = BTreeMap::new();
    let mut per_session = BTreeMap::new();
    let mut photos = 0_u64;
    let mut motion = motion::Motion::default();
    let mut source_states = BTreeMap::<String, u64>::new();
    for line in io::stdin().lock().lines() {
        let line = line?;
        let snapshot = vantare_ipc::snapshot_from_json(&line)?;
        if snapshot.origin.source.kind != vantare_domain::SourceKind::Replay {
            return Err("QA offline exige SourceKind::Replay".into());
        }
        photos += 1;
        motion.observe(&snapshot);
        *source_states
            .entry(format!("{:?}", snapshot.state.source_state))
            .or_default() += 1;
        if photos.is_multiple_of(10_000) {
            eprintln!("QA widgets: {photos} fotos evaluadas");
        }
        for (_, widget, changes, _) in &mut widgets {
            if widget.ingest(&snapshot, prefs) {
                *changes += 1;
            }
        }
        let dto = serde_json::from_str::<Value>(&line)?;
        qualities(&dto, "", &mut counts);
        let session = format!(
            "{:?}:{}",
            snapshot.state.session.kind, snapshot.state.session.id.0
        );
        qualities(
            &dto,
            "",
            per_session.entry(session).or_insert_with(BTreeMap::new),
        );
    }
    let widgets:Vec<_>=widgets.into_iter().map(|(kind,_,changes,demand)|json!({"widget":kind.name(),"photos_evaluated":photos,"projection_changes":changes,"required_signals":demand,"status":if photos>0 {"evaluated_not_certified"} else {"no_data"}})).collect();
    let catalog: Vec<_> = Kind::ALL.iter().map(|kind| kind.name()).collect();
    let report = json!({"widget_catalog":catalog,"schema":"vantare.widgets-offline-report.v1","photos":photos,"widgets":widgets,"motion_evidence":motion.report(),"source_state_counts":source_states,"field_quality_counts":counts,"field_quality_per_session":per_session,"note":"Evaluar proyecciones no acredita todas las señales. Revisar los unavailable/stale y el informe de avisos, por sesión y situación."});
    output.write_all(&serde_json::to_vec_pretty(&report)?)?;
    output.sync_all()?;
    if photos == 0 {
        return Err("no llegaron fotos; no se acredita cobertura".into());
    }
    Ok(())
}
#[test]
#[ignore = "opt-in: DTOs del Core offline por stdin, sin ventanas"]
fn recorded_dtos_reach_all_widgets() {
    run().expect("verificación de todas las fotos grabadas");
}
