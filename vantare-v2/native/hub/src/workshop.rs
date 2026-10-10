//! Catálogo y reproducción local, incrustando el renderer productivo de ui.
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime};

use gpui::{
    Context, Entity, IntoElement, Render, RenderImage, Window, div, img, prelude::*, px, rgb, rgba,
};
use serde::{Deserialize, Serialize};
use vantare_domain::format::{Language, Preferences};
use vantare_ui::{
    Kind, Overlay, Settings as WidgetSettings,
    standings::{model::PIT_RAIL_WIDTH, options::ColumnSetting},
};

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

#[derive(Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
enum Mode {
    SideBySide,
    Overlaid,
    #[default]
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
    controls: Vec<Entity<orbit::Choice>>,
    scroll: gpui::ScrollHandle,
    tools_open: bool,
}

fn stamp(path: &Path) -> Option<(SystemTime, u64)> {
    let meta = std::fs::metadata(path).ok()?;
    Some((meta.modified().ok()?, meta.len()))
}

fn restarts_renderer(previous: (u64, u64), next: (u64, u64)) -> bool {
    previous.0 != next.0 || next.1 < previous.1
}

fn workshop_overlay(kind: Kind, prefs: Preferences) -> Overlay {
    let mut settings = WidgetSettings::default_for(kind);
    if let WidgetSettings::Standings(standings) = &mut settings {
        let column = |id: &str, metric_id: &str, width_preset: &str| ColumnSetting {
            id: id.into(),
            metric_id: metric_id.into(),
            width_preset: width_preset.into(),
            ..ColumnSetting::default()
        };
        // El golden Wails muestra siete filas y esta misma selección de columnas.
        standings.row_count = 7;
        standings.class_scope = "all-classes".into();
        standings.classification_mode = "normal".into();
        standings.columns = Some(vec![
            column("position", "position", "sm"),
            column("driverName", "driverName", "lg"),
            column("gap", "gap", "md"),
            column("lastLap", "lastLap", "lg"),
            column("pit", "pit", "auto"),
        ]);
    }
    Overlay::configured(&settings, prefs)
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
        // Una selección obsoleta o dañada nunca impide abrir el Hub.
        let selection: Option<Selection> = saved
            .as_deref()
            .and_then(|bytes| serde_json::from_slice(bytes).ok())
            .filter(|s: &Selection| s.version == 1 && s.widget.parse::<Kind>().is_ok());
        let kind = selection
            .as_ref()
            .and_then(|s| s.widget.parse().ok())
            .unwrap_or(Kind::Standings);
        let fixtures = scene::fixtures_root();
        let default_scene = || {
            let root = fixtures
                .as_ref()
                .ok_or("no hay catálogo de escenas instalado; use --escena")?;
            Scene::open(root.join("standings.snapshot.json"))
        };
        let mut scene = if let Some(explicit) = initial {
            // La escena explícita conserva sus errores y no usa el cursor guardado.
            Scene::open(explicit)?
        } else {
            selection
                .as_ref()
                .and_then(|s| {
                    if !scene::confined_to(&s.scene, data_dir)
                        && !fixtures
                            .as_deref()
                            .is_some_and(|root| scene::confined_to(&s.scene, root))
                    {
                        return None;
                    }
                    let mut scene = Scene::open(s.scene.clone()).ok()?;
                    scene.seek(s.frame).ok()?;
                    Some(scene)
                })
                .map_or_else(default_scene, Ok)?
        };
        if let Some(selection) = &selection {
            scene.looping = selection.looping;
        }
        let scenes = match &fixtures {
            Some(root) => scene::catalog(root, &scene.path)?,
            // Sin catalogo, `catalog` devuelve solo la escena abierta.
            None => scene::catalog(Path::new(""), &scene.path)?,
        };
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
    pub fn scroll_to_detail(&self) {
        self.scroll.scroll_to_bottom();
    }

    fn sync_controls(&self, cx: &mut Context<Self>) {
        for (index, selected) in [
            (0, usize::from(self.prefs.language == Language::En)),
            (
                1,
                Kind::ALL
                    .iter()
                    .position(|kind| *kind == self.kind)
                    .unwrap_or(0),
            ),
            (
                3,
                match self.mode {
                    Mode::Hidden => 0,
                    Mode::SideBySide => 1,
                    Mode::Overlaid => 2,
                },
            ),
        ] {
            self.controls[index].update(cx, |choice, cx| {
                if choice.state.selected != Some(selected) {
                    choice.state.selected = Some(selected);
                    cx.notify();
                }
            });
        }
    }

    fn prepare_controls(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if !self.controls.is_empty() {
            self.sync_controls(cx);
            return;
        }
        let widgets = Kind::ALL
            .iter()
            .map(|kind| orbit::OptionItem::new(widget_label(*kind)))
            .collect();
        let widget = Kind::ALL
            .iter()
            .position(|kind| *kind == self.kind)
            .unwrap_or(0);
        for (index, (label, options, selected)) in [
            (
                "Idioma",
                vec![
                    orbit::OptionItem::new("Español"),
                    orbit::OptionItem::new("English"),
                ],
                usize::from(self.prefs.language == Language::En),
            ),
            ("Widget", widgets, widget),
            (
                "Sistema de diseño",
                vec![orbit::OptionItem::new("Eficiencia")],
                0,
            ),
            (
                "Comparar con",
                vec![
                    orbit::OptionItem::new("Sin comparar"),
                    orbit::OptionItem::new("Referencia · lado a lado"),
                    orbit::OptionItem::new("Referencia · superpuesta"),
                ],
                match self.mode {
                    Mode::Hidden => 0,
                    Mode::SideBySide => 1,
                    Mode::Overlaid => 2,
                },
            ),
        ]
        .into_iter()
        .enumerate()
        {
            let choice = cx.new(|cx| {
                orbit::Choice::new(
                    label,
                    orbit::ChoiceKind::Dropdown,
                    options,
                    Some(selected),
                    window,
                    cx,
                )
            });
            cx.subscribe(
                &choice,
                move |this, _, event: &orbit::ChoiceChanged, cx| match index {
                    0 => {
                        this.prefs.language = if event.0 == 0 {
                            Language::Es
                        } else {
                            Language::En
                        };
                        this.rebuild(cx);
                    }
                    1 => {
                        this.kind = Kind::ALL[event.0];
                        this.rebuild(cx);
                        if let Err(error) = this.persist() {
                            this.status = error;
                            this.tools_open = true;
                        }
                    }
                    3 => {
                        this.mode = match event.0 {
                            1 => Mode::SideBySide,
                            2 => Mode::Overlaid,
                            _ => Mode::Hidden,
                        };
                        cx.notify();
                    }
                    _ => {}
                },
            )
            .detach();
            self.controls.push(choice);
        }
        let entity = cx.entity();
        window.on_next_frame(move |_, cx| entity.update(cx, |_, cx| cx.notify()));
    }

    fn study_panel(&self, window: &Window, cx: &mut Context<Self>) -> gpui::Stateful<gpui::Div> {
        let choice = |index: usize, label: &str| {
            study_label(label, cx).child(study_choice(
                self.controls[index].clone(),
                index,
                window,
                cx,
            ))
        };
        let mut panel = div().flex().flex_col().px(px(22.0)).pt(px(38.0)).pb(px(30.0))
            .child(orbit::tracked_text("VANTARE / WORKSHOP", 8.0, 600, 0x00aa_aab0, 1.6, cx))
            .child(orbit::tracked_text("Eficiencia.", 28.0, 600, 0x00f5_f5f5, -1.96, cx).mt(px(18.0)))
            .child(orbit::text(format!("{} · Sistema Eficiencia", widget_label(self.kind)), 11.0, 400, 0x00a5_a5ab, cx).mt(px(4.0)))
            .child(study_section("Idioma del widget", cx)
                .child(choice(0, "Idioma"))
                .child(study_note("Demostración local. El idioma de esta vista se restablece al abrir el Workshop.", cx)))
            .child(study_section("Widget", cx)
                .child(choice(1, "Widget"))
                .child(choice(2, "Sistema de diseño").mt(px(10.0)))
                .child(study_note("Escena de ejemplo", cx)))
            .child(study_section("Sesión", cx).child(study_segments("session", &["Práctica", "Clasificación", "Carrera"], 2, cx)))
            .child(study_section("Marca", cx).child(study_segments("brand", &["Con marca", "Sin marca"], 0, cx)))
            .child(study_section("Dirección v2", cx).child(study_segments("direction", &["V1", "Default", "Foco"], 1, cx)))
            .child(study_section("Clasificación", cx).child(study_segments("scope", &["General", "Multiclase"], 0, cx)))
            .child(study_section("Filas", cx)
                .child(study_note("Pilotos totales; Default muestra el podio y la ventana alrededor del jugador.", cx))
                .child(study_label("Pilotos totales", cx).child(study_readonly("rows", "7", cx)))
                .child(study_label("Posición del jugador", cx).mt(px(10.0)).child(study_readonly("player", "1", cx)))
                .child(study_label("Pilotos alrededor", cx).mt(px(10.0)).child(study_readonly("around", "4", cx))))
            .child(study_section("Módulos", cx).child(study_note("Posición y piloto siempre visibles.", cx))
                .children([("Diferencia", true), ("Mejor vuelta", false), ("Última vuelta", true), ("Estado en boxes", true)].into_iter().enumerate().map(|(index, (label, on))| study_toggle("module", index, label, on, cx))))
            .child(study_section("Nombre", cx).child(study_segments("name", &["Completo", "Apellido", "Inicial"], 0, cx)))
            .child(study_section("Pie de datos", cx).child(study_note("Datos bajo las filas, en orden de selección.", cx))
                .children(["Tiempo", "Vuelta", "Posición", "Diferencia", "Mejor vuelta", "Última vuelta", "Pista", "Aire", "Viento"].into_iter().enumerate().map(|(index, label)| study_toggle("slot", index, label, label == "Pista", cx))))
            .child(study_section("Ubicación", cx).child(study_label("Ubicación", cx).child(study_readonly("location", "Pista", cx))))
            .child(study_section("Presentación", cx)
                .child(study_note("Fondo", cx))
                .child(div().flex().gap(px(4.0)).children(["Mixto", "Oscuro", "Claro"].into_iter().enumerate().map(|(index, label)| {
                    study_button("stage-background", label, cx).id(("stage-background", index)).flex_1()
                        .on_click(cx.listener(move |this, _, _, cx| { this.background = index; cx.notify(); }))
                })))
                .child(study_label("Superficie", cx).child(study_readonly("surface", "Studio", cx)))
                .child(choice(3, "Comparar con").mt(px(10.0)))
                .child(study_note("Escala", cx))
                .child(study_segments("scale", &["0.5×", "1×", "1.5×", "2×"], 1, cx))
                .child(study_note("La resolución real del widget es la base; ancho y alto solo cambian la previsualización del harness.", cx))
                .child(study_label("Resolución", cx).child(study_readonly("resolution", "1080p · 1920×1080", cx)))
                .child(study_label("Ancho", cx).mt(px(10.0)).child(study_readonly("width", "410", cx)))
                .child(study_label("Alto", cx).mt(px(8.0)).child(study_readonly("height", "302", cx)))
                .child(study_button("apply-size", "Aplicar tamaño declarado", cx).w(px(131.0)).mt(px(10.0)).tab_stop(false).cursor_default().aria_description("Tamaño fijo del widget")))
            .child(div().mt(px(30.0))
                .child(study_button("workshop-tools", "Escenario de diseño", cx).h(px(12.0)).relative().pl(px(12.0)).justify_start().border_0().text_color(rgb(crate::orbit::legacy_rgb(0x00c4_c4c8, cx))).child(div().absolute().left_0().top(px(4.0)).size(px(5.0)).rounded_full().bg(rgb(crate::orbit::legacy_rgb(0x00c1_121f, cx)))).on_click(cx.listener(|this, _, _, cx| { this.tools_open = !this.tools_open; cx.notify(); })))
                .child(study_note("Datos de demostración. El widget usa el mismo componente que la aplicación.", cx).mt(px(8.0)).mb(px(0.0)).line_height(px(17.0)))
                .child(orbit::mono_text(format!("widget={}&system=vantare-functional&scene={}&frame={}&language={:?}&background={}&comparison={}", self.kind.name(), self.scene.path.file_name().unwrap_or_default().to_string_lossy(), self.scene.index(), self.prefs.language, ["grid", "dark", "light"][self.background], match self.mode { Mode::Hidden => "none", Mode::SideBySide => "side-by-side", Mode::Overlaid => "overlaid" }), 9.0, 0x0077_777d, cx).line_height(px(14.4)).mt(px(10.0)))
                .child(study_button("reset-study", "Restablecer selección", cx).w(px(127.0)).h(px(28.0)).mt(px(10.0)).on_click(cx.listener(|this, _, _, cx| {
                    this.kind = Kind::Standings;
                    this.background = 0;
                    this.mode = Mode::Hidden;
                    this.prefs.language = Language::Es;
                    this.controls.clear();
                    this.select_scene(this.scenes.iter().position(|path| path.file_name().is_some_and(|name| name == "standings.snapshot.json")).unwrap_or(this.chosen_scene), cx);
                }))));
        if self.tools_open {
            panel = panel.child(self.toolbar(cx)).child(self.playback(cx))
                .child(orbit::callout(self.scene.error.clone().unwrap_or_else(|| self.status.clone()), cx))
                .child(study_note("La sesión, opciones de Standings y tamaño se editan en Studio. Este panel conserva su estado de referencia; esas opciones se configuran en Studio.", cx));
        }
        div()
            .id("workshop-controls")
            .w(px(248.0))
            .h_full()
            .flex_shrink_0()
            .relative()
            .bg(rgb(crate::orbit::legacy_rgb(0x0019_191b, cx)))
            .overflow_hidden()
            .child(
                div()
                    .id("workshop-panel-scroll")
                    .w(px(232.0))
                    .h_full()
                    .overflow_y_scroll()
                    .track_scroll(&self.scroll)
                    .child(panel),
            )
            .child(study_scrollbar(&self.scroll, cx).on_mouse_down(
                gpui::MouseButton::Left,
                cx.listener(|this, event: &gpui::MouseDownEvent, _, cx| {
                    let bounds = this.scroll.bounds();
                    let fraction = f32::from(event.position.y - bounds.top())
                        / f32::from(bounds.size.height).max(1.0);
                    this.scroll.set_offset(gpui::point(
                        px(0.0),
                        -this.scroll.max_offset().y * fraction.clamp(0.0, 1.0),
                    ));
                    cx.notify();
                }),
            ))
            .on_scroll_wheel(cx.listener(|_, _, _, cx| cx.notify()))
    }

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
            let mut overlay = workshop_overlay(kind, prefs);
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
            controls: Vec::new(),
            scroll: gpui::ScrollHandle::new(),
            tools_open: false,
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
            let mut overlay = workshop_overlay(self.kind, self.prefs);
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
        orbit::card("Selección de trabajo", cx).child(
            orbit::card_body()
                .child(study_setting(
                    "Widget",
                    "Renderer productivo",
                    div()
                        .flex()
                        .flex_wrap()
                        .items_center()
                        .gap(px(orbit::RADIUS_CONTROL))
                        .child(
                            button("widget-prev", "◀", cx)
                                .aria_label("Widget anterior")
                                .on_click(cx.listener(|this, _, _, cx| this.widget(false, cx))),
                        )
                        .child(orbit::text(self.kind.name(), 13.5, 600, orbit::ink(cx), cx))
                        .child(
                            button("widget-next", "▶", cx)
                                .aria_label("Widget siguiente")
                                .on_click(cx.listener(|this, _, _, cx| this.widget(true, cx))),
                        ),
                    cx,
                ))
                .child(study_setting(
                    "Escena",
                    "JSON local · catálogo",
                    div()
                        .flex()
                        .flex_wrap()
                        .gap(px(orbit::RADIUS_CONTROL))
                        .child(
                            button("scene-prev", "◀ escena", cx).on_click(
                                cx.listener(|this, _, _, cx| this.choose_scene(false, cx)),
                            ),
                        )
                        .child(
                            button("scene-next", "escena ▶", cx).on_click(
                                cx.listener(|this, _, _, cx| this.choose_scene(true, cx)),
                            ),
                        ),
                    cx,
                ))
                .child(study_setting(
                    "Archivo local",
                    "Recarga el JSON de la escena",
                    button("reload-scene", "Recargar JSON", cx).on_click(cx.listener(
                        |this, _, _, cx| {
                            if this.scene.replace(this.scene.path.clone()) {
                                this.rebuild(cx);
                            } else {
                                cx.notify();
                            }
                        },
                    )),
                    cx,
                ))
                .child(study_setting(
                    "Continuidad",
                    "Conserva la selección actual",
                    button("save-workshop", "Guardar selección", cx).on_click(cx.listener(
                        |this, _, _, cx| {
                            if let Err(error) = this.persist() {
                                this.status = error;
                            }
                            cx.notify();
                        },
                    )),
                    cx,
                ))
                .child(orbit::text(
                    self.scene.path.display().to_string(),
                    12.0,
                    400,
                    orbit::ink_3(cx),
                    cx,
                )),
        )
    }

    fn playback(&self, cx: &mut Context<Self>) -> gpui::Div {
        orbit::card("Reproducción y comparación", cx).child(
            orbit::card_body()
                .child(study_setting(
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
                        .child(button("rewind", "Inicio", cx).on_click(cx.listener(
                            |this, _, _, cx| {
                                this.scene.rewind();
                                this.ingest(cx);
                            },
                        )))
                        .child(button("step-prev", "◀ foto", cx).on_click(cx.listener(
                            |this, _, _, cx| {
                                this.scene.step(false);
                                this.ingest(cx);
                            },
                        )))
                        .child(
                            button(
                                "play",
                                if self.scene.playing { "Pausa" } else { "Play" },
                                cx,
                            )
                            .on_click(cx.listener(|this, _, _, cx| {
                                this.scene.play();
                                this.next_frame = Instant::now() + this.scene.delay();
                                this.ingest(cx);
                            })),
                        )
                        .child(button("step-next", "foto ▶", cx).on_click(cx.listener(
                            |this, _, _, cx| {
                                this.scene.step(true);
                                this.ingest(cx);
                            },
                        ))),
                    cx,
                ))
                .child(study_setting(
                    "Repetir escena",
                    "Vuelve al inicio al terminar la secuencia",
                    orbit::toggle("loop", "Repetir escena", self.scene.looping, true, cx).on_click(
                        cx.listener(|this, _, _, cx| {
                            this.scene.looping = !this.scene.looping;
                            cx.notify();
                        }),
                    ),
                    cx,
                ))
                .child(self.presentation_tools(cx))
                .child(study_setting(
                    "Paridad de píxeles",
                    "ES/métrico · DPI 100 %",
                    button(
                        "capture-diff",
                        if self.capturing {
                            "Capturando…"
                        } else {
                            "Capturar y calcular %"
                        },
                        cx,
                    )
                    .px(px(6.0))
                    .on_click(cx.listener(|this, _, _, cx| this.capture(cx))),
                    cx,
                )),
        )
    }

    fn presentation_tools(&self, cx: &mut Context<Self>) -> gpui::Div {
        div()
            .flex()
            .flex_col()
            .child(study_setting(
                "Fondo del escenario",
                "El fondo no entra en la captura",
                orbit::select(
                    "background",
                    ["Canvas", "Superficie", "Claro"][self.background],
                    cx,
                )
                .min_w_0()
                .w_full()
                .on_click(cx.listener(|this, _, _, cx| {
                    this.background = (this.background + 1) % 3;
                    cx.notify();
                })),
                cx,
            ))
            .child(study_setting(
                "Referencia congelada",
                "PNG fijo durante el replay",
                orbit::select(
                    "reference",
                    match self.mode {
                        Mode::SideBySide => "Lado a lado",
                        Mode::Overlaid => "Superpuesta 50 %",
                        Mode::Hidden => "Oculta",
                    },
                    cx,
                )
                .min_w_0()
                .w_full()
                .on_click(cx.listener(|this, _, _, cx| {
                    this.mode = match this.mode {
                        Mode::SideBySide => Mode::Overlaid,
                        Mode::Overlaid => Mode::Hidden,
                        Mode::Hidden => Mode::SideBySide,
                    };
                    cx.notify();
                })),
                cx,
            ))
    }
}

