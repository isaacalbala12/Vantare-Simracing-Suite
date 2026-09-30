//! Catálogo y reproducción local, incrustando el renderer productivo de ui.
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime};

use gpui::{Context, Entity, IntoElement, Render, Window, div, prelude::*, rgb};
use serde::{Deserialize, Serialize};
use vantare_domain::format::{Language, Preferences, Units};
use vantare_ui::{Kind, Overlay};

use crate::{
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
    imperial: bool,
    english: bool,
}

pub struct Workshop {
    pub scene: Scene,
    kind: Kind,
    scenes: Vec<PathBuf>,
    chosen_scene: usize,
    overlay: Entity<Overlay>,
    reference: Option<Entity<Overlay>>,
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

pub struct Prepared {
    scene: Scene,
    kind: Kind,
    scenes: Vec<PathBuf>,
    chosen_scene: usize,
    prefs: Preferences,
    state_path: PathBuf,
    saved: Option<Vec<u8>>,
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
        let prefs = Preferences {
            units: if selection.as_ref().is_some_and(|s| s.imperial) {
                Units::Imperial
            } else {
                Units::Metric
            },
            language: if selection.as_ref().is_some_and(|s| s.english) {
                Language::En
            } else {
                Language::Es
            },
        };
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
            prefs,
            state_path,
            saved,
        })
    }
}

impl Workshop {
    pub fn preferences(&self) -> Preferences {
        self.prefs
    }

    pub fn set_preferences(
        &mut self,
        prefs: Preferences,
        cx: &mut Context<Self>,
    ) -> Result<(), String> {
        let previous = self.prefs;
        self.prefs = prefs;
        if let Err(error) = self.persist() {
            self.prefs = previous;
            return Err(error);
        }
        self.rebuild(cx);
        Ok(())
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
        } = prepared;
        let overlay = cx.new(|cx| {
            let mut overlay = Overlay::new(kind, prefs);
            overlay.ingest(scene.snapshot(), cx);
            overlay
        });
        let stamp = stamp(&scene.path);
        Self {
            scene,
            kind,
            scenes,
            chosen_scene,
            overlay,
            reference: None,
            prefs,
            state_path,
            saved,
            status: "Sin cambios guardados en esta sesión".into(),
            stamp,
            next_poll: Instant::now(),
            next_frame: Instant::now(),
            background: 0,
        }
    }

    pub fn persist(&mut self) -> Result<(), String> {
        let selection = Selection {
            version: 1,
            widget: self.kind.name().into(),
            scene: self.scene.path.clone(),
            frame: self.scene.index(),
            looping: self.scene.looping,
            imperial: self.prefs.units == Units::Imperial,
            english: self.prefs.language == Language::En,
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
        self.overlay = cx.new(|cx| {
            let mut overlay = Overlay::new(self.kind, self.prefs);
            overlay.ingest(self.scene.snapshot(), cx);
            overlay
        });
        self.reference = None;
        cx.notify();
    }

    fn ingest(&mut self, cx: &mut Context<Self>) {
        self.overlay
            .update(cx, |overlay, cx| overlay.ingest(self.scene.snapshot(), cx));
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
        self.chosen_scene = (self.chosen_scene + step) % self.scenes.len();
        if self.scene.replace(self.scenes[self.chosen_scene].clone()) {
            self.stamp = stamp(&self.scene.path);
            self.ingest(cx);
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
                self.stamp = modified;
                self.scene.replace(self.scene.path.clone());
                self.ingest(cx);
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
                    this.scene.replace(this.scene.path.clone());
                    this.ingest(cx);
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

impl Render for Workshop {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let backgrounds = [0x0010_1113, 0x0034_3438, 0x00ff_ffff];
        div().flex().flex_col().gap_2().size_full()
            .child(self.toolbar(cx))
            .child(self.scene.path.display().to_string())
            .child("Escena local, sin conexión live. lmu47 distribuida proviene del corpus; las demás son fixtures de paridad. Verifica la procedencia de archivos externos.")
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
                .child(button("units", "Métrico / Imperial").on_click(cx.listener(|this, _, _, cx| {
                    this.prefs.units = if this.prefs.units == Units::Metric { Units::Imperial } else { Units::Metric }; this.rebuild(cx);
                })))
                .child(button("language", "ES / EN").on_click(cx.listener(|this, _, _, cx| {
                    this.prefs.language = if this.prefs.language == Language::Es { Language::En } else { Language::Es }; this.rebuild(cx);
                })))
                .child(button("reference", "Fijar / quitar comparación").on_click(cx.listener(|this, _, _, cx| {
                    this.reference = if this.reference.is_some() { None } else { Some(cx.new(|cx| {
                        let mut overlay = Overlay::new(this.kind, this.prefs); overlay.ingest(this.scene.snapshot(), cx); overlay
                    })) }; cx.notify();
                }))))
            .child(div().id("workshop-preview").flex_1().overflow_scroll().bg(rgb(backgrounds[self.background]))
                .child(div().flex().gap_4().child(self.overlay.clone())
                    .when_some(self.reference.clone(), gpui::ParentElement::child)))
    }
}
