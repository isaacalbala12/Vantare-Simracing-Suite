//! QA offline: mismo Replay, Translator, Core y DTO que el producto.
use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
    fs::File,
    io::{self, BufReader, BufWriter, Write},
    path::PathBuf,
    time::Duration,
};
use vantare_runtime::{adapter::open_replay, core::Core, lmu_recording::Reader};

type TimingCounts = BTreeMap<String, BTreeMap<String, u64>>;
fn count_timing(
    value: &Value,
    counts: &mut TimingCounts,
) -> Result<(), Box<dyn std::error::Error>> {
    for field in [
        "started_at_s",
        "finished_at_s",
        "scheduled_end_s",
        "start_phase",
        "distance_to_start_line_m",
        "next_kind",
        "next_starts_at_s",
    ] {
        let quality = &value["state"]["session"][field];
        let quality = quality
            .as_str()
            .or_else(|| {
                quality
                    .as_object()
                    .and_then(|o| o.keys().next().map(String::as_str))
            })
            .ok_or("campo de avisos ausente del DTO")?;
        *counts
            .entry(field.into())
            .or_default()
            .entry(quality.into())
            .or_default() += 1;
    }
    Ok(())
}

fn inventory(
    input: &std::path::Path,
) -> Result<(BTreeMap<String, Value>, u64), Box<dyn std::error::Error>> {
    let mut inventory = BTreeMap::<String, Value>::new();
    let mut footer = false;
    let mut stable_frames = 0_u64;
    for record in Reader::new(BufReader::new(File::open(input)?)) {
        let record = record?;
        if !matches!(
            record.kind.as_str(),
            "header" | "shm" | "rest" | "gap" | "footer"
        ) {
            return Err("tipo de registro desconocido".into());
        }
        footer |= record.kind == "footer";
        if record.kind == "shm" && record.key == "LMU_Data" && record.details["stable"] == true {
            stable_frames += 1;
            if stable_frames.is_multiple_of(25_000) {
                eprintln!("Integridad: {stable_frames} frames SHM estables verificados");
            }
        }
        if record.kind == "rest" {
            let entry = inventory
                .entry(record.key)
                .or_insert_with(|| json!({"responses":0,"ok":0,"errors":0,"statuses":{}}));
            entry["responses"] = json!(entry["responses"].as_u64().unwrap_or(0) + 1);
            let field = if record.status == Some(200) && record.error.is_none() {
                "ok"
            } else {
                "errors"
            };
            entry[field] = json!(entry[field].as_u64().unwrap_or(0) + 1);
            let status = record
                .status
                .map_or_else(|| "transport".into(), |s| s.to_string());
            entry["statuses"][&status] =
                json!(entry["statuses"][&status].as_u64().unwrap_or(0) + 1);
        }
    }
    if !footer || stable_frames == 0 {
        return Err("grabación incompleta o sin frames SHM estables".into());
    }
    Ok((inventory, stable_frames))
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    if args.len() != 2 {
        return Err(
            "uso: vantare-verificar-lmu <sesion.lmu.gz> <informe.json>; DTOs por stdout".into(),
        );
    }
    let input = PathBuf::from(&args[0]);
    let output = PathBuf::from(&args[1]);
    if output.exists() {
        return Err("el informe ya existe".into());
    }
    let (inventory, stable_frames) = inventory(&input)?;
    let mut replay = open_replay(&input, None)?;
    let mut core = Core::new(1);
    core.set_demand(vantare_ipc::Demand::all());
    let mut stdout = BufWriter::new(io::stdout().lock());
    let mut errors = Vec::new();
    let mut rejected = 0_u64;
    let mut photos = 0_u64;
    let mut sequence = 0;
    let mut last = Duration::ZERO;
    let mut sessions = BTreeMap::<String, u64>::new();
    let mut timing = TimingCounts::new();
    let mut timing_per_session = BTreeMap::new();
    while let Some(at) = replay.next_recorded_at() {
        let at = at.max(last);
        last = at;
        if let Err(error) = core.step(&mut replay, at) {
            rejected += 1;
            if errors.len() < 16 {
                errors.push(error.to_string());
            }
        }
        let snapshot = core.snapshot();
        if snapshot.sequence == sequence {
            continue;
        }
        sequence = snapshot.sequence;
        if snapshot.state.player.is_none() || snapshot.state.cars.is_empty() {
            continue;
        }
        photos += 1;
        *sessions
            .entry(format!(
                "{:?}:{}",
                snapshot.state.session.kind, snapshot.state.session.id.0
            ))
            .or_default() += 1;
        let dto = vantare_ipc::snapshot_to_json(&snapshot)?;
        let value: Value = serde_json::from_str(&dto)?;
        count_timing(&value, &mut timing)?;
        let session = format!(
            "{:?}:{}",
            snapshot.state.session.kind, snapshot.state.session.id.0
        );
        count_timing(
            &value,
            timing_per_session
                .entry(session)
                .or_insert_with(TimingCounts::new),
        )?;
        writeln!(stdout, "{dto}")?;
    }
    stdout.flush()?;
    let report = json!({"schema":"vantare.lmu-offline-report.v1","integrity":"complete_footer_hashes_gzip_crc_verified","stable_raw_frames":stable_frames,"photos":photos,"adapter_or_core_rejections":rejected,"first_errors":errors,"sessions":sessions,"session_alerts":timing,"session_alerts_per_session":timing_per_session,"rest_inventory":inventory,"status":if photos>0 {"evaluated_pending_coverage_review"} else {"blocked_no_admitted_photos"},"note":"Las respuestas adicionales se conservan; solo los endpoints admitidos por el adapter aportan señales. Ausencia no equivale a cobertura."});
    let mut file = File::options().write(true).create_new(true).open(output)?;
    file.write_all(&serde_json::to_vec_pretty(&report)?)?;
    file.sync_all()?;
    if photos == 0 {
        return Err(
            "sin fotos admitidas; consultar informe, quizá build sin layout verificado".into(),
        );
    }
    Ok(())
}
fn main() {
    if let Err(error) = run() {
        eprintln!("ERROR: {error}");
        std::process::exit(1);
    }
}