impl Drop for Workshop {
    fn drop(&mut self) {
        self.capture_process.cancel();
    }
}

impl Workshop {
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
                    .child(orbit::callout(format!("Referencia pendiente: {error}"), cx));
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

    fn stage(&self, window: &Window, cx: &Context<Self>) -> gpui::Div {
        const CONTENT_LEFT: f32 = 248.0;
        const GRID_SIZE: f32 = 32.0;
        const GRID_COLOR: u32 = 0x6e_79_96_14;

        let viewport = window.viewport_size();
        let viewport_width = f32::from(viewport.width);
        let viewport_height = f32::from(viewport.height);
        let stage_width = (viewport_width - CONTENT_LEFT).max(0.0);
        let stage_height = viewport_height;
        let (widget_width, widget_height) = self.overlay.read(cx).wanted_size();
        let preview_width = if self.mode == Mode::SideBySide {
            widget_width * 2.0 + orbit::GUTTER
        } else {
            widget_width
        };
        let (widget_left, widget_top) = widget_origin(
            (stage_width, stage_height),
            (preview_width, widget_height),
            self.kind,
        );

        let mut stage = div()
            .relative()
            .w(px(stage_width))
            .h(px(stage_height))
            .overflow_hidden()
            .bg(rgb([0x0015_1516, 0x0025_2527, 0x00c9_c8c4][self.background]));

        // Wails usa dos gradientes de 1 px sobre una cuadrícula de 32 px.
        let first_horizontal = 0.0;
        let mut y = first_horizontal;
        while self.background == 0 && y < stage_height {
            stage = stage.child(
                div()
                    .absolute()
                    .top(px(y))
                    .left_0()
                    .w_full()
                    .h(px(1.0))
                    .bg(rgba(GRID_COLOR)),
            );
            y += GRID_SIZE;
        }
        let mut x = 0.0;
        while self.background == 0 && x < stage_width {
            stage = stage.child(
                div()
                    .absolute()
                    .left(px(x))
                    .top_0()
                    .w(px(1.0))
                    .h_full()
                    .bg(rgba(GRID_COLOR)),
            );
            x += GRID_SIZE;
        }

        stage = stage.child(
            orbit::tracked_text(
                format!(
                    "OVERLAY.WIDGETS.{} / ESTUDIO 01",
                    self.kind.name().to_uppercase()
                ),
                9.0,
                500,
                0x00aa_aeb0,
                1.26,
                cx,
            )
            .absolute()
            .left(px(32.0))
            .top(px(26.0)),
        );
        stage = stage.when_some(self.scene.error.clone(), |stage, error| {
            stage.child(
                orbit::callout(error, cx)
                    .absolute()
                    .left(px(32.0))
                    .top(px(52.0)),
            )
        });
        stage.child(
            div()
                .absolute()
                .left(px(widget_left + 0.5))
                .top(px(widget_top))
                .w(px(preview_width))
                .h(px(widget_height))
                .overflow_hidden()
                .child(self.preview(cx)),
        )
    }
}

