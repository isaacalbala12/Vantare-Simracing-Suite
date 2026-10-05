//! Workshop de desarrollo sobre el mismo `Overlay` que el producto.
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use gpui::{
    App, Context, Entity, FocusHandle, IntoElement, Render, Window, WindowOptions, div, prelude::*,
    rgb,
};
use vantare_domain::{Snapshot, format::Preferences};

use crate::{
    Kind,
    app::{self, Overlay},
};

const FIXTURES: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/fixtures");

struct Scene {
    path: PathBuf,
    modified: Option<SystemTime>,
    snapshots: Vec<Snapshot>,
    error: Option<String>,
}

/// Foto DTO o secuencia no vacía; cada miembro conserva la validación del IPC.
pub fn snapshots_from_json(json: &str) -> Result<Vec<Snapshot>, String> {
    if json.trim_start().starts_with('[') {
        let values: Vec<serde_json::Value> =
            serde_json::from_str(json).map_err(|e| e.to_string())?;
        if values.is_empty() {
            return Err("la escena no contiene fotos".into());
        }
        values
            .into_iter()
            .enumerate()
            .map(|(i, value)| {
                vantare_ipc::snapshot_from_json(&value.to_string())
                    .map_err(|e| format!("foto {i}: {e}"))
            })
            .collect()
    } else {
        vantare_ipc::snapshot_from_json(json)
            .map(|snapshot| vec![snapshot])
            .map_err(|e| e.to_string())
    }
}

fn load(path: &Path) -> Result<Vec<Snapshot>, String> {
    let json = std::fs::read_to_string(path).map_err(|e| format!("{}: {e}", path.display()))?;
    snapshots_from_json(&json).map_err(|e| format!("{}: {e}", path.display()))
}

fn modified(path: &Path) -> Option<SystemTime> {
    std::fs::metadata(path).and_then(|m| m.modified()).ok()
}

impl Scene {
    fn new(path: PathBuf) -> Result<Self, String> {
        let stamp = modified(&path);
        let snapshots = load(&path)?;
        Ok(Self {
            path,
            modified: stamp,
            snapshots,
            error: None,
        })
    }

    fn reload(&mut self) {
        // Una escritura incompleta o JSON inválido nunca reemplaza la última foto válida.
        match load(&self.path) {
            Ok(snapshots) => {
                self.snapshots = snapshots;
                self.error = None;
            }
            Err(error) => self.error = Some(error),
        }
    }

    fn poll(&mut self) -> bool {
        let stamp = modified(&self.path);
        if stamp == self.modified {
            return false;
        }
        self.modified = stamp;
        self.reload();
        true
    }

    fn select(&mut self, path: PathBuf) {
        self.modified = modified(&path);
        self.path = path;
        self.reload();
    }
}

fn scenes(initial: &Path) -> Result<Vec<PathBuf>, String> {
    let mut paths = std::fs::read_dir(FIXTURES)
        .map_err(|e| format!("leer {FIXTURES}: {e}"))?
        .map(|entry| entry.map(|e| e.path()))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    paths.retain(|p| {
        p.is_file()
            && (p.to_string_lossy().ends_with(".snapshot.json")
                || p.to_string_lossy().ends_with(".sequence.json"))
    });
    let mut paths = paths
        .into_iter()
        .map(std::fs::canonicalize)
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    if !paths.iter().any(|p| p == initial) {
        paths.push(initial.to_path_buf());
    }
    paths.sort();
    Ok(paths)
}

struct LiveStyle {
    path: PathBuf,
    modified: Option<SystemTime>,
    value: std::sync::Arc<crate::standings::style::Style>,
    error: Option<String>,
}

impl LiveStyle {
    fn new(path: PathBuf) -> Self {
        let mut file = Self {
            path,
            modified: None,
            value: crate::standings::style::Style::compiled(),
            error: None,
        };
        file.reload();
        file
    }

    fn reload(&mut self) {
        self.modified = modified(&self.path);
        match std::fs::read_to_string(&self.path)
            .map_err(|e| e.to_string())
            .and_then(|json| crate::standings::style::Style::from_json(&json))
        {
            Ok(style) => {
                self.value = style;
                self.error = None;
            }
            Err(error) => self.error = Some(format!("{}: {error}", self.path.display())),
        }
    }

    fn poll(&mut self) -> bool {
        if modified(&self.path) == self.modified {
            return false;
        }
        self.reload();
        true
    }
}

struct Workshop {
    style: LiveStyle,
    kind: Kind,
    scene: Scene,
    scenes: Vec<PathBuf>,
    overlay: Entity<Overlay>,
    state_file: Option<PathBuf>,
    state_error: Option<String>,
    focus: FocusHandle,
}

impl Workshop {
    fn persist(&mut self) {
        if let Some(path) = &self.state_file {
            self.state_error = std::fs::write(
                path,
                format!("{}\n{}\n", self.kind.name(), self.scene.path.display()),
            )
            .err()
            .map(|e| format!("guardar selección: {e}"));
        }
    }

