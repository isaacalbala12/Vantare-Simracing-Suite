//! Carga, catálogo «Añadir widget», tira de widgets y fotos/ejemplos de la preview. Mapa: `README.md`.
use super::*;

pub(super) fn unavailable_scenario(
    index: usize,
    label: &'static str,
    reason: &'static str,
    cx: &gpui::App,
) -> gpui::Stateful<gpui::Div> {
    div()
        .id(("studio-scenario", index))
        .role(gpui::Role::Group)
        .aria_label(format!("{label} · Próximamente"))
        .aria_description(reason)
        .h(px(30.0))
        .px(px(8.0))
        .flex_none()
        .flex()
        .items_center()
        .opacity(orbit::DISABLED)
        .child(orbit::text(label, 12.0, 650, orbit::ink_2(cx), cx))
        .tooltip(move |_, cx| cx.new(|_| orbit::Tooltip(reason.to_owned())).into())
}

pub(super) fn catalog_options(access: Option<crate::shell::navigation::Access>) -> Vec<OptionItem> {
    Kind::ALL
        .iter()
        .map(|&kind| match widget_lock(access, kind) {
            Some(reason) => OptionItem::locked(kind.label(), reason),
            None => OptionItem::new(kind.label()),
        })
        .collect()
}
#[cfg(any(test, feature = "parity-capture"))]
pub(super) fn demo_standings_settings() -> Settings {
    use vantare_ui::standings::{
        Settings as StandingsSettings,
        options::{ColumnSetting, Format},
    };
    // La escena Wails reserva 340×420 en x=1560. Eficiencia usa filas de 30 px:
    // estas opciones admitidas producen 338×424 sin cambiar el renderer ni sus defaults.
    Settings::Standings(StandingsSettings {
        row_count: 12,
        columns: Some(
            ["position", "driverNumber", "driverName", "gap", "lastLap"]
                .into_iter()
                .map(|metric| ColumnSetting {
                    id: metric.into(),
                    metric_id: metric.into(),
                    format: if metric == "driverName" {
                        Format {
                            mode: "truncate".into(),
                            max_chars: Some(11),
                            ..Format::default()
                        }
                    } else {
                        Format::default()
                    },
                    ..ColumnSetting::default()
                })
                .collect(),
        ),
        ..StandingsSettings::eficiencia()
    })
}

#[cfg(any(test, feature = "parity-capture"))]
pub(super) fn demo_content_scale(kind: Kind, width: f32) -> f32 {
    // Ancho lógico de delta en hub-profile-mock-state.ts. Mantiene su aspecto.
    if kind == Kind::Delta {
        400.0 / width
    } else {
        1.0
    }
}

#[cfg(any(test, feature = "parity-capture"))]
pub(super) const DEMO_ITEMS: [(Kind, f32, f32); 4] = [
    (Kind::Standings, 48.0, 62.0),
    (Kind::Delta, 760.0, 40.0),
    (Kind::Relative, 700.0, 480.0),
    (Kind::FuelStrategy, 1180.0, 62.0),
];
#[cfg(any(test, feature = "parity-capture"))]
pub(super) fn capture_settings(kind: Kind) -> Settings {
    let mut settings = if kind == Kind::Standings {
        demo_standings_settings()
    } else {
        Settings::default_for(kind)
    };
    if let Settings::Standings(settings) = &mut settings {
        settings.row_count = 8;
        #[cfg(feature = "parity-capture")]
        if capture_session().is_some() {
            settings.apply_session_preview();
        }
    }
    settings
}

#[cfg(feature = "parity-capture")]
pub(super) fn capture_session() -> Option<vantare_ui::session::Session> {
    if !capture_name().is_some_and(|name| name.starts_with("studio-")) {
        return None;
    }
    match std::env::var("VANTARE_CAPTURE_SESSION").as_deref() {
        Ok("practice") => Some(vantare_ui::session::Session::Practice),
        Ok("qualifying") => Some(vantare_ui::session::Session::Qualifying),
        Ok("race") => Some(vantare_ui::session::Session::Race),
        _ => None,
    }
}