impl Render for Workshop {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        self.prepare_controls(window, cx);
        div()
            .size_full()
            .flex()
            .child(self.study_panel(window, cx))
            .child(self.stage(window, cx))
    }
}

fn widget_label(kind: Kind) -> &'static str {
    if kind == Kind::Standings {
        "Standings"
    } else {
        kind.name()
    }
}

fn widget_origin(stage: (f32, f32), widget: (f32, f32), kind: Kind) -> (f32, f32) {
    // Wails centra el cuerpo de Standings; el rail PIT sobresale a su derecha.
    let body_width = if kind == Kind::Standings {
        widget.0 - PIT_RAIL_WIDTH
    } else {
        widget.0
    };
    (
        (stage.0 / 2.0 - body_width / 2.0).max(0.0),
        (stage.1 / 2.0 - widget.1 / 2.0).max(0.0),
    )
}

fn study_label(label: &str, cx: &gpui::App) -> gpui::Div {
    div().flex().flex_col().gap(px(8.0)).child(orbit::text(
        label.to_owned(),
        10.0,
        400,
        0x00ac_acb2,
        cx,
    ))
}

fn study_setting(label: &str, help: &str, control: impl IntoElement, cx: &gpui::App) -> gpui::Div {
    orbit::setting_row(label, help, div().w_full().child(control), cx)
        .flex_col()
        .items_stretch()
        .gap(px(8.0))
}

