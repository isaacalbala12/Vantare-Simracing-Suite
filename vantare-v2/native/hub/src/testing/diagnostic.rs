use serde::{Deserialize, Serialize};
use std::{fs, path::Path, time::Instant};
use vantare_domain::{Snapshot, SourceKind, SourceState};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Module {
    #[default]
    Hub,
    Workshop,
    Studio,
    Launcher,
    Calendar,
    Strategy,
    Engineer,
    Analysis,
    Notifications,
    TestingCenter,
}
impl Module {
    pub const ALL: [Self; 10] = [
        Self::Hub,
        Self::Workshop,
        Self::Studio,
        Self::Launcher,
        Self::Calendar,
        Self::Strategy,
        Self::Engineer,
        Self::Analysis,
        Self::Notifications,
        Self::TestingCenter,
    ];
    pub fn label(self) -> &'static str {
        match self {
            Self::Hub => "Hub",
            Self::Workshop => "Workshop",
            Self::Studio => "Studio",
            Self::Launcher => "Launcher",
            Self::Calendar => "Calendario",
            Self::Strategy => "Strategy",
            Self::Engineer => "Engineer",
            Self::Analysis => "Análisis",
            Self::Notifications => "Notificaciones",
            Self::TestingCenter => "Testing Center",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    Conflict,
    LocalError,
}

/// Solo reconoce mensajes internos exactos; nunca devuelve fragmentos del error.
pub fn error_code(message: &str) -> ErrorCode {
    if message == "conflicto: el documento cambió en disco; cargar antes de guardar" {
        ErrorCode::Conflict
    } else {
        ErrorCode::LocalError
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SectionError {
    pub module: Module,
    pub code: ErrorCode,
    pub observed_at_utc: i64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Source {
    simulator: &'static str,
    kind: &'static str,
    state: &'static str,
    epoch: u64,
    sequence: u64,
}

#[derive(Clone, Default)]
pub struct Observed {
    source: Option<Source>,
    activity: u64,
    last_activity: Option<Instant>,
    pub errors: Vec<SectionError>,
}
impl Observed {
    pub fn snapshot(&mut self, snapshot: &Snapshot) {
        self.source = Some(Source {
            // No se exporta la identidad de sesión, coches, pilotos ni el pipe/SID.
            simulator: vantare_domain::Source::known_simulator(snapshot.origin.source.simulator),
            kind: match snapshot.origin.source.kind {
                SourceKind::Live => "live",
                SourceKind::Replay => "replay",
            },
            state: match snapshot.state.source_state {
                SourceState::Waiting => "waiting",
                SourceState::Live => "live",
                SourceState::Stale => "stale",
                SourceState::Lost => "lost",
            },
            epoch: snapshot.epoch,
            sequence: snapshot.sequence,
        });
    }
    pub fn activity(&mut self, activity: u64, now: Instant) {
        if activity != self.activity {
            self.activity = activity;
            self.last_activity = Some(now);
        }
    }
    pub fn error(&mut self, module: Module, message: &str) {
        let code = error_code(message);
        self.section_error(module, code);
    }
    pub fn section_error(&mut self, module: Module, code: ErrorCode) {
        if let Some(error) = self.errors.iter_mut().find(|error| error.module == module) {
            error.code = code;
            error.observed_at_utc = chrono::Utc::now().timestamp();
            return;
        }
        self.errors.retain(|error| error.module != module);
        self.errors.push(SectionError {
            module,
            code,
            observed_at_utc: chrono::Utc::now().timestamp(),
        });
    }
    fn core(&self, now: Instant) -> &'static str {
        match self.last_activity {
            None => "unobserved",
            Some(at) if now.saturating_duration_since(at).as_secs() < 2 => "recent_messages",
            Some(_) => "silent",
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Binary {
    pub name: &'static str,
    pub state: &'static str,
    pub sha256: Option<String>,
}
pub const BINARIES: [&str; 9] = [
    "vantare-hub.exe",
    "vantare.exe",
    "vantare-core.exe",
    "vantare-overlays.exe",
    "vantare-engineer.exe",
    "vantare-storage.exe",
    "vantare-workshop.exe",
    "vantare-grabar-lmu.exe",
    "vantare-grabar-acc.exe",
];

/// No se accede a UNC ni a rutas de dispositivo: toda operación es local.
pub fn local_path(path: &Path) -> bool {
    let value = path.as_os_str().to_string_lossy();
    if value.starts_with('\\') || value.starts_with("//") {
        return false;
    }
    #[cfg(windows)]
    {
        super::windows::local(path)
    }
    #[cfg(not(windows))]
    {
        true
    }
}

pub fn binaries(root: &Path) -> Vec<Binary> {
    BINARIES
        .into_iter()
        .map(|name| {
            let path = root.join(name);
            let (state, sha256) = if local_path(root) {
                match fs::symlink_metadata(&path) {
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => ("missing", None),
                    Ok(meta) if meta.is_file() && !meta.file_type().is_symlink() => {
                        match hash(&path) {
                            Ok(hash) => ("present", Some(hash)),
                            Err(()) => ("unreadable", None),
                        }
                    }
                    _ => ("unreadable", None),
                }
            } else {
                ("unavailable", None)
            };
            Binary {
                name,
                state,
                sha256,
            }
        })
        .collect()
}
#[cfg(windows)]
fn hash(path: &Path) -> Result<String, ()> {
    super::windows::sha256(path)
}
#[cfg(not(windows))]
fn hash(_path: &Path) -> Result<String, ()> {
    Err(())
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DataPath {
    role: &'static str,
    path: &'static str,
    state: &'static str,
}

/// Lista blanca explícita: no serializar tipos de producto ni JSON arbitrario.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostic {
    schema_version: u32,
    version: &'static str,
    channel: &'static str,
    os: &'static str,
    arch: &'static str,
    generated_at_utc: i64,
    core: &'static str,
    source: Option<Source>,
    pub binaries: Vec<Binary>,
    data_paths: Vec<DataPath>,
    pub section_errors: Vec<SectionError>,
    uninstrumented_sections: [Module; 2],
}
impl Diagnostic {
    pub fn collect(root: &Path, data: &Path, observed: &Observed, now: Instant) -> Self {
        Self {
            schema_version: 1,
            version: option_env!("VANTARE_VERSION").unwrap_or(env!("CARGO_PKG_VERSION")),
            channel: option_env!("VANTARE_BUILD_CHANNEL").unwrap_or("development"),
            os: std::env::consts::OS,
            arch: std::env::consts::ARCH,
            generated_at_utc: chrono::Utc::now().timestamp(),
            core: observed.core(now),
            source: observed.source.clone(),
            binaries: binaries(root),
            data_paths: [
                ("hub", "<hub-data>", data.to_path_buf()),
                (
                    "draft",
                    "<hub-data>/testing-center/report-draft.json",
                    data.join("testing-center/report-draft.json"),
                ),
            ]
            .into_iter()
            .map(|(role, path, actual)| DataPath {
                role,
                path,
                state: if local_path(&actual) {
                    match fs::symlink_metadata(actual) {
                        Ok(_) => "present",
                        Err(error) if error.kind() == std::io::ErrorKind::NotFound => "missing",
                        _ => "unavailable",
                    }
                } else {
                    "unavailable"
                },
            })
            .collect(),
            section_errors: observed.errors.clone(),
            // Estas secciones no exponen error tipado; no interpretar su texto de estado.
            uninstrumented_sections: [Module::Studio, Module::Analysis],
        }
    }
    pub fn summary(&self) -> String {
        let source = self.source.as_ref().map_or_else(
            || "sin foto observada".into(),
            |source| {
                format!(
                    "{} / {} / {} · revisión {}",
                    source.simulator, source.kind, source.state, source.sequence
                )
            },
        );
        format!("Núcleo: {} · {source}", self.core)
    }
}
