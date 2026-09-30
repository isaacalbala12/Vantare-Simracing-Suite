//! Catálogo y reproducción local, incrustando el renderer productivo de ui.
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime};

use gpui::{
    Context, Entity, IntoElement, Render, RenderImage, Window, div, img, prelude::*, px, rgb,
};
use serde::{Deserialize, Serialize};
use vantare_domain::format::Preferences;
use vantare_ui::{Kind, Overlay};

use crate::{
    comparison::{self, Comparison},
    files,
    scene::{self, Scene},
    shell::button,
};

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Selection {
    version: u32,
    widget: String,
    scene: PathBuf,
    frame: usize,
    looping: bool,
    #[serde(default, skip_serializing)]
    #[serde(rename = "imperial")]
    _imperial: bool,
    #[serde(default, skip_serializing)]
    #[serde(rename = "english")]
    _english: bool,
    #[serde(default)]
    comparison: Mode,
    #[serde(default)]
    background: usize,
}

#[derive(Clone, Copy, Default, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
enum Mode {
    #[default]
    SideBySide,
    Overlaid,
    Hidden,
}

pub struct Workshop {
    pub scene: Scene,
    kind: Kind,
    scenes: Vec<PathBuf>,
    chosen_scene: usize,
    overlay: Entity<Overlay>,
    reference: Result<Arc<RenderImage>, String>,
    comparison: Option<Comparison>,
    mode: Mode,
    capturing: bool,
    capture_process: Arc<comparison::CaptureProcess>,
    revision: u64,
    rendered_photo: (u64, u64),
    prefs: Preferences,
    state_path: PathBuf,
    saved: Option<Vec<u8>>,
    pub status: String,
    stamp: Option<(SystemTime, u64)>,
    next_poll: Instant,
    next_frame: Instant,
    background: usize,
}

fn stamp(path: &Path) -> Option<(SystemTime, u64)> {
    let meta = std::fs::metadata(path).ok()?;
    Some((meta.modified().ok()?, meta.len()))
}

fn restarts_renderer(previous: (u64, u64), next: (u64, u64)) -> bool {
    previous.0 != next.0 || next.1 < previous.1
}

pub struct Prepared {
    scene: Scene,
    kind: Kind,
    scenes: Vec<PathBuf>,
    chosen_scene: usize,
    prefs: Preferences,
    state_path: PathBuf,
    saved: Option<Vec<u8>>,
    mode: Mode,
    background: usize,
}

impl Prepared {
    pub fn load(data_dir: &Path, initial: Option<PathBuf>) -> Result<Self, String> {
        let state_path = data_dir.join("workshop-selection.json");
        let saved = match std::fs::metadata(&state_path) {
            Ok(_) => Some(files::read(&state_path, files::MAX_DOCUMENT)?),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
            Err(e) => return Err(format!("inspeccionar selección: {e}")),
        };
        let selection: Option<Selection> = saved
            .as_deref()
            .map(serde_json::from_slice)
            .transpose()
            .map_err(|e| format!("selección inválida: {e}"))?;
        if selection.as_ref().is_some_and(|s| s.version != 1) {
            return Err("versión de selección no admitida".into());
        }
        let kind = selection
            .as_ref()
            .map_or(Ok(Kind::Standings), |s| s.widget.parse())
            .map_err(|()| "widget guardado no existe en el registro".to_owned())?;
        let explicit_scene = initial.is_some();
        let path = initial
            .or_else(|| selection.as_ref().map(|s| s.scene.clone()))
            .unwrap_or_else(|| Path::new(scene::FIXTURES).join("lmu47.snapshot.json"));
        let mut scene = Scene::open(path)?;
        if let Some(selection) = &selection {
            if !explicit_scene {
                scene.seek(selection.frame)?;
            }
            scene.looping = selection.looping;
        }
        let scenes = scene::catalog(Path::new(scene::FIXTURES), &scene.path)?;
        let chosen_scene = scenes
            .iter()
            .position(|p| *p == scene.path)
            .ok_or("escena no está en catálogo")?;
        Ok(Self {
            scene,
            kind,
            scenes,
            chosen_scene,
            prefs: Preferences::default(),
            state_path,
            saved,
            mode: selection.as_ref().map_or(Mode::default(), |s| s.comparison),
            background: selection.as_ref().map_or(0, |s| s.background % 3),
        })
    }
}

impl Workshop {
    pub fn preferences(&self) -> Preferences {
        self.prefs
    }