fn study_choice(
    choice: Entity<orbit::Choice>,
    index: usize,
    window: &Window,
    cx: &Context<Workshop>,
) -> gpui::Div {
    let control = choice.read(cx);
    let value = control
        .state
        .selected
        .and_then(|selected| control.state.options.get(selected))
        .map_or("Seleccionar…", |option| option.label.as_str())
        .to_owned();
    let focused = control.focus_handle().is_focused(window);
    // La entidad Orbit mantiene menú, teclado y foco. Solo vestimos su trigger
    // con las medidas compactas de Workshop, sin cambiar el kit para el Hub.
    div()
        .relative()
        .w_full()
        .h(px(34.0))
        .child(choice.clone())
        .child(
            div()
                .absolute()
                .top(px(34.0))
                .left_0()
                .w_full()
                .h(px(5.0))
                .bg(rgb(crate::orbit::legacy_rgb(0x0019_191b, cx))),
        )
        .child(
            orbit::field("study-select", cx)
                .id(("study-select", index))
                .absolute()
                .inset_0()
                .min_w_0()
                .w_full()
                .h(px(34.0))
                .px(px(12.0))
                .rounded(px(3.0))
                .bg(rgb(crate::orbit::legacy_rgb(0x0023_2325, cx)))
                .border_color(rgb(crate::orbit::legacy_rgb(0x0044_444a, cx)))
                .tab_stop(false)
                .occlude()
                .cursor_pointer()
                .justify_between()
                .when(focused, |field| field.border_color(rgb(orbit::coral(cx))))
                .child(orbit::text(value, 13.0, 400, 0x00de_dee2, cx))
                .child(orbit::text("⌄", 13.0, 600, 0x00de_dee2, cx))
                .on_click(move |_, window, cx| {
                    choice.update(cx, |control, cx| {
                        control.focus_handle().focus(window, cx);
                        control.state.toggle();
                        cx.notify();
                    });
                }),
        )
}