pub(super) fn example_snapshots() -> Result<Vec<(Kind, Snapshot)>, String> {
    [
        (
            Kind::Standings,
            include_str!("../../../ui/fixtures/standings.snapshot.json"),
        ),
        (
            Kind::Radar,
            include_str!("../../../ui/fixtures/radar.snapshot.json"),
        ),
        (
            Kind::Pedals,
            include_str!("../../../ui/fixtures/pedals.snapshot.json"),
        ),
        (
            Kind::Delta,
            include_str!("../../../ui/fixtures/delta.snapshot.json"),
        ),
        (
            Kind::CarDamageVisual,
            include_str!("../../../ui/fixtures/car-damage-visual.snapshot.json"),
        ),
        (
            Kind::InputTelemetry,
            include_str!("../../../ui/fixtures/input-telemetry.snapshot.json"),
        ),
        (
            Kind::MulticlassRelative,
            include_str!("../../../ui/fixtures/multiclass-relative.snapshot.json"),
        ),
        (
            Kind::BroadcastTower,
            include_str!("../../../ui/fixtures/broadcast-tower.snapshot.json"),
        ),
        (
            Kind::DeltaTrace,
            include_str!("../../../ui/fixtures/delta-trace.snapshot.json"),
        ),
        (
            Kind::TrackMap,
            include_str!("../../../ui/fixtures/track-map.snapshot.json"),
        ),
        (
            Kind::TrackWeather,
            include_str!("../../../ui/fixtures/track-weather.snapshot.json"),
        ),
        (
            Kind::CarDamageNumbers,
            include_str!("../../../ui/fixtures/car-damage-numbers.snapshot.json"),
        ),
        (
            Kind::HeadToHead,
            include_str!("../../../ui/fixtures/head-to-head.snapshot.json"),
        ),
        (
            Kind::FuelStrategy,
            include_str!("../../../ui/fixtures/fuel-strategy.snapshot.json"),
        ),
        (
            Kind::PedalsTelemetry,
            include_str!("../../../ui/fixtures/pedals-telemetry.snapshot.json"),
        ),
        (
            Kind::Relative,
            include_str!("../../../ui/fixtures/relative.snapshot.json"),
        ),
        (
            Kind::RacingFlags,
            include_str!("../../../ui/fixtures/racing-flags.snapshot.json"),
        ),
        (
            Kind::FastestLap,
            include_str!("../../../ui/fixtures/fastest-lap.snapshot.json"),
        ),
    ]
    .into_iter()
    .map(|(kind, text)| {
        match kind {
            Kind::Standings | Kind::Relative | Kind::MulticlassRelative => examples::tables(),
            Kind::Delta => examples::snapshot(include_str!(
                "../../../ui/fixtures/delta-vantare.scene.json"
            )),
            Kind::FuelStrategy => {
                examples::snapshot(include_str!("../../../ui/fixtures/fuel-vantare.scene.json"))
            }
            _ => vantare_ipc::snapshot_from_saved_json(text).map_err(|error| error.to_string()),
        }
        .map(|snapshot| (kind, snapshot))
        .map_err(|error| format!("Ejemplo {}: {error}", kind.name()))
    })
    .collect()
}

pub(super) fn preview_snapshot<'a>(
    example: bool,
    examples: &'a [(Kind, Snapshot)],
    live: &'a Snapshot,
    kind: Kind,
) -> &'a Snapshot {
    if example {
        &examples
            .iter()
            .find(|(candidate, _)| *candidate == kind)
            .expect("todos los widgets tienen un ejemplo validado")
            .1
    } else {
        live
    }
}

