//! Coste frío de la proyección común con fotos reales, sin ventana ni caché.
use std::{hint::black_box, time::Instant};
use vantare_domain::{Snapshot, format::Preferences, standings};
fn project(snapshot: &Snapshot, prefs: Preferences, content: &standings::Content) {
    black_box(standings::project_content(snapshot, prefs, content));
}
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    if args.len() != 3 {
        return Err("uso: project layout.json fotos.json medicion.json".into());
    }
    let layout = vantare_ui::layout::Layout::from_json(&std::fs::read(&args[0])?)?;
    let vantare_ui::Settings::Standings(settings) =
        &layout.instances.first().ok_or("layout vacío")?.settings
    else {
        return Err("requiere Standings".into());
    };
    let content = standings::Content {
        player_class: settings.class_scope != "all-classes",
        class_gaps: settings.class_scope != "all-classes"
            || settings.classification_mode == "multiclass",
        footer_ids: settings
            .footer_slots
            .clone()
            .filter(|v| !v.is_empty())
            .unwrap_or_else(|| {
                vec![
                    settings.footer_first.clone(),
                    settings.footer_second.clone(),
                ]
            }),
        footer_slots: settings
            .footer_slots
            .as_ref()
            .is_some_and(|v| !v.is_empty()),
    };
    let photos = vantare_ui::workshop::snapshots_from_json(&std::fs::read_to_string(&args[1])?)?;
    if photos.is_empty() {
        return Err("corpus vacío".into());
    }
    for photo in &photos {
        for _ in 0..100 {
            project(photo, layout.preferences, &content);
        }
    }
    let mut samples = Vec::with_capacity(photos.len() * 1000);
    for _ in 0..1000 {
        for photo in &photos {
            let start = Instant::now();
            project(black_box(photo), layout.preferences, &content);
            samples.push(u64::try_from(start.elapsed().as_nanos()).unwrap_or(u64::MAX));
        }
    }
    samples.sort_unstable();
    let report = serde_json::json!({"samples":samples.len(),"p50_ns":samples[samples.len()/2],"p99_ns":samples[samples.len()*99/100],"raw_ns":samples,"measurement":"cold project, real corpus, release, no previous Board"});
    std::fs::write(&args[2], serde_json::to_vec_pretty(&report)?)?;
    Ok(())
}