fn study_note(note: &str, cx: &gpui::App) -> gpui::Div {
    orbit::text(note.to_owned(), 10.0, 400, 0x0091_9197, cx)
        .line_height(px(15.0))
        .mb(px(12.0))
}

fn study_section(title: &str, cx: &gpui::App) -> gpui::Div {
    div()
        .flex()
        .flex_col()
        .flex_shrink_0()
        .mt(px(28.0))
        .pt(px(18.0))
        .border_t_1()
        .border_color(rgb(crate::orbit::legacy_rgb(0x0033_3336, cx)))
        .child(orbit::tracked_text(title, 10.0, 600, 0x00bd_bdc2, 0.4, cx).mb(px(10.0)))
}

fn study_button(id: &'static str, label: &str, cx: &gpui::App) -> gpui::Stateful<gpui::Div> {
    button(id, "", cx)
        .aria_label(label.to_owned())
        .h(px(30.0))
        .px(px(3.0))
        .rounded(px(3.0))
        .bg(rgb(crate::orbit::legacy_rgb(0x0019_191b, cx)))
        .border_color(rgb(crate::orbit::legacy_rgb(0x003b_3b40, cx)))
        .text_size(px(10.0))
        .font_family(crate::orbit::sans_override("Inter W500", cx))
        .text_color(rgb(crate::orbit::legacy_rgb(0x00b0_b0b6, cx)))
        .child(label.to_owned())
}