    pub fn set_preferences(&mut self, prefs: Preferences, cx: &mut Context<Self>) {
        if self.prefs != prefs {
            self.prefs = prefs;
            self.rebuild(cx);
        }
    }
    pub fn new(prepared: Prepared, cx: &mut Context<Self>) -> Self {
        let Prepared {
            scene,
            kind,
            scenes,
            chosen_scene,
            prefs,
            state_path,
            saved,
            mode,
            background,
        } = prepared;
        let overlay = cx.new(|cx| {
            let mut overlay = Overlay::new(kind, prefs);
            overlay.ingest(scene.snapshot(), cx);
            overlay
        });
        let stamp = stamp(&scene.path);
        let rendered_photo = (scene.snapshot().epoch, scene.snapshot().sequence);
        Self {
            scene,
            kind,
            scenes,
            chosen_scene,
            overlay,
            reference: comparison::load_png(&comparison::reference(kind)),
            comparison: None,
            mode,
            capturing: false,
            capture_process: Arc::new(comparison::CaptureProcess::default()),
            revision: 0,
            rendered_photo,
            prefs,
            state_path,
            saved,
            status: "Sin cambios guardados en esta sesión".into(),
            stamp,
            next_poll: Instant::now(),
            next_frame: Instant::now(),
            background,
        }
    }

    pub fn persist(&mut self) -> Result<(), String> {
        let selection = Selection {
            version: 1,
            widget: self.kind.name().into(),
            scene: self.scene.path.clone(),
            frame: self.scene.index(),
            looping: self.scene.looping,
            _imperial: false,
            _english: false,
            comparison: self.mode,
            background: self.background,
        };
        let data = serde_json::to_vec_pretty(&selection).map_err(|e| e.to_string())?;
        if self.saved.as_deref() != Some(data.as_slice()) {
            files::save(&self.state_path, &data, self.saved.as_deref())?;
        }
        self.saved = Some(data);
        self.status = "Selección guardada".into();
        Ok(())
    }

    fn rebuild(&mut self, cx: &mut Context<Self>) {
        self.rendered_photo = (self.scene.snapshot().epoch, self.scene.snapshot().sequence);
        self.overlay = cx.new(|cx| {
            let mut overlay = Overlay::new(self.kind, self.prefs);
            overlay.ingest(self.scene.snapshot(), cx);
            overlay
        });
        self.reference = comparison::load_png(&comparison::reference(self.kind));
        self.invalidate();
        cx.notify();
    }

    fn ingest(&mut self, cx: &mut Context<Self>) {
        let photo = (self.scene.snapshot().epoch, self.scene.snapshot().sequence);
        if restarts_renderer(self.rendered_photo, photo) {
            self.rebuild(cx);
            return;
        }
        self.rendered_photo = photo;
        self.invalidate();
        self.overlay
            .update(cx, |overlay, cx| overlay.ingest(self.scene.snapshot(), cx));
        cx.notify();
    }

    fn invalidate(&mut self) {
        self.revision = self.revision.wrapping_add(1);
        if self.comparison.take().is_some() {
            self.status = "La foto o el formato cambió; recalcular comparación".into();
        }
    }