    fn change_widget(&mut self, step: usize, cx: &mut Context<Self>) {
        let index = Kind::ALL.iter().position(|k| *k == self.kind).unwrap_or(0);
        self.kind = Kind::ALL[(index + step) % Kind::ALL.len()];
        self.replay(cx);
        self.persist();
        cx.notify();
    }

    fn change_scene(&mut self, step: usize, cx: &mut Context<Self>) {
        let index = self
            .scenes
            .iter()
            .position(|p| *p == self.scene.path)
            .unwrap_or(0);
        self.scene
            .select(self.scenes[(index + step) % self.scenes.len()].clone());
        if self.scene.error.is_none() {
            self.replay(cx);
        }
        self.persist();
        cx.notify();
    }

    fn replay(&mut self, cx: &mut Context<Self>) {
        // Recargar crea el mismo widget limpio: no concatena dos escenas de igual época.
        self.overlay = cx.new(|cx| {
            let mut overlay = Overlay::new(self.kind, Preferences::default());
            overlay.standings_style(self.style.value.clone(), cx);
            for snapshot in &self.scene.snapshots {
                overlay.ingest(snapshot, cx);
            }
            overlay
        });
    }
}

impl Render for Workshop {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let button = |id: &'static str, label: &'static str| {
            div()
                .id(id)
                .role(gpui::Role::Button)
                .aria_label(label)
                .tab_index(0)
                .px_2()
                .py_1()
                .bg(rgb(0x334155))
                .focus_visible(|style| style.bg(rgb(0x536985)))
                .cursor_pointer()
                .child(label)
        };
        div()
            .id("workshop")
            .track_focus(&self.focus)
            .tab_group()
            .tab_stop(false)
            .on_key_down(|event, window, cx| {
                if event.keystroke.key == "tab" {
                    if event.keystroke.modifiers.shift {
                        window.focus_prev(cx);
                    } else {
                        window.focus_next(cx);
                    }
                    cx.stop_propagation();
                }
            })
            .size_full()
            .flex()
            .flex_col()
            .gap_2()
            .p_4()
            .bg(rgb(0x17202e))
            .text_color(rgb(0xffffff))
            .child(
                div()
                    .flex()
                    .gap_2()
                    .child(button("widget-prev", "◀ widget").on_click(
                        cx.listener(|this, _, _, cx| this.change_widget(Kind::ALL.len() - 1, cx)),
                    ))
                    .child(self.kind.name())
                    .child(
                        button("widget-next", "widget ▶")
                            .on_click(cx.listener(|this, _, _, cx| this.change_widget(1, cx))),
                    ),
            )
            .child(
                div()
                    .flex()
                    .gap_2()
                    .child(button("scene-prev", "◀ escena").on_click(
                        cx.listener(|this, _, _, cx| this.change_scene(this.scenes.len() - 1, cx)),
                    ))
                    .child(
                        button("scene-next", "escena ▶")
                            .on_click(cx.listener(|this, _, _, cx| this.change_scene(1, cx))),
                    ),
            )
            .child(self.scene.path.display().to_string())
            .child(
                self.scene
                    .error
                    .clone()
                    .or_else(|| self.style.error.clone())
                    .or_else(|| self.state_error.clone())
                    .unwrap_or_else(|| "Escena y standings.json en vivo · sondeo 50 ms".into()),
            )
            .child(
                div()
                    .id("preview")
                    .flex_1()
                    .overflow_scroll()
                    .child(self.overlay.clone()),
            )
    }
}

