//! Banco explícito: inspección o escucha, nunca arranca Core ni toca ajustes.
use std::{
    io,
    path::PathBuf,
    time::{Duration, Instant},
};
use vantare_engineer::{
    radio::{Intent, Locale},
    voice::{self, Voice},
};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = std::env::args().skip(1);
    let mode = args
        .next()
        .ok_or("uso: coverage [CARPETA] | play|preempt LOCALE INTENT [CARPETA]")?;
    let selection = if matches!(mode.as_str(), "play" | "preempt") {
        let locale = Locale::parse(&args.next().ok_or("falta locale")?).ok_or("locale inválido")?;
        let key = args.next().ok_or("falta intent")?;
        let intent = Intent::ALL
            .into_iter()
            .find(|intent| intent.key() == key)
            .ok_or("intent inválido")?;
        Some((locale, intent))
    } else if mode == "coverage" {
        None
    } else {
        return Err("modo inválido".into());
    };
    let root = args
        .next()
        .map(PathBuf::from)
        .or_else(voice::default_cache_root)
        .ok_or("APPDATA ausente; indicar CARPETA")?;
    if args.next().is_some() {
        return Err("demasiados argumentos".into());
    }
    if let Some((locale, intent)) = selection {
        let mut player = Voice::new(Some(&root))?;
        let start = Instant::now();
        let duration = player
            .play(locale, intent, Duration::ZERO)?
            .ok_or_else(|| io::Error::other("voz desactivada"))?;
        if mode == "preempt" {
            std::thread::sleep(Duration::from_millis(100));
            let second = player
                .play(locale, Intent::PitExit, start.elapsed())?
                .ok_or_else(|| io::Error::other("voz desactivada"))?;
            player.stop()?;
            player.stop()?; // Parada idempotente y sin deadline activo.
            if player.tick(start.elapsed())? {
                return Err("deadline activo tras stop".into());
            }
            println!(
                "{}",
                serde_json::json!({"locale":locale.code(), "intent":intent.key(), "duration_ms":duration.as_millis(), "replacement":"pitstops.exit", "replacement_duration_ms":second.as_millis(), "result":"preempted_and_stopped"})
            );
            return Ok(());
        }
        while !player.tick(start.elapsed())? {
            std::thread::sleep(Duration::from_millis(20));
        }
        println!(
            "{}",
            serde_json::json!({"locale":locale.code(), "voice":locale.voice(), "intent":intent.key(), "text":intent.text(locale), "duration_ms":duration.as_millis(), "elapsed_ms":start.elapsed().as_millis(), "result":"started_and_stopped"})
        );
    } else {
        println!("{}", serde_json::to_string_pretty(&voice::coverage(&root))?);
    }
    Ok(())
}