    fn capture(&mut self, cx: &mut Context<Self>) {
        if self.capturing {
            return;
        }
        self.scene.playing = false;
        self.capturing = true;
        self.comparison = None;
        self.status =
            "Capturando esta foto en ES/métrico, DPI 100 %; puede tardar hasta 30 s".into();
        let (kind, snapshot, revision) = (self.kind, self.scene.snapshot().clone(), self.revision);
        let process = self.capture_process.clone();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move {
                comparison::capture(kind, &snapshot, &process)
            }).await;
            // El usuario puede cambiar escena o widget mientras se captura;
            // un resultado antiguo nunca se atribuye al fotograma nuevo.
            let _ = this.update(cx, |this, cx| {
                this.capturing = false;
                if revision == this.revision {
                    match result {
                        Ok(comparison) => {
                            this.status = format!("Diferencia: {:.4} % · captura ES/métrico de esta foto · umbral 8 RGBA premultiplicado, sin máscaras", comparison.percent);
                            this.comparison = Some(comparison);
                        }
                        Err(error) => this.status = error,
                    }
                } else {
                    this.status = "Captura descartada: la selección cambió".into();
                }
                cx.notify();
            });
        }).detach();
        cx.notify();
    }

    fn widget(&mut self, forward: bool, cx: &mut Context<Self>) {
        let index = Kind::ALL
            .iter()
            .position(|kind| *kind == self.kind)
            .unwrap_or(0);
        let step = if forward { 1 } else { Kind::ALL.len() - 1 };
        self.kind = Kind::ALL[(index + step) % Kind::ALL.len()];
        self.rebuild(cx);
        if let Err(error) = self.persist() {
            self.status = error;
        }
    }

    fn choose_scene(&mut self, forward: bool, cx: &mut Context<Self>) {
        let step = if forward { 1 } else { self.scenes.len() - 1 };
        let chosen = (self.chosen_scene + step) % self.scenes.len();
        self.select_scene(chosen, cx);
    }

    fn select_scene(&mut self, chosen: usize, cx: &mut Context<Self>) {
        if self.scene.replace(self.scenes[chosen].clone()) {
            self.chosen_scene = chosen;
            self.stamp = stamp(&self.scene.path);
            self.rebuild(cx);
            if let Err(error) = self.persist() {
                self.status = error;
            }
        }
        cx.notify();
    }

    pub fn tick(&mut self, now: Instant, cx: &mut Context<Self>) -> Duration {
        if now >= self.next_poll {
            self.next_poll = now + Duration::from_millis(150);
            let modified = stamp(&self.scene.path);
            if modified != self.stamp {
                if self.scene.replace(self.scene.path.clone()) {
                    self.stamp = modified;
                    self.rebuild(cx);
                } else {
                    cx.notify();
                }
            }
        }
        if self.scene.playing && now >= self.next_frame {
            self.scene.advance();
            self.next_frame = now + self.scene.delay();
            self.ingest(cx);
        }
        if self.scene.playing {
            self.next_frame
                .saturating_duration_since(now)
                .min(Duration::from_millis(150))
                .max(Duration::from_millis(1))
        } else {
            Duration::from_millis(150)
        }
    }

    fn toolbar(&self, cx: &mut Context<Self>) -> gpui::Div {
        div()
            .flex()
            .flex_wrap()
            .gap_2()
            .child(
                button("widget-prev", "◀ widget")
                    .on_click(cx.listener(|this, _, _, cx| this.widget(false, cx))),
            )
            .child(self.kind.name())
            .child(
                button("widget-next", "widget ▶")
                    .on_click(cx.listener(|this, _, _, cx| this.widget(true, cx))),
            )
            .child(
                button("scene-prev", "◀ escena")
                    .on_click(cx.listener(|this, _, _, cx| this.choose_scene(false, cx))),
            )
            .child(
                button("scene-next", "escena ▶")
                    .on_click(cx.listener(|this, _, _, cx| this.choose_scene(true, cx))),
            )
            .child(
                button("reload-scene", "Recargar JSON").on_click(cx.listener(|this, _, _, cx| {
                    if this.scene.replace(this.scene.path.clone()) {
                        this.rebuild(cx);
                    } else {
                        cx.notify();
                    }
                })),
            )
            .child(
                button("save-workshop", "Guardar selección").on_click(cx.listener(
                    |this, _, _, cx| {
                        if let Err(error) = this.persist() {
                            this.status = error;
                        }
                        cx.notify();
                    },
                )),
            )
    }
}

impl Drop for Workshop {
    fn drop(&mut self) {
        self.capture_process.cancel();
    }
}

impl Workshop {
    fn catalog(&self, cx: &mut Context<Self>) -> gpui::Stateful<gpui::Div> {
        let mut catalog = div()
            .id("workshop-catalog")
            .w(px(200.0))
            .flex_shrink_0()
            .h_full()
            .overflow_scroll()
            .flex()
            .flex_col()
            .gap_1()
            .child("Widgets registrados");
        for &kind in Kind::ALL {
            catalog = catalog.child(
                button(kind.name(), kind.name())
                    .when(kind == self.kind, |button| button.bg(rgb(0x0034_3438)))
                    .on_click(cx.listener(move |this, _, _, cx| {
                        this.kind = kind;
                        this.rebuild(cx);
                        if let Err(error) = this.persist() {
                            this.status = error;
                        }
                    })),
            );
        }
        catalog = catalog.child("Escenas (.snapshot.json / .sequence.json / .jsonl)");
        for (index, path) in self.scenes.iter().enumerate() {
            let label = path.file_name().map_or_else(
                || path.display().to_string(),
                |name| name.to_string_lossy().into_owned(),
            );
            catalog = catalog.child(
                div()
                    .id(index)
                    .role(gpui::Role::Button)
                    .aria_label(label.clone())
                    .tab_index(0)
                    .cursor_pointer()
                    .p_1()
                    .when(index == self.chosen_scene, |item| item.bg(rgb(0x0034_3438)))
                    .child(label)
                    .on_click(cx.listener(move |this, _, _, cx| this.select_scene(index, cx))),
            );
        }
        catalog
    }

