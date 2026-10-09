//! Catálogo interactivo aislado; `run_kit()` no prepara servicios del Hub.
use super::*;
use gpui::{App, Context, Entity, IntoElement, Render, Window, WindowOptions, div, px, rgb};
struct DialogContent {
    field: Entity<Input>,
    check: Entity<Checkbox>,
}
impl Render for DialogContent {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        card("Capa común · Tab queda dentro", cx).child(
            card_body()
                .gap(px(RADIUS_CONTROL))
                .child(self.field.clone())
                .child(self.check.clone())
                .child(text(
                    "Esc o clic fuera devuelve el foco al origen.",
                    SECONDARY,
                    400,
                    ink_3(cx),
                    cx,
                )),
        )
    }
}
pub struct Specimen {
    focus: gpui::FocusHandle,
    select: Entity<Choice>,
    tabs: Entity<Choice>,
    segmented: Entity<Choice>,
    list: Entity<Choice>,
    input: Entity<Input>,
    multiline: Entity<Input>,
    disabled_input: Entity<Input>,
    check: Entity<Checkbox>,
    disabled_check: Entity<Checkbox>,
    slider: Entity<NumberControl>,
    stepper: Entity<NumberControl>,
    modal: Entity<Layer>,
    popover: Entity<Layer>,
    status: String,
}
fn choices(labels: &[&str], disabled: Option<usize>) -> Vec<OptionItem> {
    labels
        .iter()
        .enumerate()
        .map(|(i, label)| OptionItem {
            label: (*label).into(),
            enabled: disabled != Some(i),
        })
        .collect()
}
fn layers(window: &mut Window, cx: &mut Context<Specimen>) -> (Entity<Layer>, Entity<Layer>) {
    let dialog = cx.new(|cx| DialogContent {
        field: cx.new(|cx| Input::new("Buscar comandos".into(), "Buscar", cx)),
        check: cx.new(|cx| Checkbox::new("Solo disponibles", true, cx)),
    });
    let targets = vec![
        dialog.read(cx).field.read(cx).focus_handle(),
        dialog.read(cx).check.read(cx).focus_handle(),
    ];
    let modal = cx.new(|cx| {
        Layer::new(
            "Modal Orbit",
            LayerKind::Modal,
            dialog.clone().into(),
            targets.clone(),
            window,
            cx,
        )
    });
    let popover = cx.new(|cx| {
        Layer::new(
            "Popover Orbit",
            LayerKind::Popover(gpui::point(px(GUTTER), px(TOPBAR_H))),
            dialog.into(),
            targets,
            window,
            cx,
        )
    });
    (modal, popover)
}
fn numbers(cx: &mut Context<Specimen>) -> (Entity<NumberControl>, Entity<NumberControl>) {
    let slider = cx.new(|cx| {
        NumberControl::new(
            "Opacidad",
            NumberKind::Slider,
            NumberRange {
                min: 0.0,
                max: 100.0,
                step: 5.0,
                value: 65.0,
            },
            cx,
        )
    });
    let stepper = cx.new(|cx| {
        NumberControl::new(
            "Zoom",
            NumberKind::Stepper,
            NumberRange {
                min: 50.0,
                max: 150.0,
                step: 5.0,
                value: 100.0,
            },
            cx,
        )
    });
    (slider, stepper)
}
impl Specimen {
    pub fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let focus = cx.focus_handle();
        focus.focus(window, cx);
        let select = cx.new(|cx| {
            Choice::new(
                "Idioma",
                ChoiceKind::Dropdown,
                choices(&["Español", "English", "Português", "Italiano"], Some(2)),
                Some(0),
                window,
                cx,
            )
        });
        let tabs = cx.new(|cx| {
            Choice::new(
                "Pestañas",
                ChoiceKind::Tabs,
                choices(&["Resumen", "Historial", "Archivo"], Some(2)),
                Some(0),
                window,
                cx,
            )
        });
        let segmented = cx.new(|cx| {
            Choice::new(
                "Densidad",
                ChoiceKind::Segmented,
                choices(&["Compacta", "Equilibrada", "Cómoda"], None),
                Some(1),
                window,
                cx,
            )
        });
        let input = cx.new(|cx| Input::new("Orbit · aé🏁 · IME".into(), "Una línea", cx));
        let multiline = cx.new(|cx| {
            Input::multiline(
                "Notas de carrera\nSelección con Shift + flechas\nTexto Unicode: 車 🏁".into(),
                "Multilínea",
                cx,
            )
        });
        let disabled_input = cx.new(|cx| {
            let mut input = Input::new("Solo lectura".into(), "Campo deshabilitado", cx);
            input.set_enabled(false, cx);
            input
        });
        let check = cx.new(|cx| Checkbox::new("Recordar preferencias", true, cx));
        let disabled_check = cx.new(|cx| {
            let mut check = Checkbox::new("Consentimiento deshabilitado", false, cx);
            check.enabled = false;
            check
        });
        let (slider, stepper) = numbers(cx);
        let list = cx.new(|cx| {
            Choice::new(
                "Perfiles",
                ChoiceKind::List,
                choices(
                    &["Perfil de carrera", "Perfil de pruebas", "Archivo"],
                    Some(2),
                ),
                Some(0),
                window,
                cx,
            )
        });
        let (modal, popover) = layers(window, cx);
        let specimen = Self {
            focus,
            select,
            tabs,
            segmented,
            list,
            input,
            multiline,
            disabled_input,
            check,
            disabled_check,
            slider,
            stepper,
            modal,
            popover,
            status: "Specimen local · valores de demostración".into(),
        };
        specimen.listen(cx);
        specimen
    }
    fn listen(&self, cx: &mut Context<Self>) {
        cx.subscribe(&self.select, |this, _, change: &ChoiceChanged, cx| {
            this.status = format!("Idioma: opción {}", change.0 + 1);
            cx.notify();
        })
        .detach();
        cx.subscribe(&self.slider, |this, _, change: &NumberChanged, cx| {
            this.status = format!("Opacidad: {}", change.0);
            cx.notify();
        })
        .detach();
        cx.subscribe(&self.check, |this, _, change: &Checked, cx| {
            this.status = format!("Recordar: {}", change.0);
            cx.notify();
        })
        .detach();
    }
    fn fields(&self, cx: &gpui::App) -> gpui::Div {
        card("Campos y selección", cx)
            .flex_1()
            .min_w(px(COLUMN_W))
            .child(
                card_body()
                    .gap(px(RADIUS_CONTROL))
                    .child(setting_row(
                        "Idioma",
                        "Flechas · Enter · Esc",
                        self.select.clone(),
                        cx,
                    ))
                    .child(self.input.clone())
                    .child(self.multiline.clone())
                    .child(self.disabled_input.clone())
                    .child(self.tabs.clone())
                    .child(self.segmented.clone()),
            )
    }
    fn controls(&self, cx: &mut Context<Self>) -> gpui::Div {
        let modal =
            button("kit-modal", "Abrir modal", cx).on_click(cx.listener(|this, _, window, cx| {
                this.modal.update(cx, |layer, cx| {
                    layer.show(window, cx);
                });
            }));
        let popover = button("kit-popover", "Abrir popover", cx).on_click(cx.listener(
            |this, _, window, cx| {
                this.popover.update(cx, |layer, cx| {
                    layer.show(window, cx);
                });
            },
        ));
        card("Controles y estados", cx)
            .flex_1()
            .min_w(px(COLUMN_W))
            .child(
                card_body()
                    .gap(px(RADIUS_CONTROL))
                    .child(self.check.clone())
                    .child(self.disabled_check.clone())
                    .child(setting_row(
                        "Opacidad",
                        "Arrastrar · flechas · Home/End",
                        self.slider.clone(),
                        cx,
                    ))
                    .child(setting_row(
                        "Zoom",
                        "Pasos de 5 · límites 50–150",
                        self.stepper.clone(),
                        cx,
                    ))
                    .child(
                        div()
                            .flex()
                            .flex_wrap()
                            .gap(px(RADIUS_CHIP))
                            .child(chip("Pro Plus", Tone::Gold, cx))
                            .child(chip("Nightly", Tone::Accent, cx))
                            .child(chip("Bronze", Tone::Bronze, cx))
                            .child(chip("Silver", Tone::Silver, cx))
                            .child(badge(3, Tone::Danger, cx)),
                    )
                    .child(
                        div()
                            .flex()
                            .flex_wrap()
                            .gap(px(RADIUS_CHIP))
                            .child(pill("Conectado", Tone::Success, cx))
                            .child(pill("Buscando", Tone::Warning, cx))
                            .child(pill("Sin fuente", Tone::Neutral, cx)),
                    )
                    .child(
                        div()
                            .flex()
                            .gap(px(RADIUS_CHIP))
                            .child(profile_avatar("profile", "Isaac Albala", true, true, cx))
                            .child(profile_avatar("empty-profile", "", false, false, cx)),
                    )
                    .child(
                        div()
                            .flex()
                            .gap(px(RADIUS_CHIP))
                            .child(modal)
                            .child(popover),
                    ),
            )
    }
    fn records(&self, cx: &gpui::App) -> gpui::Div {
        let table = Table {
            headers: ["Perfil", "Canal", "Estado"].map(String::from).into(),
            rows: vec![
                ["Orbit", "Nightly", "Disponible"].map(String::from).into(),
                ["Carrera", "Testers", "Pendiente"].map(String::from).into(),
            ],
        };
        let table_view = match table.render(cx) {
            Ok(view) => view.into_any_element(),
            Err(error) => callout(error, cx).into_any_element(),
        };
        div()
            .flex()
            .flex_wrap()
            .items_start()
            .gap(px(RADIUS))
            .child(
                card("Lista", cx)
                    .flex_1()
                    .min_w(px(COLUMN_W))
                    .child(card_body().child(self.list.clone())),
            )
            .child(
                card("Tabla", cx)
                    .flex_1()
                    .min_w(px(COLUMN_W))
                    .child(table_view),
            )
    }
}
impl Render for Specimen {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        div()
            .id("kit-root")
            .track_focus(&self.focus.clone().tab_stop(false))
            .tab_index(0)
            .tab_stop(false)
            .on_key_down(cx.listener(|_, event: &gpui::KeyDownEvent, window, cx| {
                if event.keystroke.key == "tab" {
                    if event.keystroke.modifiers.shift {
                        window.focus_prev(cx);
                    } else {
                        window.focus_next(cx);
                    }
                    cx.stop_propagation();
                }
            }))
            .size_full()
            .relative()
            .bg(rgb(canvas(cx)))
            .text_color(rgb(ink(cx)))
            .font_family(sans_family(500, cx))
            .flex()
            .flex_col()
            .child(topbar(
                "KIT ORBIT",
                "Specimen",
                pill("Demostración local", Tone::Warning, cx),
                cx,
            ))
            .child(
                div()
                    .id("kit-scroll")
                    .flex_1()
                    .overflow_y_scroll()
                    .p(px(GUTTER))
                    .flex()
                    .flex_col()
                    .gap(px(RADIUS))
                    .child(page_header(
                        "COMPONENTES",
                        "Orbit",
                        "Tokens del Hub · estados y teclado · sin servicios ni persistencia",
                        cx,
                    ))
                    .child(
                        div()
                            .flex()
                            .flex_wrap()
                            .items_start()
                            .gap(px(RADIUS))
                            .child(self.fields(cx))
                            .child(self.controls(cx)),
                    )
                    .child(self.records(cx))
                    .child(card("Estado vacío", cx).child(empty_state(
                        "Sin resultados",
                        "Cambia los filtros para ampliar la búsqueda.",
                        cx,
                    )))
                    .child(text(self.status.clone(), SECONDARY, 400, ink_3(cx), cx)),
            )
            .child(self.modal.clone())
            .child(self.popover.clone())
    }
}
/// Entrada aislada: no prepara IPC, Launcher ni datos del usuario.
pub fn run_kit() -> Result<(), String> {
    let failure = std::rc::Rc::new(std::cell::RefCell::new(None));
    let result = failure.clone();
    gpui_platform::application()
        .with_assets(crate::shell::assets::Icons)
        .run(move |cx: &mut App| {
            cx.set_global(super::theme::Theme::default());
            if let Err(error) = vantare_ui::efficiency::text::register_fonts(cx)
                .and_then(|()| super::design::register_fonts(cx))
            {
                *failure.borrow_mut() = Some(error);
                cx.quit();
                return;
            }
            let options = WindowOptions {
                titlebar: Some(gpui::TitlebarOptions {
                    title: Some("Vantare Hub — Orbit Kit".into()),
                    ..Default::default()
                }),
                ..Default::default()
            };
            if let Err(error) = cx.open_window(options, |window, cx| {
                super::theme::install(super::theme::AppearanceSettings::default(), window, cx);
                cx.new(|cx| Specimen::new(window, cx))
            }) {
                *failure.borrow_mut() = Some(format!("abrir kit: {error}"));
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