/// Escena QA `studio-oculto`: sin selección (documento vacío sin --demo) es un
/// no-op explícito en lugar de fallar antes de inicializar el editor.
#[cfg(any(test, feature = "parity-capture"))]
pub(super) fn hide_selected_for_capture(editor: &mut Editor) -> Result<(), String> {
    if editor.selected.is_some() {
        editor.edit_selected(|item| item.visible = false)?;
    }
    Ok(())
}
impl Prepared {
    pub fn load(path: PathBuf) -> Result<Self, String> {
        #[cfg(feature = "parity-capture")]
        let mut editor = Editor::open(path)?;
        #[cfg(not(feature = "parity-capture"))]
        let editor = Editor::open(path)?;
        #[cfg(feature = "parity-capture")]
        if studio_demo_capture() && editor.layout().instances.is_empty() {
            // Escena QA del rediseño: solo --capture studio-base --demo; usa los Settings y Overlay productivos.
            for (kind, x, y) in DEMO_ITEMS {
                editor.add(kind)?;
                editor.edit_selected(|item| {
                    item.x = x;
                    item.y = y;
                    item.settings = capture_settings(kind);
                })?;
            }
            editor.selected = editor
                .layout()
                .instances
                .first()
                .map(|item| item.id.clone());
            if std::env::var("VANTARE_CAPTURE_WIDGET").as_deref() == Ok("delta") {
                editor.selected = editor
                    .layout()
                    .instances
                    .iter()
                    .find(|item| item.settings.kind() == Kind::Delta)
                    .map(|item| item.id.clone());
            }
        }
        #[cfg(feature = "parity-capture")]
        if let Some(name) = capture_name() {
            if name == "studio-vacio" {
                while !editor.layout().instances.is_empty() {
                    editor.selected = editor
                        .layout()
                        .instances
                        .first()
                        .map(|item| item.id.clone());
                    editor.remove()?;
                }
            } else if name == "studio-oculto" {
                hide_selected_for_capture(&mut editor)?;
            } else if name == "inicio-opacidad" {
                let ids: Vec<_> = editor
                    .layout()
                    .instances
                    .iter()
                    .map(|item| item.id.clone())
                    .collect();
                for (index, id) in ids.into_iter().enumerate() {
                    editor.selected = Some(id);
                    editor.edit_selected(|item| {
                        item.opacity = [0.0, 0.25, 1.0, 1.0][index % 4];
                        item.x = 200.0;
                        item.y = 100.0;
                        if index == 3 {
                            item.visible = false;
                        }
                    })?;
                }
            }
            if name == "studio-sin-seleccion" {
                editor.selected = None;
            }
        }
        Ok(Self {
            editor,
            examples: example_snapshots()?,
            photos: scenes::load()?,
        })
    }
}

