//! Sondeo y publicación fuera del núcleo; un error local no para el consumidor.
use crate::{
    control::{self, Document, Settings, Status},
    radio::{Intent, Locale},
    voice::{clip_paths, resolve_clip},
    worker::RadioWorker,
};
use std::{
    io,
    path::PathBuf,
    time::{Duration, Instant, SystemTime},
};

const SPOKEN: &[Intent] = &Intent::ALL;

pub struct Local {
    document: Document,
    path: PathBuf,
    published: Option<Vec<u8>>,
    clips: Option<PathBuf>,
    scan_at: Option<Instant>,
    asset_stamps: Vec<Option<(SystemTime, u64)>>,
    status: Status,
    settings_error: Option<String>,
    publish_error: Option<String>,
    heartbeat_at: Option<Instant>,
    heartbeat_ms: u64,
}
impl Local {
    pub fn new(path: PathBuf, settings: Settings, clips: Option<PathBuf>) -> Self {
        let status_path = control::status_path(&path);
        Self {
            document: Document::new(path, settings.clone()),
            path: status_path,
            published: None,
            clips,
            scan_at: None,
            asset_stamps: Vec::new(),
            status: Status {
                version: 1,
                active: true,
                pid: std::process::id(),
                settings,
                assets: control::LOCALES
                    .iter()
                    .map(|locale| ((*locale).into(), false))
                    .collect(),
                last_message: None,
                error: None,
            },
            settings_error: None,
            publish_error: None,
            heartbeat_at: None,
            heartbeat_ms: 0,
        }
    }
    /// Aplicación y confirmación en el mismo hilo que selecciona la radio.
    pub fn poll(&mut self, radio: &mut RadioWorker, output: &mut impl io::Write) -> io::Result<()> {
        self.settings_error = match self
            .document
            .poll()
            .and_then(|_| radio.configure(self.document.settings()))
        {
            Ok(changed) => {
                self.status.settings = self.document.settings().clone();
                if changed {
                    writeln!(
                        output,
                        "{{\"version\":\"vantare.radio.status.v1\",\"clear\":true}}"
                    )?;
                    output.flush()?;
                }
                None
            }
            Err(error) => Some(format!("ajustes: {error}")),
        };
        if self
            .scan_at
            .is_none_or(|at| at.elapsed() >= Duration::from_secs(1))
        {
            // Validar clips solo cuando cambien los archivos, no leer el pack
            // completo cada segundo mientras el piloto está en pista.
            let stamps: Vec<_> = control::LOCALES
                .iter()
                .flat_map(|code| SPOKEN.iter().map(move |intent| (*code, *intent)))
                .flat_map(|(code, intent)| {
                    let paths = self
                        .clips
                        .as_ref()
                        .and_then(|root| clip_paths(root, Locale::parse(code)?, intent).ok());
                    paths.into_iter().flatten().map(|path| {
                        let meta = std::fs::metadata(path).ok()?;
                        Some((meta.modified().ok()?, meta.len()))
                    })
                })
                .collect();
            if self.asset_stamps != stamps {
                self.asset_stamps = stamps;
                for &code in control::LOCALES {
                    let available = self.clips.as_deref().is_some_and(|root| {
                        Locale::parse(code).is_some_and(|locale| {
                            SPOKEN
                                .iter()
                                .all(|intent| resolve_clip(root, locale, *intent).is_ok())
                        })
                    });
                    self.status.assets.insert(code.into(), available);
                }
            }
            self.scan_at = Some(Instant::now());
        }
        Ok(())
    }
    pub fn publish(&mut self, radio: &RadioWorker, active: bool, runtime_error: Option<&str>) {
        self.status.active = active;
        self.status.last_message = radio.last_message().cloned();
        let errors: Vec<_> = self
            .settings_error
            .as_deref()
            .into_iter()
            .chain(runtime_error)
            .chain(radio.voice_error())
            .collect();
        self.status.error = if errors.is_empty() {
            None
        } else {
            Some(errors.join(" · "))
        };
        let result = (|| -> io::Result<()> {
            if self
                .heartbeat_at
                .is_none_or(|at| at.elapsed() >= Duration::from_secs(1))
            {
                self.heartbeat_ms = control::runtime::now_ms();
                self.heartbeat_at = Some(Instant::now());
            }
            let mut runtime = radio.runtime_status(self.heartbeat_ms, &self.status.assets);
            if !active {
                runtime.connection = control::runtime::Connection::Disconnected;
                runtime.player_available = false;
            }
            let report = control::runtime::Report {
                status: self.status.clone(),
                runtime: Some(runtime),
            };
            let bytes = serde_json::to_vec_pretty(&report.json()).map_err(io::Error::other)?;
            if self.published.as_ref() == Some(&bytes) {
                return Ok(());
            }
            let previous = control::read(&self.path)?;
            control::save(&self.path, previous.as_deref(), &bytes)?;
            self.published = Some(bytes);
            Ok(())
        })();
        let error = result.err().map(|error| error.to_string());
        if self.publish_error != error {
            if let Some(error) = &error {
                eprintln!("estado local Engineer: {error}");
            }
            self.publish_error = error;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn status_writes_only_on_change_and_checks_complete_local_voice_packs() {
        // Pack WAV sintético para validar archivos; no reproduce audio.
        let root = std::env::temp_dir().join(format!("engineer-assets-{}", std::process::id()));
        fs::create_dir(&root).expect("temporal");
        let clips = root.join("clips");
        fs::create_dir(&clips).expect("clips");
        let mut radio = RadioWorker::new(Locale::Es, Some(&clips)).expect("worker");
        let seed = Settings {
            voice: true,
            ..Default::default()
        };
        let mut local = Local::new(root.join("engineer.json"), seed, Some(clips.clone()));
        local.poll(&mut radio, &mut Vec::new()).expect("sondear");
        local.publish(&radio, true, None);
        assert!(local.status.assets.values().all(|present| !present));
        let old = SystemTime::UNIX_EPOCH;
        fs::OpenOptions::new()
            .write(true)
            .open(&local.path)
            .expect("estado")
            .set_modified(old)
            .expect("mtime");
        local.publish(&radio, true, None);
        assert_eq!(
            control::modified(&local.path),
            Some(old),
            "no reescribir sin cambio"
        );
        let mut wav = vec![0; 44 + 320];
        wav[..4].copy_from_slice(b"RIFF");
        wav[4..8].copy_from_slice(&356_u32.to_le_bytes());
        wav[8..16].copy_from_slice(b"WAVEfmt ");
        wav[16..20].copy_from_slice(&16_u32.to_le_bytes());
        wav[20..22].copy_from_slice(&1_u16.to_le_bytes());
        wav[22..24].copy_from_slice(&1_u16.to_le_bytes());
        wav[24..28].copy_from_slice(&16_000_u32.to_le_bytes());
        wav[28..32].copy_from_slice(&32_000_u32.to_le_bytes());
        wav[32..34].copy_from_slice(&2_u16.to_le_bytes());
        wav[34..36].copy_from_slice(&16_u16.to_le_bytes());
        wav[36..40].copy_from_slice(b"data");
        wav[40..44].copy_from_slice(&320_u32.to_le_bytes());
        for intent in SPOKEN {
            fs::write(
                &clip_paths(&clips, Locale::Es, *intent).expect("hash")[0],
                &wav,
            )
            .expect("clip");
        }
        local.scan_at = None;
        local.poll(&mut radio, &mut Vec::new()).expect("pack nuevo");
        assert!(local.status.assets["es"]);
        assert!(!local.status.assets["en"]);
        fs::write(
            &clip_paths(&clips, Locale::Es, Intent::FuelOne).expect("hash")[0],
            b"roto",
        )
        .expect("corrupto");
        local.scan_at = None;
        local
            .poll(&mut radio, &mut Vec::new())
            .expect("pack corrupto");
        assert!(!local.status.assets["es"]);
        local.publish(&radio, false, Some("cierre de prueba"));
        let bytes = control::read(&local.path)
            .expect("leer")
            .expect("estado publicado");
        let status = Status::parse(&bytes).expect("roundtrip");
        assert!(!status.active);
        assert!(status.error.is_some());
        for intent in SPOKEN {
            fs::remove_file(&clip_paths(&clips, Locale::Es, *intent).expect("hash")[0])
                .expect("limpiar clip");
        }
        fs::remove_dir(clips).expect("limpiar clips");
        fs::remove_file(&local.path).expect("limpiar estado");
        fs::remove_file(local.path.with_extension("json.lock")).expect("limpiar lock");
        fs::remove_dir(root).expect("limpiar temporal");
    }
}