/// Abre una ventana interactiva; las capturas siguen usando su host independiente.
pub fn run(kind: Kind, path: Option<PathBuf>) -> Result<(), String> {
    let path = path.unwrap_or_else(|| {
        let sequence = Path::new(FIXTURES).join(format!("{}.sequence.json", kind.name()));
        if sequence.is_file() {
            return sequence;
        }
        let matching = Path::new(FIXTURES).join(format!("{}.snapshot.json", kind.name()));
        if matching.is_file() {
            matching
        } else {
            Path::new(FIXTURES).join("lmu47.snapshot.json")
        }
    });
    let path = std::fs::canonicalize(&path).map_err(|e| format!("{}: {e}", path.display()))?;
    let scene = Scene::new(path)?;
    let style_path = std::env::var_os("VANTARE_WORKSHOP_STYLES").map_or_else(
        || PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/styles")),
        PathBuf::from,
    );
    let style = LiveStyle::new(style_path.join("standings.json"));
    let scenes = scenes(&scene.path)?;
    let state_file = std::env::var_os("VANTARE_WORKSHOP_STATE").map(PathBuf::from);
    let failure = std::rc::Rc::new(std::cell::RefCell::new(None));
    let result = failure.clone();
    gpui_platform::application().run(move |cx: &mut App| {
        if !app::init(cx) {
            *failure.borrow_mut() = Some("no se pudieron registrar las fuentes".into());
            return;
        }
        let options = WindowOptions {
            titlebar: Some(gpui::TitlebarOptions {
                title: Some("Vantare Workshop — desarrollo".into()),
                ..Default::default()
            }),
            ..Default::default()
        };
        let opened = cx.open_window(options, |window, cx| {
            cx.new(|cx: &mut Context<Workshop>| {
                let focus = cx.focus_handle();
                focus.focus(window, cx);
                let overlay = cx.new(|cx| {
                    let mut overlay = Overlay::new(kind, Preferences::default());
                    overlay.standings_style(style.value.clone(), cx);
                    for snapshot in &scene.snapshots {
                        overlay.ingest(snapshot, cx);
                    }
                    overlay
                });
                let mut workshop = Workshop {
                    style,
                    kind,
                    scene,
                    scenes,
                    overlay,
                    state_file,
                    state_error: None,
                    focus,
                };
                workshop.persist();
                cx.spawn(async move |this, cx| {
                    loop {
                        cx.background_executor()
                            .timer(Duration::from_millis(50))
                            .await;
                        if this
                            .update(cx, |this, cx| {
                                if this.style.poll() {
                                    this.overlay.update(cx, |overlay, cx| {
                                        overlay.standings_style(this.style.value.clone(), cx);
                                    });
                                    cx.notify();
                                }
                                if this.scene.poll() {
                                    if this.scene.error.is_none() {
                                        this.replay(cx);
                                    }
                                    cx.notify();
                                }
                            })
                            .is_err()
                        {
                            break;
                        }
                    }
                })
                .detach();
                workshop
            })
        });
        if let Err(error) = opened {
            *failure.borrow_mut() = Some(format!("abrir Workshop: {error}"));
            cx.quit();
        }
        cx.on_window_closed(|cx, _| {
            if cx.windows().is_empty() {
                cx.quit();
            }
        })
        .detach();
        cx.activate(true);
    });
    match result.borrow_mut().take() {
        Some(error) => Err(error),
        None => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn style_reload_preserves_last_valid_values_and_recovers() {
        let dir = std::env::temp_dir().join(format!("vantare-style-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("directorio");
        let path = dir.join("standings.json");
        let original = include_str!("../styles/standings.json");
        std::fs::write(&path, original).expect("estilo");
        let mut file = LiveStyle::new(path.clone());
        assert!(!file.poll());
        let previous = file.value.clone();
        std::fs::write(&path, "{").expect("escritura parcial");
        file.modified = None;
        assert!(file.poll());
        assert!(file.error.is_some());
        assert_eq!(file.value, previous);
        std::fs::remove_file(&path).expect("retirar");
        assert!(file.poll());
        assert_eq!(file.value, previous);
        let mut changed = serde_json::to_value(&*previous).expect("JSON");
        changed["colors"]["panel"] = serde_json::json!("#123456");
        changed["geometry"]["row_height"] = serde_json::json!(40);
        std::fs::write(&path, changed.to_string()).expect("guardar");
        assert!(file.poll());
        assert!(file.error.is_none());
        assert_eq!(file.value.colors.panel.0, 0x123456);
        assert_eq!(file.value.geometry.row_height, 40.0);
        std::fs::remove_dir_all(dir).expect("limpiar");
    }

    #[test]
    fn scenes_accept_one_or_many_valid_dto_photos_in_order() {
        let json = include_str!("../fixtures/pedals.snapshot.json");
        let single = snapshots_from_json(json).expect("foto");
        let mut second = single[0].clone();
        second.sequence += 1;
        let sequence = format!(
            "[{json},{}]",
            vantare_ipc::snapshot_to_json(&second).expect("DTO")
        );
        let photos = snapshots_from_json(&sequence).expect("secuencia");
        assert_eq!(photos, vec![single[0].clone(), second]);
        for invalid in ["[]", "[{}]", "[null]", "{}"] {
            assert!(snapshots_from_json(invalid).is_err());
        }
        assert!(snapshots_from_json(&format!("[{json},{{}}]")).is_err());
    }

    #[test]
    fn reload_keeps_last_valid_snapshot_and_recovers_after_invalid_or_missing_json() {
        let dir =
            std::env::temp_dir().join(format!("vantare-workshop-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("directorio temporal");
        let path = dir.join("scene.snapshot.json");
        let valid = include_str!("../fixtures/pedals.snapshot.json");
        std::fs::write(&path, valid).expect("escena");
        let mut scene = Scene::new(path.clone()).expect("cargar");
        let previous = scene.snapshots.clone();
        assert!(!scene.poll());
        std::fs::write(&path, "{").expect("JSON inválido");
        // Fuerza mtime anterior sin sleeps: el test no depende de la resolución del FS.
        scene.modified = None;
        assert!(scene.poll());
        assert!(scene.error.is_some());
        assert_eq!(scene.snapshots, previous);
        std::fs::remove_file(&path).expect("borrar escena");
        assert!(scene.poll());
        assert!(scene.error.is_some());
        std::fs::write(&path, valid).expect("restaurar");
        assert!(scene.poll());
        assert!(scene.error.is_none());
        assert_eq!(scene.snapshots, previous);
        scene.select(Path::new(FIXTURES).join("radar.snapshot.json"));
        assert_ne!(scene.snapshots, previous);
        assert!(scene.error.is_none());
        scene.select(path.with_file_name("missing.json"));
        assert!(scene.error.is_some());
        std::fs::remove_dir_all(dir).expect("limpiar");
    }
}
