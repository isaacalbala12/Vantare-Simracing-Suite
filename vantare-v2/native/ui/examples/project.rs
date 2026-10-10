//! Coste frío de la proyección común con fotos reales, sin ventana ni caché.
use std::{hint::black_box, time::Instant};
use vantare_domain::{Snapshot, format::Preferences, standings};
enum Content {
    Standings(standings::Content),
    Fuel(vantare_domain::fuel_strategy::Config),
    Delta(vantare_domain::delta::Reference),
    Relative(vantare_domain::relative::Content, Vec<String>),
}
fn project(snapshot: &Snapshot, prefs: Preferences, content: &Content) {
    match content {
        Content::Fuel(c) => {
            black_box(vantare_domain::fuel_strategy::project_with_config(
                snapshot, prefs, *c,
            ));
        }
        Content::Delta(r) => {
            black_box(vantare_domain::delta::project_reference(
                snapshot, prefs, *r,
            ));
        }
        Content::Standings(c) => {
            black_box(standings::project_content(snapshot, prefs, c));
        }
        Content::Relative(c, ids) => {
            black_box(vantare_domain::relative::project_configured(
                snapshot, prefs, *c, ids,
            ));
        }
    }
}
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    if args.len() != 3 {
        return Err("uso: project layout.json fotos.json medicion.json".into());
    }
    let layout = vantare_ui::layout::Layout::from_json(&std::fs::read(&args[0])?)?;
    let settings = &layout.instances.first().ok_or("layout vacío")?.settings;
    let content = match settings {
        vantare_ui::Settings::Standings(settings) => Content::Standings(standings::Content {
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
            ..standings::Content::default()
        }),
        vantare_ui::Settings::Relative(settings) => Content::Relative(
            vantare_domain::relative::Content {
                range_ahead: settings.range_ahead,
                range_behind: settings.range_behind,
                same_class: settings.class_scope == "sameClass",
                include_player: settings.include_player,
            },
            settings.footer_slots.clone(),
        ),
        vantare_ui::Settings::Delta(s) => Content::Delta(match s.reference.as_str() {
            "optimal" => vantare_domain::delta::Reference::Optimal,
            "leader" => vantare_domain::delta::Reference::Leader,
            _ => vantare_domain::delta::Reference::PersonalBest,
        }),
        vantare_ui::Settings::FuelStrategy(s) => {
            Content::Fuel(vantare_domain::fuel_strategy::Config {
                history_rows: s.history_rows,
                show_projection: s.show_projection,
                virtual_energy: s.source == "virtual-energy",
            })
        }
        _ => return Err("requiere un widget con proyección común".into()),
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
            for _ in 0..32 {
                project(black_box(photo), layout.preferences, &content);
            }
            samples.push(u64::try_from(start.elapsed().as_nanos() / 32).unwrap_or(u64::MAX));
        }
    }
    samples.sort_unstable();
    let report = serde_json::json!({"samples":samples.len(),"p50_ns":samples[samples.len()/2],"p99_ns":samples[samples.len()*99/100],"raw_ns":samples,"measurement":"cold project, 32 independent calls per timed sample, real corpus, release, no previous Board"});
    std::fs::write(&args[2], serde_json::to_vec_pretty(&report)?)?;
    Ok(())
}