    #[allow(clippy::cast_precision_loss)] // PNG acotado a 16 Mpx; tamaño visual f32 de GPUI.
    fn preview(&self, cx: &Context<Self>) -> gpui::Div {
        let mut preview = div().flex().gap_4();
        let reference = match &self.reference {
            Ok(image) => self
                .comparison
                .as_ref()
                .map_or_else(|| image.clone(), |c| c.reference.clone()),
            Err(error) => {
                return preview
                    .child(self.overlay.clone())
                    .child(format!("Referencia pendiente: {error}"));
            }
        };
        let mut candidate = div().relative().flex_shrink_0();
        let (width, height) = self.overlay.read(cx).wanted_size();
        // Se muestra el renderer actual hasta disponer de captura. Una captura
        // se etiqueta ES/métrico y usa los mismos PNG que entran en el diff.
        if let Some(comparison) = &self.comparison {
            let size = comparison.candidate.size(0);
            candidate = candidate
                .w(px(size.width.0 as f32))
                .h(px(size.height.0 as f32))
                .child(img(comparison.candidate.clone()).size_full());
        } else {
            candidate = candidate
                .w(px(width))
                .h(px(height))
                .child(self.overlay.clone());
        }
        match self.mode {
            Mode::Hidden => preview.child(candidate),
            Mode::SideBySide => {
                let size = reference.size(0);
                preview = preview.child(candidate).child(
                    img(reference)
                        .flex_shrink_0()
                        .w(px(size.width.0 as f32))
                        .h(px(size.height.0 as f32)),
                );
                preview
            }
            Mode::Overlaid => {
                let size = reference.size(0);
                preview.child(
                    candidate.child(
                        div().absolute().top_0().left_0().opacity(0.5).child(
                            img(reference)
                                .w(px(size.width.0 as f32))
                                .h(px(size.height.0 as f32)),
                        ),
                    ),
                )
            }
        }
    }
}

