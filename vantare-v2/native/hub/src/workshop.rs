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
    orbit::{self, button},
    scene::{self, Scene},
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
        orbit::card("Selección de trabajo").child(
            orbit::card_body()
                .child(orbit::setting_row(
                    "Widget",
                    "Renderer productivo",
                    div()
                        .flex()
                        .items_center()
                        .gap(px(orbit::RADIUS_CONTROL))
                        .child(
                            button("widget-prev", "◀")
                                .aria_label("Widget anterior")
                                .on_click(cx.listener(|this, _, _, cx| this.widget(false, cx))),
                        )
                        .child(orbit::text(self.kind.name(), 13.5, 600, orbit::INK))
                        .child(
                            button("widget-next", "▶")
                                .aria_label("Widget siguiente")
                                .on_click(cx.listener(|this, _, _, cx| this.widget(true, cx))),
                        ),
                ))
                .child(orbit::setting_row(
                    "Escena",
                    "JSON local · catálogo",
                    div()
                        .flex()
                        .gap(px(orbit::RADIUS_CONTROL))
                        .child(
                            button("scene-prev", "◀ escena").on_click(
                                cx.listener(|this, _, _, cx| this.choose_scene(false, cx)),
                            ),
                        )
                        .child(
                            button("scene-next", "escena ▶").on_click(
                                cx.listener(|this, _, _, cx| this.choose_scene(true, cx)),
                            ),
                        ),
                ))
                .child(orbit::setting_row(
                    "Archivo local",
                    "Recarga el JSON de la escena",
                    button("reload-scene", "Recargar JSON").on_click(cx.listener(
                        |this, _, _, cx| {
                            if this.scene.replace(this.scene.path.clone()) {
                                this.rebuild(cx);
                            } else {
                                cx.notify();
                            }
                        },
                    )),
                ))
                .child(orbit::setting_row(
                    "Continuidad",
                    "Conserva la selección actual",
                    button("save-workshop", "Guardar selección").on_click(cx.listener(
                        |this, _, _, cx| {
                            if let Err(error) = this.persist() {
                                this.status = error;
                            }
                            cx.notify();
                        },
                    )),
                ))
                .child(orbit::text(
                    self.scene.path.display().to_string(),
                    12.0,
                    400,
                    orbit::INK_3,
                )),
        )
    }

    fn playback(&self, cx: &mut Context<Self>) -> gpui::Div {
        orbit::card("Reproducción y comparación").child(
            orbit::card_body()
                .child(orbit::setting_row(
                    "Fotograma",
                    &format!(
                        "Foto {} / {} · revisión {}",
                        self.scene.index() + 1,
                        self.scene.len(),
                        self.scene.snapshot().sequence
                    ),
                    div()
                        .flex()
                        .flex_wrap()
                        .gap(px(orbit::RADIUS_CONTROL))
                        .child(button("rewind", "Inicio").on_click(cx.listener(
                            |this, _, _, cx| {
                                this.scene.rewind();
                                this.ingest(cx);
                            },
                        )))
                        .child(button("step-prev", "◀ foto").on_click(cx.listener(
                            |this, _, _, cx| {
                                this.scene.step(false);
                                this.ingest(cx);
                            },
                        )))
                        .child(
                            button("play", if self.scene.playing { "Pausa" } else { "Play" })
                                .on_click(cx.listener(|this, _, _, cx| {
                                    this.scene.play();
                                    this.next_frame = Instant::now() + this.scene.delay();
                                    this.ingest(cx);
                                })),
                        )
                        .child(button("step-next", "foto ▶").on_click(cx.listener(
                            |this, _, _, cx| {
                                this.scene.step(true);
                                this.ingest(cx);
                            },
                        ))),
                ))
                .child(orbit::setting_row(
                    "Repetir escena",
                    "Vuelve al inicio al terminar la secuencia",
                    orbit::toggle("loop", "Repetir escena", self.scene.looping, true).on_click(
                        cx.listener(|this, _, _, cx| {
                            this.scene.looping = !this.scene.looping;
                            cx.notify();
                        }),
                    ),
                ))
                .child(orbit::setting_row(
                    "Fondo del escenario",
                    "El fondo no entra en la captura",
                    orbit::select(
                        "background",
                        ["Canvas", "Superficie", "Claro"][self.background],
                    )
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.background = (this.background + 1) % 3;
                        cx.notify();
                    })),
                ))
                .child(orbit::setting_row(
                    "Referencia congelada",
                    "PNG fijo durante el replay",
                    orbit::select(
                        "reference",
                        match self.mode {
                            Mode::SideBySide => "Lado a lado",
                            Mode::Overlaid => "Superpuesta 50 %",
                            Mode::Hidden => "Oculta",
                        },
                    )
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.mode = match this.mode {
                            Mode::SideBySide => Mode::Overlaid,
                            Mode::Overlaid => Mode::Hidden,
                            Mode::Hidden => Mode::SideBySide,
                        };
                        cx.notify();
                    })),
                ))
                .child(orbit::setting_row(
                    "Paridad de píxeles",
                    "ES/métrico · DPI 100 %",
                    button(
                        "capture-diff",
                        if self.capturing {
                            "Capturando…"
                        } else {
                            "Capturar y calcular %"
                        },
                    )
                    .on_click(cx.listener(|this, _, _, cx| this.capture(cx))),
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
        let mut catalog = orbit::card("Catálogo local")
            .id("workshop-catalog")
            .w(px(orbit::COLUMN_W))
            .flex_shrink_0()
            .h(px(orbit::COLUMN_W))
            .overflow_y_scroll();
        let mut widgets = orbit::card_body()
            .flex_shrink_0()
            .child(orbit::eyebrow("Widgets registrados"));
        for &kind in Kind::ALL {
            widgets = widgets.child(
                button(kind.name(), kind.name())
                    .justify_start()
                    .when(kind == self.kind, |button| {
                        button.border_color(rgb(orbit::CARMINE))
                    })
                    .on_click(cx.listener(move |this, _, _, cx| {
                        this.kind = kind;
                        this.rebuild(cx);
                        if let Err(error) = this.persist() {
                            this.status = error;
                        }
                    })),
            );
        }
        catalog = catalog.child(widgets);
        let mut scenes = orbit::card_body()
            .flex_shrink_0()
            .child(orbit::eyebrow("Escenas locales"));
        for (index, path) in self.scenes.iter().enumerate() {
            let label = path.file_name().map_or_else(
                || path.display().to_string(),
                |name| name.to_string_lossy().into_owned(),
            );
            scenes = scenes.child(
                button("scene", &label)
                    .id(("scene", index))
                    .justify_start()
                    .when(index == self.chosen_scene, |item| {
                        item.border_color(rgb(orbit::CARMINE))
                    })
                    .on_click(cx.listener(move |this, _, _, cx| this.select_scene(index, cx))),
            );
        }
        catalog = catalog.child(scenes);
        catalog
    }

    #[allow(clippy::cast_precision_loss)] // PNG acotado a 16 Mpx; tamaño visual f32 de GPUI.
    fn preview(&self, cx: &Context<Self>) -> gpui::Div {
        let mut preview = div().flex().gap(px(orbit::GUTTER));
        let reference = match &self.reference {
            Ok(image) => self
                .comparison
                .as_ref()
                .map_or_else(|| image.clone(), |c| c.reference.clone()),
            Err(error) => {
                return preview
                    .child(self.overlay.clone())
                    .child(orbit::callout(format!("Referencia pendiente: {error}")));
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
        let backgrounds = [orbit::CANVAS, orbit::SURFACE_3, orbit::INK];
        div().flex().flex_col().gap(px(orbit::RADIUS))
            .child(div().flex().flex_wrap().items_start().gap(px(orbit::RADIUS))
                .child(self.toolbar(cx).flex_1().min_w(px(orbit::COLUMN_W + orbit::GUTTER)))
                .child(self.playback(cx).flex_1().min_w(px(orbit::COLUMN_W + orbit::GUTTER))))
            .child(orbit::callout(self.scene.error.clone().unwrap_or_else(|| self.status.clone())))
            .child(div().flex().flex_wrap().items_start().gap(px(orbit::RADIUS))
                .child(self.catalog(cx))
                .child(orbit::card("Vista previa · renderer productivo").flex_1().min_w(px(orbit::COLUMN_W + orbit::GUTTER))
                    .child(orbit::card_body()
                        .child(orbit::text(format!("Vista actual: {:?} / {:?}", self.prefs.language, self.prefs.units), 12.0, 400, orbit::INK_3))
                        .when_some(self.comparison.as_ref(), |content, comparison| content.child(orbit::text(format!("{:.4} % de píxeles distintos · ES/métrico · umbral 8 RGBA premultiplicado", comparison.percent), 12.0, 400, orbit::INK_2))))
                    .child(div().id("workshop-preview").h(px(orbit::COLUMN_W)).overflow_scroll().bg(rgb(backgrounds[self.background])).child(self.preview(cx)))))
            .child(orbit::callout("Escena local: lmu47 procede del corpus; las demás son fixtures de paridad. La referencia PNG está congelada. Comparar abre una ventana temporal de vantare-workshop con parity-capture; el fondo no forma parte del widget."))
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