fn study_readonly(id: &'static str, value: &str, cx: &gpui::App) -> gpui::Stateful<gpui::Div> {
    orbit::field(id, cx)
        .w_full()
        .min_w_0()
        .h(px(34.0))
        .px(px(8.0))
        .rounded(px(3.0))
        .bg(rgb(crate::orbit::legacy_rgb(0x0023_2325, cx)))
        .border_color(rgb(crate::orbit::legacy_rgb(0x0044_444a, cx)))
        .tab_stop(false)
        .cursor_default()
        .opacity(0.72)
        .aria_description("Próximamente")
        .child(orbit::text(value.to_owned(), 11.0, 400, 0x00de_dee2, cx))
        .when(
            matches!(id, "location" | "surface" | "resolution"),
            |field| {
                field
                    .justify_between()
                    .child(orbit::text("⌄", 12.0, 600, 0x00de_dee2, cx))
            },
        )
}

fn study_segments(id: &'static str, labels: &[&str], selected: usize, cx: &gpui::App) -> gpui::Div {
    div()
        .flex()
        .gap(px(4.0))
        .children(labels.iter().enumerate().map(|(index, label)| {
            study_button(id, label, cx)
                .id((id, index))
                .flex_1()
                .aria_selected(index == selected)
                .tab_stop(false)
                .cursor_default()
                .opacity(0.72)
                .aria_description("Opción de referencia; usa Studio para editar el documento")
                .when(index == selected, |button| {
                    button
                        .bg(rgb(crate::orbit::legacy_rgb(0x0035_3539, cx)))
                        .border_color(rgb(crate::orbit::legacy_rgb(0x0062_6268, cx)))
                        .opacity(1.0)
                        .font_family(crate::orbit::sans_override("Inter W600", cx))
                        .text_color(rgb(crate::orbit::legacy_rgb(0x00f5_f5f5, cx)))
                })
        }))
}