impl Render for Workshop {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let backgrounds = [0x0010_1113, 0x0034_3438, 0x00ff_ffff];
        div().flex().gap_2().size_full()
            .child(self.catalog(cx))
            .child(div().flex().flex_col().gap_2().flex_1().min_w_0()
            .child(self.toolbar(cx))
            .child(self.scene.path.display().to_string())
            .child("Escena local: lmu47 procede del corpus; las demás son fixtures de paridad. La referencia PNG está congelada, no sigue la reproducción.")
            .child(self.scene.error.clone().unwrap_or_else(|| self.status.clone()))
            .child(div().flex().flex_wrap().gap_2()
                .child(button("rewind", "Inicio escena").on_click(cx.listener(|this, _, _, cx| { this.scene.rewind(); this.ingest(cx); })))
                .child(button("step-prev", "◀ foto").on_click(cx.listener(|this, _, _, cx| { this.scene.step(false); this.ingest(cx); })))
                .child(button("play", if self.scene.playing { "Pausa" } else { "Play" }).on_click(cx.listener(|this, _, _, cx| {
                    this.scene.play(); this.next_frame = Instant::now() + this.scene.delay(); this.ingest(cx);
                })))
                .child(button("step-next", "foto ▶").on_click(cx.listener(|this, _, _, cx| { this.scene.step(true); this.ingest(cx); })))
                .child(button("loop", if self.scene.looping { "Loop: sí" } else { "Loop: no" }).on_click(cx.listener(|this, _, _, cx| {
                    this.scene.looping = !this.scene.looping; cx.notify();
                })))
                .child(format!("Foto {} / {} · revisión {}", self.scene.index() + 1, self.scene.len(), self.scene.snapshot().sequence)))
            .child(div().flex().flex_wrap().gap_2()
                .child(button("background", "Fondo escenario").on_click(cx.listener(|this, _, _, cx| { this.background = (this.background + 1) % 3; cx.notify(); })))
                .child(button("reference", match self.mode { Mode::SideBySide => "Comparación: lado a lado", Mode::Overlaid => "Comparación: superpuesta 50 %", Mode::Hidden => "Comparación: oculta" })
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.mode = match this.mode { Mode::SideBySide => Mode::Overlaid, Mode::Overlaid => Mode::Hidden, Mode::Hidden => Mode::SideBySide }; cx.notify();
                    })))
                .child(button("capture-diff", if self.capturing { "Capturando…" } else { "Capturar y calcular % (ES/métrico)" })
                    .on_click(cx.listener(|this, _, _, cx| this.capture(cx)))))
            .child(format!("Vista actual: {:?} / {:?} · comparar captura abre una ventana temporal; requiere vantare-workshop con parity-capture y DPI 100 %", self.prefs.language, self.prefs.units))
            .when_some(self.comparison.as_ref(), |content, comparison| content.child(format!("{:.4} % de píxeles distintos · ES/métrico · umbral 8 RGBA premultiplicado · sin fondo del escenario", comparison.percent)))
            .child(div().id("workshop-preview").flex_1().overflow_scroll().bg(rgb(backgrounds[self.background]))
                .child(self.preview(cx))))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn a_replayed_loop_restarts_productive_record_history() {
        use vantare_domain::fastest_lap::{self, Records, Update};
        let snapshot = Scene::open(Path::new(scene::FIXTURES).join("fastest-lap.snapshot.json"))
            .expect("fixture");
        let first = fastest_lap::project(snapshot.snapshot(), Preferences::default());
        let mut improved = first.clone();
        improved.sequence += 1;
        let best = improved.candidate.as_mut().expect("récord de clase");
        best.best_ms = Some(best.best_ms.expect("vuelta disponible") - 1000);
        let cursor = |vm: &fastest_lap::ViewModel| (vm.scope.0, vm.sequence);
        let mut records = Records::default();
        assert_eq!(records.accept(first.clone()), Update::Clear);
        assert!(matches!(
            records.accept(improved.clone()),
            Update::Notice(_, _)
        ));
        // Mismo contrato de reinicio que aplica el Hub al reconstruir Overlay.
        if restarts_renderer(cursor(&improved), cursor(&first)) {
            records = Records::default();
        }
        assert_eq!(records.accept(first.clone()), Update::Clear);
        assert!(matches!(
            records.accept(improved.clone()),
            Update::Notice(_, _)
        ));
        assert!(!restarts_renderer(cursor(&first), cursor(&improved)));
        assert!(restarts_renderer(
            cursor(&first),
            (first.scope.0 + 1, first.sequence)
        ));
    }
    #[test]
    fn selection_roundtrip_preserves_scene_frame_loop_background_and_comparison() {
        let dir =
            std::env::temp_dir().join(format!("vantare-workshop-selection-{}", std::process::id()));
        std::fs::create_dir(&dir).expect("directorio propio");
        let original =
            Scene::open(Path::new(scene::FIXTURES).join("lmu47.snapshot.json")).expect("fixture");
        let first = vantare_ipc::snapshot_to_json(original.snapshot()).expect("DTO");
        let mut second = original.snapshot().clone();
        second.sequence += 1;
        second.origin.received_at += Duration::from_millis(40);
        let scene = dir.join("test.sequence.json");
        std::fs::write(
            &scene,
            format!(
                "[{first},{}]",
                vantare_ipc::snapshot_to_json(&second).expect("DTO")
            ),
        )
        .expect("escena de test");
        let selection = Selection {
            version: 1,
            widget: Kind::Pedals.name().into(),
            scene: scene.clone(),
            frame: 1,
            looping: true,
            _imperial: true,
            _english: true,
            comparison: Mode::Overlaid,
            background: 2,
        };
        let bytes = serde_json::to_vec(&selection).expect("serializar");
        let path = dir.join("workshop-selection.json");
        files::save(&path, &bytes, None).expect("guardar selección");
        let loaded = Prepared::load(&dir, None).expect("reiniciar");
        assert_eq!(loaded.kind, Kind::Pedals);
        assert_eq!(loaded.scene.path, scene);
        assert_eq!(loaded.scene.index(), 1);
        assert_eq!(loaded.scene.snapshot(), &second);
        assert!(loaded.scene.looping);
        assert!(matches!(loaded.mode, Mode::Overlaid));
        assert_eq!(loaded.background, 2);
        // La selección deja de ser una segunda fuente de preferencias.
        let json: serde_json::Value = serde_json::from_slice(&bytes).expect("JSON");
        assert!(json.get("imperial").is_none());
        assert!(json.get("english").is_none());
        let mut invalid = json;
        invalid["frame"] = 2.into();
        files::save(
            &path,
            &serde_json::to_vec(&invalid).expect("JSON"),
            Some(&bytes),
        )
        .expect("cursor externo");
        assert!(Prepared::load(&dir, None).is_err());
        assert!(
            Prepared::load(&dir, Some(scene.clone())).is_ok(),
            "escena explícita ignora el cursor viejo"
        );
        std::fs::remove_file(path).expect("limpiar");
        std::fs::remove_file(scene).expect("limpiar escena propia");
        std::fs::remove_dir(dir).expect("limpiar");
    }
}