#[cfg(feature = "parity-capture")]
pub(super) fn capture_name() -> Option<String> {
    std::env::args()
        .collect::<Vec<_>>()
        .windows(2)
        .find(|pair| pair[0] == "--capture")
        .map(|pair| pair[1].clone())
}
#[cfg(feature = "parity-capture")]
pub(super) fn studio_demo_capture() -> bool {
    let args: Vec<_> = std::env::args().collect();
    args.iter().any(|arg| arg == "--demo")
        && args.windows(2).any(|pair| {
            pair[0] == "--capture"
                && matches!(
                    pair[1].as_str(),
                    name if name.starts_with("studio-") || matches!(name, "inicio-base" | "inicio-error" | "inicio-opacidad" | "inicio-nombre-largo" | "inicio-sidebar" | "inicio-sidebar-sin-carril" | "inicio-sin-carril")
                )
        })
}
impl Studio {
    pub(super) fn preview_snapshot(&self, kind: Kind) -> &Snapshot {
        if self.example
            && let Some(index) = self.real_photo
        {
            return &self.photos[index].snapshot;
        }
        preview_snapshot(self.example, &self.examples, &self.snapshot, kind)
    }
    pub(super) fn settings_snapshot(&self, settings: &Settings) -> std::borrow::Cow<'_, Snapshot> {
        let photo = self.preview_snapshot(settings.kind());
        let mut snapshot = if self.example
            && self.real_photo.is_none()
            && let Settings::Standings(value) = settings
            && settings.appearance().is_some()
            && value.classification_mode == "multiclass"
        {
            std::borrow::Cow::Owned(examples::multiclass(photo, value.row_count))
        } else {
            std::borrow::Cow::Borrowed(photo)
        };
        // El ejemplo de diseño de Standings adopta la sesión de la pestaña (#1564);
        // las fotos reales y En vivo conservan la suya.
        if self.example && self.real_photo.is_none() && matches!(settings, Settings::Standings(_)) {
            snapshot.to_mut().state.session.kind =
                vantare_domain::Quality::Reliable(self.session_tab.kind());
        }
        snapshot
    }
    pub(super) fn init_navigation_controls(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.catalog.is_none() {
            cx.observe_window_activation(window, |this, window, cx| {
                if !window.is_window_active() {
                    this.cancel_drag(cx);
                }
            })
            .detach();
            let catalog = cx.new(|cx| {
                Choice::new(
                    "Tipo de widget",
                    ChoiceKind::Dropdown,
                    catalog_options(self.access),
                    Some(0),
                    window,
                    cx,
                )
            });
            self.catalog = Some(catalog);
            let photo_choice = cx.new(|cx| {
                let mut choice = Choice::new(
                    "Vuelta y foto real",
                    ChoiceKind::Dropdown,
                    self.photos
                        .iter()
                        .map(|p| OptionItem::new(p.label.clone()))
                        .collect(),
                    Some(0),
                    window,
                    cx,
                );
                // El ancho del contenedor no cambia el trigger: usar su variante compacta.
                choice.compact(150.0);
                choice
            });
            cx.subscribe(&photo_choice, |this, _, event: &ChoiceChanged, cx| {
                if this.real_photo.is_some() && event.0 < this.photos.len() {
                    this.cancel_drag(cx);
                    this.real_photo = Some(event.0);
                    this.rebuild(cx);
                }
            })
            .detach();
            self.photo_choice = Some(photo_choice);
        }
        let values = self.resolution_values();
        let selected = values
            .iter()
            .position(|value| *value == self.editor.layout().canvas_resolution);
        let options: Vec<_> = values
            .iter()
            .map(|value| {
                OptionItem::new(match value {
                    Some(resolution) => {
                        format!("{:.0} × {:.0}", resolution.width, resolution.height)
                    }
                    None => format!("Monitor · {:.0} × {:.0}", self.monitor.2, self.monitor.3),
                })
            })
            .collect();
        if let Some(choice) = &self.resolution_choice {
            choice.update(cx, |choice, cx| {
                if choice.state.selected != selected
                    || choice
                        .state
                        .options
                        .iter()
                        .map(|item| &item.label)
                        .ne(options.iter().map(|item| &item.label))
                {
                    choice.state = orbit::ChoiceState::new(options, selected);
                    cx.notify();
                }
            });
        } else {
            let choice = cx.new(|cx| {
                let mut choice = Choice::new(
                    "Resolución del lienzo",
                    ChoiceKind::Dropdown,
                    options,
                    selected,
                    window,
                    cx,
                );
                choice.compact(170.0);
                choice
            });
            cx.subscribe(&choice, |this, _, event: &ChoiceChanged, cx| {
                if let Some(resolution) = this.resolution_values().get(event.0).copied() {
                    this.set_canvas_resolution(resolution, cx);
                }
            })
            .detach();
            self.resolution_choice = Some(choice);
        }
    }
    fn widget_list(&self, cx: &mut Context<Self>) -> gpui::Div {
        let query = self.search.read(cx).value.to_lowercase();
        let mut list = div().flex().gap(px(8.0));
        let mut matches = 0;
        let mut content_width = 0.0;
        for (index, item) in self.editor.layout().instances.iter().enumerate() {
            if format!("{} {}", item.id, item.settings.kind().label())
                .to_lowercase()
                .contains(&query)
            {
                if matches > 0 {
                    content_width += 8.0;
                }
                content_width += 180.0;
                matches += 1;
                list = list.child(self.widget_row(index, item, cx));
            }
        }
        if matches == 0 {
            list = list.child(text(
                if query.is_empty() {
                    "Añade tu primer widget"
                } else {
                    "Sin resultados"
                },
                13.0,
                400,
                orbit::ink_3(cx),
                cx,
            ));
        }
        // El scroll mide el hijo directo: sus filas no deben desbordar un ancho
        // encogido al viewport, porque entonces los últimos widgets son inaccesibles.
        list.min_w(px(content_width))
    }
    fn widget_row(
        &self,
        index: usize,
        item: &Instance,
        cx: &mut Context<Self>,
    ) -> gpui::Stateful<gpui::Div> {
        let id = item.id.clone();
        let visibility_id = id.clone();
        let selected = self.editor.selected.as_ref() == Some(&item.id);
        let lock = widget_lock(self.access, item.settings.kind());
        div()
            .id(("studio-instance", index))
            .role(gpui::Role::Button)
            .aria_label(item.settings.kind().label())
            .tab_index(0)
            .h(px(48.0))
            .w(px(180.0))
            .flex_none()
            .border_1()
            .border_color(gpui::rgba(orbit::line(cx)))
            .px(px(8.0))
            .rounded(px(orbit::skin(cx).radius.md))
            .flex()
            .items_center()
            .gap(px(6.0))
            .when(selected, |row| {
                orbit::nav_active(row, cx).shadow(orbit::selection_ring(cx))
            })
            .hover(|row| row.bg(rgb(orbit::surface_2(cx))))
            .child(
                div()
                    .size(px(30.0))
                    .flex_none()
                    .flex()
                    .items_center()
                    .justify_center()
                    .rounded(px(orbit::skin(cx).radius.sm))
                    .bg(rgb(orbit::surface_3(cx)))
                    .child(orbit::icon(
                        if lock.is_some() { "v-lock" } else { "v-studio" },
                        16.0,
                        orbit::ink_2(cx),
                    )),
            )
            .aria_selected(selected)
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .flex()
                    .flex_col()
                    .child(
                        text(item.settings.kind().label(), 12.0, 600, orbit::ink(cx), cx)
                            .whitespace_nowrap()
                            .overflow_hidden()
                            .text_ellipsis(),
                    )
                    .child(text(
                        if item.visible { "Visible" } else { "Oculto" },
                        10.0,
                        400,
                        orbit::ink_3(cx),
                        cx,
                    ))
                    .when_some(lock, |body, reason| {
                        body.child(text(reason, 10.0, 400, orbit::skin(cx).text3, cx))
                    }),
            )
            .child(
                div()
                    .id(("studio-visibility", index))
                    .role(gpui::Role::Button)
                    .aria_label(if item.visible {
                        "Ocultar widget"
                    } else {
                        "Mostrar widget"
                    })
                    .tab_index(0)
                    .child(visibility_icon(item.visible))
                    .on_click(cx.listener(move |this, _, _, cx| {
                        this.toggle_visibility_from_strip(&visibility_id, cx);
                        cx.stop_propagation();
                    })),
            )
            .on_click(cx.listener(move |this, _, window, cx| {
                this.select(id.clone(), cx);
                this.focus.focus(window, cx);
            }))
    }
    fn widget_actions(&self, cx: &mut Context<Self>) -> gpui::Div {
        div()
            .flex()
            .flex_col()
            .w(px(170.0))
            .flex_none()
            .gap(px(6.0))
            .when(self.catalog_open, |body| {
                body.child(text(
                    "Filtrar widgets del diseño",
                    12.0,
                    500,
                    orbit::ink_2(cx),
                    cx,
                ))
                .child(self.search.clone())
                .when_some(self.catalog.clone(), gpui::ParentElement::child)
            })
            .child(
                button("add-widget", "", cx)
                    .w_full()
                    .child(text("+  Añadir widget", 12.0, 600, orbit::ink_3(cx), cx))
                    .aria_label("Añadir widget")
                    .on_click(cx.listener(|this, _, _, cx| {
                        if !this.catalog_open {
                            this.catalog_open = true;
                            cx.notify();
                            return;
                        }
                        let kind = this
                            .catalog
                            .as_ref()
                            .and_then(|catalog| catalog.read(cx).state.selected)
                            .and_then(|index| Kind::ALL.get(index))
                            .copied();
                        if let Some(kind) = kind {
                            if let Some(reason) = widget_lock(this.access, kind) {
                                this.status = Err(reason.into());
                                cx.notify();
                                return;
                            }
                            this.catalog_open = false;
                            this.reset_fields();
                            this.edit(|editor| editor.add(kind), cx);
                        }
                    })),
            )
    }
    pub(super) fn toolbar_preview_mode(&self, cx: &mut Context<Self>) -> gpui::Div {
        let mut row = div()
            .flex()
            .items_center()
            .gap(px(4.0))
            .p(px(4.0))
            .rounded(px(orbit::skin(cx).radius.md))
            .bg(rgb(orbit::surface_2(cx)));
        for (id, label, example) in [
            ("studio-example", "Ejemplo", true),
            ("studio-live", "En vivo", false),
        ] {
            row = row.child(
                orbit::ghost_button(id, label, cx)
                    .when(self.example == example, |button| {
                        button.bg(rgb(orbit::surface_3(cx)))
                    })
                    .on_click(cx.listener(move |this, _, _, cx| {
                        this.cancel_drag(cx);
                        this.example = example;
                        this.real_photo = None;
                        this.rebuild(cx);
                    })),
            );
        }
        row
    }
    fn scenario_controls(&self, cx: &mut Context<Self>) -> gpui::Div {
        let kind = self
            .editor
            .selected()
            .map_or(Kind::Standings, |item| item.settings.kind());
        let snapshot = self.preview_snapshot(kind);
        let lap = snapshot
            .state
            .player_car()
            .and_then(|car| car.laps.current());
        let total = snapshot.state.session.laps_total.current();
        let laps = match (lap, total) {
            (Some(lap), Some(total)) => format!("Vuelta {lap} de {total}"),
            (Some(lap), None) => format!("Vuelta {lap}"),
            _ => "Vuelta —".into(),
        };
        let mut row = div()
            .flex()
            .flex_wrap()
            .items_center()
            .gap(px(6.0))
            .min_w_0()
            .child(text("Probar con", 11.0, 500, orbit::ink_3(cx), cx));
        for (index, scenario) in scenes::Scenario::ALL.into_iter().enumerate() {
            let label = scenario.label();
            let first = self
                .photos
                .iter()
                .position(|p| scenario.matches(&p.snapshot));
            row = if let Some(first) = first {
                let active = self.example
                    && self
                        .real_photo
                        .is_some_and(|i| scenario.matches(&self.photos[i].snapshot));
                row.child(
                    orbit::ghost_button(("studio-scenario", index), label, cx)
                        .h(px(30.0))
                        .px(px(8.0))
                        .flex_none()
                        .aria_selected(active)
                        .when(active, |b| orbit::nav_active(b, cx))
                        .on_click(cx.listener(move |this, _, _, cx| {
                            this.cancel_drag(cx);
                            this.example = true;
                            this.real_photo = Some(
                                this.photo_choice
                                    .as_ref()
                                    .and_then(|c| c.read(cx).state.selected)
                                    .filter(|i| scenario.matches(&this.photos[*i].snapshot))
                                    .unwrap_or(first),
                            );
                            this.rebuild(cx);
                        })),
                )
            } else {
                row.child(unavailable_scenario(index, label, scenario.reason(), cx))
            };
        }
        if self.example
            && self.real_photo.is_some()
            && let Some(choice) = &self.photo_choice
        {
            row = row.child(div().w(px(150.0)).flex_none().child(choice.clone()));
        }
        row.child(div().flex_1()).child(
            orbit::mono_text(laps, 10.0, orbit::ink_3(cx), cx)
                .whitespace_nowrap()
                .min_w_0()
                .overflow_hidden()
                .text_ellipsis(),
        )
    }
    pub(super) fn widget_strip(&self, cx: &mut Context<Self>) -> gpui::Div {
        orbit::neo_card(cx)
            .p(px(10.0))
            .gap(px(8.0))
            .flex_none()
            .child(
                div()
                    .flex()
                    .gap(px(8.0))
                    .min_w_0()
                    .child(
                        div()
                            .id("studio-widget-strip")
                            .flex_1()
                            .min_w_0()
                            .overflow_x_scroll()
                            .child(self.widget_list(cx)),
                    )
                    .child(self.widget_actions(cx)),
            )
            .child(self.scenario_controls(cx))
    }
}
