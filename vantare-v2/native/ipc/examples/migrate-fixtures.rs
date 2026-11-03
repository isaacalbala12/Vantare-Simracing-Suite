//! Comparación Snapshot == antes/después de propuestas de migración UI (#1868).
use serde::Deserialize;
use serde_json::Value;
use std::{error::Error, fs, path::Path};
use vantare_domain::Snapshot;
use vantare_ipc::{snapshot_from_json, snapshot_from_saved_json};

type Result<T> = std::result::Result<T, Box<dyn Error>>;

#[derive(Deserialize)]
struct Pair {
    source: String,
    candidate: String,
}

fn photo(text: &str, saved: bool) -> Result<Snapshot> {
    Ok(if saved {
        snapshot_from_saved_json(text)?
    } else {
        snapshot_from_json(text)?
    })
}

fn collect(value: &Value, saved: bool, out: &mut Vec<Snapshot>) -> Result<()> {
    if value.get("state").is_some() && value.get("epoch").is_some() {
        out.push(photo(&value.to_string(), saved)?);
    } else {
        match value {
            Value::Object(map) => {
                for child in map.values() {
                    collect(child, saved, out)?;
                }
            }
            Value::Array(list) => {
                for child in list {
                    collect(child, saved, out)?;
                }
            }
            _ => {}
        }
    }
    Ok(())
}

fn snapshots(text: &str, saved: bool) -> Result<Vec<Snapshot>> {
    let value: Value = serde_json::from_str(text)?;
    if value.get("state").is_some() && value.get("epoch").is_some() {
        return Ok(vec![photo(text, saved)?]); // Sin reserializar números de una foto literal.
    }
    let mut out = Vec::new();
    collect(&value, saved, &mut out)?;
    Ok(out)
}

fn main() -> Result<()> {
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    let [manifest, mode] = args.as_slice() else {
        return Err("uso: migrate-fixtures MANIFEST.json --check|--apply".into());
    };
    if !matches!(mode.as_str(), "--check" | "--apply") {
        return Err("modo desconocido".into());
    }
    let root = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../ui")
        .canonicalize()?;
    let proposal_root = Path::new(manifest)
        .parent()
        .ok_or("directorio de propuestas")?
        .join("proposals")
        .canonicalize()?;
    let pairs: Vec<Pair> = serde_json::from_slice(&fs::read(manifest)?)?;
    if pairs.is_empty() {
        return Err("manifiesto vacío".into());
    }
    let (mut photos, mut changed_files) = (0, 0);
    for pair in &pairs {
        let relative = Path::new(&pair.source).strip_prefix("native/ui")?;
        let path = root.join(relative).canonicalize()?;
        let candidate = Path::new(&pair.candidate).canonicalize()?;
        if !path.starts_with(&root)
            || !candidate.starts_with(&proposal_root)
            || path.extension().is_none_or(|e| e != "json")
        {
            return Err("solo fixtures UI y propuestas del manifiesto".into());
        }
        let original = fs::read_to_string(&path)?;
        let proposed = fs::read_to_string(candidate)?;
        let before = snapshots(&original, true)?;
        let after = snapshots(&proposed, false)?;
        assert!(!before.is_empty(), "fixture sin fotos: {}", path.display());
        assert_eq!(after, before, "Snapshot == en {}", path.display());
        if mode == "--apply" && original != proposed {
            fs::write(&path, &proposed)?;
            assert_eq!(snapshots(&fs::read_to_string(&path)?, false)?, before);
        }
        photos += before.len();
        changed_files += usize::from(original != proposed);
    }
    println!(
        "files={} photos={photos} changed_files={changed_files} applied={}",
        pairs.len(),
        mode == "--apply"
    );
    Ok(())
}