fn study_toggle(
    id: &'static str,
    index: usize,
    label: &str,
    on: bool,
    cx: &gpui::App,
) -> gpui::Div {
    div()
        .h(px(34.0))
        .flex()
        .items_center()
        .justify_between()
        .child(orbit::text(label.to_owned(), 12.0, 400, 0x00f5_f5f5, cx))
        .child(
            orbit::toggle(id, label, on, false, cx)
                .id((id, index))
                .w(px(26.0))
                .h(px(15.0)),
        )
}

fn study_scrollbar(scroll: &gpui::ScrollHandle, cx: &gpui::App) -> gpui::Stateful<gpui::Div> {
    let maximum = f32::from(scroll.max_offset().y);
    let offset = -f32::from(scroll.offset().y);
    let height = f32::from(scroll.bounds().size.height).max(36.0);
    let thumb = if maximum > 0.0 {
        ((height - 36.0) * height / (height + maximum)).max(20.0)
    } else {
        height - 36.0
    };
    let top = 18.0
        + if maximum > 0.0 {
            offset / maximum * (height - 36.0 - thumb)
        } else {
            0.0
        };
    div()
        .id("workshop-scrollbar")
        .absolute()
        .right_0()
        .top_0()
        .w(px(16.0))
        .h_full()
        .bg(rgb(crate::orbit::legacy_rgb(0x002c_2c2c, cx)))
        .child(
            orbit::text("▴", 12.0, 600, 0x00aa_aaaa, cx)
                .absolute()
                .top_0()
                .left(px(3.0)),
        )
        .child(
            div()
                .absolute()
                .left(px(3.0))
                .top(px(top))
                .w(px(9.0))
                .h(px(thumb))
                .rounded(px(5.0))
                .bg(rgb(crate::orbit::legacy_rgb(0x0099_9999, cx))),
        )
        .child(
            orbit::text("▾", 12.0, 600, 0x00aa_aaaa, cx)
                .absolute()
                .bottom_0()
                .left(px(3.0)),
        )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn fullscreen_stage_keeps_the_wails_widget_center_and_pit_rail() {
        let (x, y) = widget_origin(
            (1440.0 - 248.0, 900.0),
            (410.0 + PIT_RAIL_WIDTH, 302.0),
            Kind::Standings,
        );
        assert!((x + 248.0 - 639.0).abs() < 0.001);
        assert!((y - 299.0).abs() < 0.001);
        let (x, y) = widget_origin((100.0, 100.0), (410.0, 302.0), Kind::Standings);
        assert!(x.abs() + y.abs() < 0.001);
    }

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
        assert_eq!(
            Prepared::load(&dir, None)
                .expect("cursor inválido recuperado")
                .scene
                .path
                .file_name()
                .and_then(|n| n.to_str()),
            Some("standings.snapshot.json")
        );
        assert!(
            Prepared::load(&dir, Some(scene.clone())).is_ok(),
            "escena explícita ignora el cursor viejo"
        );
        std::fs::remove_file(path).expect("limpiar");
        std::fs::remove_file(scene).expect("limpiar escena propia");
        std::fs::remove_dir_all(dir).expect("limpiar");
    }

    #[test]
    fn invalid_saved_selections_fall_back_to_the_installed_default() {
        let dir =
            std::env::temp_dir().join(format!("vantare-workshop-fallback-{}", std::process::id()));
        std::fs::create_dir(&dir).expect("directorio propio");
        let path = dir.join("workshop-selection.json");
        let bad_scene = dir.join("broken.snapshot.json");
        std::fs::write(&bad_scene, "{}").expect("escena dañada");
        for scene in [
            dir.join("old-generation/standings.snapshot.json"),
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("Cargo.toml"),
            bad_scene,
        ] {
            let selection = Selection {
                version: 1,
                widget: "standings".into(),
                scene,
                frame: 0,
                looping: false,
                _imperial: false,
                _english: false,
                comparison: Mode::Hidden,
                background: 0,
            };
            std::fs::write(&path, serde_json::to_vec(&selection).expect("JSON")).expect("guardar");
            assert_eq!(
                Prepared::load(&dir, None)
                    .expect("recuperar")
                    .scene
                    .path
                    .file_name()
                    .and_then(|n| n.to_str()),
                Some("standings.snapshot.json")
            );
        }
        for invalid in ["{", "{\"version\":999}"] {
            std::fs::write(&path, invalid).expect("selección dañada");
            assert!(Prepared::load(&dir, None).is_ok());
        }
        std::fs::remove_dir_all(dir).expect("limpiar");
    }

    #[test]
    fn default_scene_matches_the_workshop_standings_fixture() {
        let dir =
            std::env::temp_dir().join(format!("vantare-workshop-default-{}", std::process::id()));
        std::fs::create_dir(&dir).expect("directorio propio");

        let prepared = Prepared::load(&dir, None).expect("escena predeterminada");
        assert!(matches!(prepared.mode, Mode::Hidden));
        assert_eq!(
            prepared
                .scene
                .path
                .file_name()
                .and_then(|name| name.to_str()),
            Some("standings.snapshot.json")
        );

        std::fs::remove_dir(dir).expect("limpiar");
    }
}
