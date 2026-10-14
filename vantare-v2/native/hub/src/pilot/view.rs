//! Editor del perfil privado del piloto (#1612), pestaña Cuenta de Ajustes.
//!
//! Compone Orbit y emite [`PilotEvent`]; no lee disco, red ni sesión.
use super::{COUNTRIES, Crop, DESCRIPTION_MAX, Draft, SIMULATORS, country_label, simulator_label};
use crate::orbit::{self, Choice, ChoiceKind, Input, OptionItem, Tone};
use gpui::{
    Context, Div, Entity, EventEmitter, FocusHandle, Image, IntoElement, Pixels, Point, Render,
    Stateful, Window, div, prelude::*, px, rgb, rgba,
};
use std::sync::Arc;

#[cfg(all(test, windows))]
pub(crate) mod initial_load_tests;

/// Peticiones al propietario del modelo; el editor no persiste nada.
#[derive(Clone, Debug, PartialEq)]
pub enum PilotEvent {
    Discard,
    /// Guardar estos datos (ya recortados y válidos).
    Save(Draft),
    /// Abrir el selector de foto; el propietario valida y llama a [`PilotEditor::begin_crop`].
    ChoosePhoto,
    /// Procesar la foto elegida con este recorte y llamar a [`PilotEditor::set_photo`].
    ApplyCrop(Crop),
    RemovePhoto,
    /// Sesión, plan y dispositivos siguen en la sección Cuenta.
    OpenAccount,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Action {
    ChoosePhoto,
    RemovePhoto,
    ZoomIn,
    ZoomOut,
    ApplyCrop,
    CancelCrop,
    Discard,
    Save,
    OpenAccount,
}
const ACTIONS: usize = 9;
impl Action {
    fn enabled(self, busy: bool) -> bool {
        !busy || matches!(self, Self::OpenAccount)
    }
}

/// Foto original en recorte; las medidas son las de la imagen decodificada.
struct Source {
    image: Arc<Image>,
    width: u32,
    height: u32,
    crop: Crop,
    drag: Option<Point<Pixels>>,
}
impl Source {
    fn zoom(&mut self, factor: f32, busy: bool) {
        if busy {
            return;
        }
        self.crop = self.crop.zoomed(factor, self.width, self.height);
    }
    fn nudge(&mut self, dx: f32, dy: f32, busy: bool) {
        if busy {
            return;
        }
        self.crop = self.crop.moved(dx, dy, self.width, self.height);
    }
}

pub struct PilotEditor {
    saved: Draft,
    loaded: bool,
    name: Entity<Input>,
    description: Entity<Input>,
    car: Entity<Input>,
    team: Entity<Input>,
    country: Entity<Choice>,
    simulators: Vec<String>,
    photo: Option<Arc<Image>>,
    saved_photo: Option<Arc<Image>>,
    photo_changed: bool,
    source: Option<Source>,
    status: Option<String>,
    busy: bool,
    action_focus: [FocusHandle; ACTIONS],
    simulator_focus: Vec<FocusHandle>,
    crop_focus: FocusHandle,
}

impl EventEmitter<PilotEvent> for PilotEditor {}

/// Opciones del país: «Sin indicar», la lista y, si hace falta, el código guardado.
fn country_options(country: Option<&str>) -> (Vec<OptionItem>, usize) {
    let mut options: Vec<_> = std::iter::once("Sin indicar")
        .chain(COUNTRIES.iter().map(|(_, label)| *label))
        .map(OptionItem::new)
        .collect();
    let selected = country.map_or(0, |code| {
        if let Some(index) = COUNTRIES
            .iter()
            .position(|(known, _)| known.eq_ignore_ascii_case(code))
        {
            index + 1
        } else {
            options.push(OptionItem::new(code.to_ascii_uppercase()));
            options.len() - 1
        }
    });
    (options, selected)
}

impl PilotEditor {
    pub fn new(draft: Draft, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let input = |value: &str, label, cx: &mut Context<Self>| {
            let input = cx.new(|cx| Input::new(value.to_owned(), label, cx));
            cx.observe(&input, |_, _, cx| cx.notify()).detach();
            input
        };
        let name = input(&draft.public_name, "Nombre público", cx);
        let car = input(&draft.favorite_car, "Coche favorito", cx);
        let team = input(&draft.favorite_team, "Equipo favorito", cx);
        let description = cx.new(|cx| {
            Input::multiline(draft.description.clone(), "Descripción corta", cx)
                .with_height(px(76.0))
        });
        cx.observe(&description, |_, _, cx| cx.notify()).detach();
        let (options, selected) = country_options(draft.country.as_deref());
        let country = cx.new(|cx| {
            Choice::new(
                "País",
                ChoiceKind::Dropdown,
                options,
                Some(selected),
                window,
                cx,
            )
        });
        cx.observe(&country, |_, _, cx| cx.notify()).detach();
        Self {
            simulators: draft.simulators.clone(),
            saved: draft,
            loaded: false,
            name,
            description,
            car,
            team,
            country,
            photo: None,
            saved_photo: None,
            photo_changed: false,
            source: None,
            status: None,
            busy: false,
            action_focus: std::array::from_fn(|_| cx.focus_handle()),
            simulator_focus: SIMULATORS.iter().map(|_| cx.focus_handle()).collect(),
            crop_focus: cx.focus_handle(),
        }
    }

    /// Sustituye el formulario por datos recién leídos o sincronizados.
    pub fn load(&mut self, draft: Draft, cx: &mut Context<Self>) {
        for (input, value) in [
            (&self.name, &draft.public_name),
            (&self.description, &draft.description),
            (&self.car, &draft.favorite_car),
            (&self.team, &draft.favorite_team),
        ] {
            let value = value.clone();
            input.update(cx, |input, cx| input.set_value(value, cx));
        }
        let (options, selected) = country_options(draft.country.as_deref());
        self.country.update(cx, |choice, cx| {
            choice.state = orbit::ChoiceState::new(options, Some(selected));
            cx.notify();
        });
        self.simulators.clone_from(&draft.simulators);
        self.saved = draft;
        self.loaded = true;
        self.status = None;
        cx.notify();
    }

    /// Confirma que `draft` quedó guardado sin tocar lo que se esté escribiendo.
    pub fn mark_saved(&mut self, draft: Draft, cx: &mut Context<Self>) {
        self.saved = draft;
        self.loaded = true;
        self.busy = false;
        self.status = Some("Perfil guardado.".into());
        cx.notify();
    }

    /// Foto final ya procesada (JPEG 256×256); `None` muestra las iniciales.
    pub fn set_photo(&mut self, photo: Option<Arc<Image>>, cx: &mut Context<Self>) {
        self.photo_changed = photo_diff(photo.as_ref(), self.saved_photo.as_ref());
        self.photo = photo;
        self.source = None;
        self.busy = false;
        cx.notify();
    }

    pub fn set_saved_photo(&mut self, photo: Option<Arc<Image>>, cx: &mut Context<Self>) {
        self.saved_photo.clone_from(&photo);
        self.set_photo(photo, cx);
    }

    /// Una primera carga tardía incorpora los campos no editados y conserva los editados.
    pub fn load_preserving_edits(&mut self, draft: Draft, cx: &mut Context<Self>) {
        let merged = self.draft(cx).merge_edited(&self.saved, &draft);
        self.load(merged, cx);
        self.saved = draft;
    }

    pub fn saved_draft(&self) -> &Draft {
        &self.saved
    }

    /// Tras logout no se puede guardar contra el perfil anterior.
    pub fn reset_for_load(&mut self, cx: &mut Context<Self>) {
        self.load(Draft::default(), cx);
        self.loaded = false;
    }

    /// Abre el recorte de una foto ya validada por servicios.
    pub fn begin_crop(
        &mut self,
        image: Arc<Image>,
        width: u32,
        height: u32,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.source = Some(Source {
            image,
            width,
            height,
            crop: Crop::centered(width, height),
            drag: None,
        });
        self.busy = false;
        self.crop_focus.focus(window, cx);
        cx.notify();
    }

    /// Mensaje del propietario (error de guardado, foto rechazada…).
    pub fn set_status(&mut self, status: Option<String>, cx: &mut Context<Self>) {
        self.status = status;
        self.busy = false;
        cx.notify();
    }

    /// Datos actuales del formulario, sin recortar.
    pub fn draft(&self, cx: &gpui::App) -> Draft {
        let selected = self.country.read(cx).state.selected.unwrap_or(0);
        Draft {
            public_name: self.name.read(cx).value.clone(),
            description: self.description.read(cx).value.clone(),
            country: match selected {
                0 => None,
                index => COUNTRIES
                    .get(index - 1)
                    .map(|(code, _)| (*code).to_owned())
                    .or_else(|| self.saved.country.clone()),
            },
            simulators: SIMULATORS
                .iter()
                .map(|(id, _)| *id)
                .filter(|id| self.simulators.iter().any(|chosen| chosen == id))
                .map(str::to_owned)
                .chain(
                    // Conserva simuladores que este catálogo aún no conoce.
                    self.simulators
                        .iter()
                        .filter(|id| SIMULATORS.iter().all(|(known, _)| known != id))
                        .cloned(),
                )
                .collect(),
            favorite_car: self.car.read(cx).value.clone(),
            favorite_team: self.team.read(cx).value.clone(),
        }
    }

    pub(super) fn dirty(&self, cx: &gpui::App) -> bool {
        has_changes(&self.draft(cx), &self.saved, self.photo_changed)
    }

    pub(super) fn discard_changes(&mut self, cx: &mut Context<Self>) {
        let saved = self.saved.clone();
        let loaded = self.loaded;
        self.load(saved, cx);
        self.loaded = loaded;
        self.set_photo(self.saved_photo.clone(), cx);
        cx.emit(PilotEvent::Discard);
    }

    fn act(&mut self, action: Action, window: &mut Window, cx: &mut Context<Self>) {
        if !action.enabled(self.busy) || (action == Action::Save && !self.loaded) {
            return;
        }
        match action {
            Action::ChoosePhoto => {
                self.busy = true;
                cx.emit(PilotEvent::ChoosePhoto);
            }
            Action::RemovePhoto => {
                if self.photo.is_some() {
                    self.busy = true;
                    cx.emit(PilotEvent::RemovePhoto);
                }
            }
            Action::ZoomIn => self.zoom(1.25),
            Action::ZoomOut => self.zoom(0.8),
            Action::ApplyCrop => {
                if let Some(source) = &mut self.source {
                    source.drag = None;
                    self.busy = true;
                    cx.emit(PilotEvent::ApplyCrop(source.crop));
                }
            }
            Action::CancelCrop => self.source = None,
            Action::Discard => {
                self.discard_changes(cx);
            }
            Action::Save => {
                let draft = self.draft(cx).trimmed();
                if let Some(problem) = draft.problem() {
                    self.status = Some(problem.into());
                    self.focus_problem(&draft, window, cx);
                } else {
                    self.busy = true;
                    self.status = None;
                    cx.emit(PilotEvent::Save(draft));
                }
            }
            Action::OpenAccount => cx.emit(PilotEvent::OpenAccount),
        }
        cx.notify();
    }

    fn focus_problem(&self, draft: &Draft, window: &mut Window, cx: &mut Context<Self>) {
        let count = |value: &str| value.chars().count();
        let target = if draft.public_name.is_empty() || count(&draft.public_name) > super::NAME_MAX
        {
            &self.name
        } else if count(&draft.description) > DESCRIPTION_MAX {
            &self.description
        } else if count(&draft.favorite_car) > super::FAVORITE_MAX {
            &self.car
        } else {
            &self.team
        };
        target.read(cx).focus_handle().focus(window, cx);
    }

    fn zoom(&mut self, factor: f32) {
        if let Some(source) = &mut self.source {
            source.zoom(factor, self.busy);
        }
    }

    fn nudge(&mut self, dx: f32, dy: f32) {
        if let Some(source) = &mut self.source {
            source.nudge(dx, dy, self.busy);
        }
    }

    fn toggle_simulator(&mut self, id: &str, cx: &mut Context<Self>) {
        if let Some(index) = self.simulators.iter().position(|chosen| chosen == id) {
            self.simulators.remove(index);
        } else {
            self.simulators.push(id.to_owned());
        }
        cx.notify();
    }

    /// Botón con foco propio, clic y Enter/Espacio; desactivado sin foco ni acción.
    fn action(
        &self,
        button: Stateful<Div>,
        action: Action,
        enabled: bool,
        cx: &mut Context<Self>,
    ) -> Stateful<Div> {
        let focus = self.action_focus[action as usize].clone();
        button
            .track_focus(&focus)
            .tab_stop(enabled)
            .when(!enabled, |button| button.opacity(orbit::DISABLED))
            .on_click(cx.listener(move |this, _, window, cx| {
                if enabled {
                    this.action_focus[action as usize].focus(window, cx);
                    this.act(action, window, cx);
                }
            }))
            .on_key_down(
                cx.listener(move |this, event: &gpui::KeyDownEvent, window, cx| {
                    if enabled && matches!(event.keystroke.key.as_str(), "enter" | "space") {
                        this.act(action, window, cx);
                        cx.stop_propagation();
                    }
                }),
            )
    }
}

/// Avatar circular: foto procesada o iniciales sobre el degradado del acento.
fn avatar(name: &str, photo: Option<&Arc<Image>>, size: f32, cx: &gpui::App) -> Div {
    let skin = orbit::skin(cx);
    let initials = orbit::initials(name);
    div()
        .size(px(size))
        .flex_none()
        .rounded_full()
        .overflow_hidden()
        .flex()
        .items_center()
        .justify_center()
        .bg(orbit::gradient(
            [skin.accent, orbit::carmine_dark(cx)],
            135.0,
        ))
        .child(orbit::display(
            initials.clone(),
            size * 0.36,
            0x00ff_ffff,
            cx,
        ))
        .when_some(photo.cloned(), |avatar, photo| {
            avatar.relative().child(
                gpui::img(photo)
                    .absolute()
                    .size_full()
                    .rounded_full()
                    .object_fit(gpui::ObjectFit::Cover)
                    .with_fallback(move || div().into_any_element()),
            )
        })
}

/// Bandera del país con el mismo dibujo de franjas que los widgets; si no hay
/// franjas para ese país, el código ISO en una placa del mismo tamaño.
pub fn flag(country: &str, height: f32, cx: &gpui::App) -> Div {
    use vantare_ui::pilot_flag::{ASPECT, Bands};
    let width = (height * ASPECT).round();
    let plate = div()
        .w(px(width))
        .h(px(height))
        .flex_none()
        .rounded(px(3.0))
        .overflow_hidden()
        .border_1()
        .border_color(rgba(0x0000_002e));
    let Some(flag) = vantare_ui::pilot_flag::flag(country) else {
        return plate
            .flex()
            .items_center()
            .justify_center()
            .bg(rgb(orbit::surface_3(cx)))
            .child(orbit::meta(
                &country.to_ascii_uppercase(),
                height * 0.5,
                orbit::ink(cx),
                cx,
            ));
    };
    let total: f32 = flag
        .stripes
        .iter()
        .map(|(_, weight)| f32::from(*weight))
        .sum();
    plate
        .flex()
        .when(flag.bands == Bands::Horizontal, Styled::flex_col)
        .children(flag.stripes.iter().map(|(color, weight)| {
            let share = f32::from(*weight) / total;
            let stripe = div().bg(rgb(*color)).flex_none();
            if flag.bands == Bands::Horizontal {
                stripe.w_full().h(px(height * share))
            } else {
                stripe.h_full().w(px(width * share))
            }
        }))
}

fn field(
    label: &str,
    counter: Option<(usize, usize)>,
    control: impl IntoElement,
    cx: &gpui::App,
) -> Div {
    div()
        .flex()
        .flex_col()
        .gap(px(8.0))
        .min_w_0()
        .child(
            div()
                .flex()
                .justify_between()
                .items_baseline()
                .child(orbit::tracked_text(
                    label.to_owned(),
                    12.0,
                    600,
                    orbit::ink_3(cx),
                    0.0,
                    cx,
                ))
                .when_some(counter, |row, (used, max)| {
                    row.child(orbit::mono_text(
                        format!("{used}/{max}"),
                        11.0,
                        if used > max {
                            orbit::red(cx)
                        } else {
                            orbit::ink_3(cx)
                        },
                        cx,
                    ))
                }),
        )
        .child(div().w_full().child(control))
}

fn group(number: usize, title: &str, body: impl IntoElement, cx: &gpui::App) -> Div {
    orbit::settings_group(
        number,
        title,
        orbit::neo_card(cx).p(px(20.0)).child(body),
        cx,
    )
}

impl PilotEditor {
    /// Tarjeta «Así te ves»: lo que verán los equipos cuando el perfil se comparta.
    #[allow(clippy::too_many_lines)] // Composición visual sin lógica de negocio.
    fn preview(&self, draft: &Draft, cx: &gpui::App) -> Div {
        let skin = orbit::skin(cx);
        let name = draft.public_name.trim();
        let description = draft.description.trim();
        let favorite = |label: &str, value: &str| {
            div()
                .flex()
                .justify_between()
                .gap(px(12.0))
                .child(orbit::caps(label, 10.5, orbit::ink_3(cx), cx))
                .child(
                    orbit::text(
                        if value.trim().is_empty() {
                            "—".to_owned()
                        } else {
                            value.trim().to_owned()
                        },
                        13.0,
                        600,
                        orbit::ink(cx),
                        cx,
                    )
                    .text_ellipsis()
                    .min_w_0(),
                )
        };
        orbit::neo_card(cx)
            .p(px(22.0))
            .flex()
            .flex_col()
            .gap(px(14.0))
            .child(
                div()
                    .flex()
                    .justify_between()
                    .items_center()
                    .child(orbit::eyebrow("Así te ves", cx))
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(6.0))
                            .child(orbit::icon("v-lock", 12.0, orbit::ink_3(cx)))
                            .child(orbit::text("Solo tú", 11.5, 600, orbit::ink_3(cx), cx)),
                    ),
            )
            .child(
                div()
                    .self_center()
                    .relative()
                    .p(px(3.0))
                    .rounded_full()
                    .border_2()
                    .border_color(orbit::tint(skin.accent, 0.55))
                    .child(avatar(name, self.photo.as_ref(), 104.0, cx))
                    .when_some(draft.country.as_deref(), |ring, country| {
                        ring.child(
                            div()
                                .absolute()
                                .right(px(-4.0))
                                .bottom(px(6.0))
                                .p(px(2.0))
                                .rounded(px(5.0))
                                .bg(rgb(skin.l1))
                                .child(flag(country, 18.0, cx)),
                        )
                    }),
            )
            .child(
                div()
                    .flex()
                    .flex_col()
                    .items_center()
                    .gap(px(4.0))
                    .child(
                        orbit::display(
                            if name.is_empty() {
                                "Tu nombre público".to_owned()
                            } else {
                                name.to_owned()
                            },
                            24.0,
                            if name.is_empty() {
                                orbit::ink_3(cx)
                            } else {
                                orbit::ink(cx)
                            },
                            cx,
                        )
                        .text_ellipsis()
                        .max_w_full(),
                    )
                    .child(orbit::caps(
                        draft
                            .country
                            .as_deref()
                            .map_or("País sin indicar", country_label),
                        11.0,
                        orbit::ink_3(cx),
                        cx,
                    )),
            )
            .child(
                orbit::text(
                    if description.is_empty() {
                        "Cuenta en una frase cómo corres.".to_owned()
                    } else {
                        description.to_owned()
                    },
                    13.0,
                    400,
                    if description.is_empty() {
                        orbit::ink_3(cx)
                    } else {
                        orbit::ink_2(cx)
                    },
                    cx,
                )
                .text_center(),
            )
            .child(div().h(px(1.0)).bg(rgba(orbit::line_row(cx))))
            .child(
                div()
                    .flex()
                    .flex_wrap()
                    .justify_center()
                    .gap(px(6.0))
                    .when(draft.simulators.is_empty(), |chips| {
                        chips.child(orbit::chip("Sin simuladores", Tone::Neutral, cx))
                    })
                    .children(
                        draft
                            .simulators
                            .iter()
                            .map(|id| orbit::chip(simulator_label(id), Tone::Accent, cx)),
                    ),
            )
            .child(
                div()
                    .flex()
                    .flex_col()
                    .gap(px(8.0))
                    .child(favorite("Coche", &draft.favorite_car))
                    .child(favorite("Equipo", &draft.favorite_team)),
            )
    }

    fn photo_group(&self, name: &str, cx: &mut Context<Self>) -> Div {
        let has_photo = self.photo.is_some();
        let body = div()
            .flex()
            .flex_col()
            .gap(px(16.0))
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(16.0))
                    .child(avatar(name, self.photo.as_ref(), 56.0, cx))
                    .child(
                        div()
                            .flex_1()
                            .min_w_0()
                            .flex()
                            .flex_col()
                            .gap(px(2.0))
                            .child(orbit::text("Foto de perfil", 14.0, 600, orbit::ink(cx), cx))
                            .child(orbit::text(
                                "JPEG o PNG de hasta 5 MB. Se recorta en círculo y se guarda a 256 px.",
                                12.0,
                                400,
                                orbit::ink_3(cx),
                                cx,
                            )),
                    )
                    .child(self.action(
                        orbit::small_button(
                            "pilot-photo-choose",
                            if has_photo { "Cambiar foto" } else { "Elegir foto" },
                            cx,
                        ),
                        Action::ChoosePhoto,
                        !self.busy && self.source.is_none(),
                        cx,
                    ))
                    .when(has_photo, |row| {
                        row.child(self.action(
                            orbit::small_button("pilot-photo-remove", "Quitar", cx),
                            Action::RemovePhoto,
                            !self.busy && self.source.is_none(),
                            cx,
                        ))
                    }),
            )
            .when_some(self.source.as_ref(), |body, source| body.child(self.cropper(source, cx)));
        group(1, "Foto", body, cx)
    }

    /// Recorte: arrastrar mueve, rueda o botones acercan; flechas y +/− con teclado.
    #[allow(clippy::cast_precision_loss, clippy::too_many_lines)] // Fotos ≤ 4096 px; composición y eventos del recorte.
    fn cropper(&self, source: &Source, cx: &mut Context<Self>) -> Div {
        const BOX: (f32, f32) = (320.0, 220.0);
        let (w, h) = (source.width.max(1) as f32, source.height.max(1) as f32);
        let scale = (BOX.0 / w).min(BOX.1 / h);
        let (dw, dh) = ((w * scale).round(), (h * scale).round());
        let crop = source.crop;
        let (x, y) = (crop.x * dw, crop.y * dh);
        let side = crop.side * dw.min(dh);
        let veil = |left: f32, top: f32, width: f32, height: f32| {
            div()
                .absolute()
                .left(px(left))
                .top(px(top))
                .w(px(width.max(0.0)))
                .h(px(height.max(0.0)))
                .bg(rgba(0x0000_008c))
        };
        let stage = div()
            .id("pilot-crop")
            .role(gpui::Role::Image)
            .aria_label("Recorte de la foto: arrastra para mover, rueda para acercar")
            .track_focus(&self.crop_focus)
            .tab_stop(true)
            .relative()
            .w(px(dw))
            .h(px(dh))
            .flex_none()
            .rounded(px(8.0))
            .overflow_hidden()
            .cursor_grab()
            .focus_visible(|s| s.border_2().border_color(orbit::selection_border(cx)))
            .child(gpui::img(source.image.clone()).absolute().size_full())
            .child(veil(0.0, 0.0, dw, y))
            .child(veil(0.0, y + side, dw, dh - y - side))
            .child(veil(0.0, y, x, side))
            .child(veil(x + side, y, dw - x - side, side))
            .child(
                div()
                    .absolute()
                    .left(px(x))
                    .top(px(y))
                    .size(px(side))
                    .border_1()
                    .border_color(rgba(0xffff_ff66))
                    .child(
                        div()
                            .size_full()
                            .rounded_full()
                            .border_2()
                            .border_color(rgba(0xffff_ffe6)),
                    ),
            )
            .on_mouse_down(
                gpui::MouseButton::Left,
                cx.listener(|this, event: &gpui::MouseDownEvent, window, cx| {
                    if this.busy {
                        return;
                    }
                    this.crop_focus.focus(window, cx);
                    if let Some(source) = &mut this.source {
                        source.drag = Some(event.position);
                    }
                }),
            )
            .on_mouse_move(
                cx.listener(move |this, event: &gpui::MouseMoveEvent, _, cx| {
                    if this.busy {
                        return;
                    }
                    let Some(source) = &mut this.source else {
                        return;
                    };
                    let Some(last) = source.drag else { return };
                    if event.pressed_button != Some(gpui::MouseButton::Left) {
                        source.drag = None;
                        return;
                    }
                    let delta = event.position - last;
                    source.drag = Some(event.position);
                    this.nudge(f32::from(delta.x) / dw, f32::from(delta.y) / dh);
                    cx.notify();
                }),
            )
            .on_mouse_up(
                gpui::MouseButton::Left,
                cx.listener(|this, _: &gpui::MouseUpEvent, _, _| {
                    if let Some(source) = &mut this.source {
                        source.drag = None;
                    }
                }),
            )
            .on_scroll_wheel(cx.listener(|this, event: &gpui::ScrollWheelEvent, _, cx| {
                let delta = event.delta.pixel_delta(px(24.0)).y;
                if delta != px(0.0) {
                    this.zoom(if delta > px(0.0) { 1.1 } else { 1.0 / 1.1 });
                    cx.stop_propagation();
                    cx.notify();
                }
            }))
            .on_key_down(cx.listener(|this, event: &gpui::KeyDownEvent, _, cx| {
                const STEP: f32 = 0.02;
                match event.keystroke.key.as_str() {
                    "left" => this.nudge(-STEP, 0.0),
                    "right" => this.nudge(STEP, 0.0),
                    "up" => this.nudge(0.0, -STEP),
                    "down" => this.nudge(0.0, STEP),
                    "+" | "=" => this.zoom(1.25),
                    "-" => this.zoom(0.8),
                    _ => return,
                }
                cx.stop_propagation();
                cx.notify();
            }));
        div()
            .flex()
            .flex_wrap()
            .gap(px(16.0))
            .p(px(14.0))
            .rounded(px(10.0))
            .bg(rgb(orbit::surface_2(cx)))
            .child(stage)
            .child(
                div()
                    .flex_1()
                    .min_w(px(180.0))
                    .flex()
                    .flex_col()
                    .gap(px(10.0))
                    .child(orbit::text("Ajusta el recorte", 14.0, 600, orbit::ink(cx), cx))
                    .child(orbit::text(
                        "Arrastra para centrar tu cara. Lo que queda dentro del círculo es tu foto.",
                        12.0,
                        400,
                        orbit::ink_3(cx),
                        cx,
                    ))
                    .child(
                        div()
                            .flex()
                            .gap(px(8.0))
                            .child(self.action(
                                orbit::small_button("pilot-crop-out", "Alejar", cx),
                                Action::ZoomOut,
                                crop.side < 1.0,
                                cx,
                            ))
                            .child(self.action(
                                orbit::small_button("pilot-crop-in", "Acercar", cx),
                                Action::ZoomIn,
                                crop.side > super::CROP_MIN_SIDE,
                                cx,
                            )),
                    )
                    .child(div().flex_1())
                    .child(
                        div()
                            .flex()
                            .gap(px(8.0))
                            .child(self.action(
                                orbit::small_button("pilot-crop-cancel", "Cancelar", cx),
                                Action::CancelCrop,
                                Action::CancelCrop.enabled(self.busy),
                                cx,
                            ))
                            .child(self.action(
                                orbit::carmine_button("pilot-crop-apply", "Usar esta foto", cx),
                                Action::ApplyCrop,
                                !self.busy,
                                cx,
                            )),
                    ),
            )
    }

    fn details_group(&self, draft: &Draft, cx: &gpui::App) -> Div {
        let count = |value: &str| value.trim().chars().count();
        let body = div()
            .flex()
            .flex_col()
            .gap(px(16.0))
            .child(
                div()
                    .flex()
                    .gap(px(16.0))
                    .child(
                        field(
                            "Nombre público",
                            Some((count(&draft.public_name), super::NAME_MAX)),
                            self.name.clone(),
                            cx,
                        )
                        .flex_1(),
                    )
                    .child(
                        field("País", None, self.country.clone(), cx)
                            .w(px(220.0))
                            .flex_none(),
                    ),
            )
            .child(field(
                "Descripción corta",
                Some((count(&draft.description), DESCRIPTION_MAX)),
                self.description.clone(),
                cx,
            ))
            .child(
                div()
                    .flex()
                    .gap(px(16.0))
                    .child(field("Coche favorito", None, self.car.clone(), cx).flex_1())
                    .child(field("Equipo favorito", None, self.team.clone(), cx).flex_1()),
            );
        group(2, "Datos del piloto", body, cx)
    }

    fn simulators_group(&self, cx: &mut Context<Self>) -> Div {
        let skin = orbit::skin(cx).clone();
        let chips = SIMULATORS.iter().enumerate().map(|(index, (id, label))| {
            let on = self.simulators.iter().any(|chosen| chosen == id);
            div()
                .id(("pilot-sim", index))
                .role(gpui::Role::CheckBox)
                .aria_label(*label)
                .aria_toggled(if on {
                    gpui::Toggled::True
                } else {
                    gpui::Toggled::False
                })
                .track_focus(&self.simulator_focus[index])
                .tab_stop(true)
                .h(px(32.0))
                .px(px(14.0))
                .flex()
                .items_center()
                .gap(px(6.0))
                .rounded_full()
                .border_1()
                .cursor_pointer()
                .when(on, |chip| {
                    chip.bg(orbit::tint(skin.accent, 0.16))
                        .border_color(orbit::tint(skin.accent, 0.7))
                        .child(orbit::icon("check", 12.0, skin.accent_bright))
                })
                .when(!on, |chip| {
                    chip.border_color(orbit::alpha(skin.line2))
                        .hover(move |s| s.bg(orbit::alpha(skin.hover)))
                })
                .focus_visible(|s| s.border_2().border_color(orbit::alpha(skin.selection)))
                .child(orbit::text(
                    *label,
                    12.5,
                    600,
                    if on { skin.text1 } else { skin.text2 },
                    cx,
                ))
                .on_click(cx.listener(move |this, _, window, cx| {
                    this.simulator_focus[index].focus(window, cx);
                    this.toggle_simulator(id, cx);
                }))
                .on_key_down(cx.listener(move |this, event: &gpui::KeyDownEvent, _, cx| {
                    if matches!(event.keystroke.key.as_str(), "enter" | "space") {
                        this.toggle_simulator(id, cx);
                        cx.stop_propagation();
                    }
                }))
        });
        group(
            3,
            "Simuladores",
            div()
                .flex()
                .flex_col()
                .gap(px(12.0))
                .child(orbit::text(
                    "Marca los que usas. Aparecerán en tu perfil en este orden.",
                    12.0,
                    400,
                    orbit::ink_3(cx),
                    cx,
                ))
                .child(div().flex().flex_wrap().gap(px(8.0)).children(chips)),
            cx,
        )
    }

    fn save_bar(&self, dirty: bool, cx: &mut Context<Self>) -> Div {
        let (message, tone) = match (&self.status, dirty, self.busy) {
            (_, _, true) => ("Guardando…".to_owned(), Tone::Neutral),
            (Some(status), _, _) => (status.clone(), Tone::Neutral),
            (None, true, _) => ("Cambios sin guardar".to_owned(), Tone::Warning),
            (None, false, _) => ("Todo guardado".to_owned(), Tone::Success),
        };
        div()
            .flex()
            .items_center()
            .gap(px(10.0))
            .px(px(4.0))
            .child(orbit::status_dot(tone, 7.0, cx))
            .child(
                orbit::text(message, 12.5, 500, orbit::ink_2(cx), cx)
                    .flex_1()
                    .min_w_0(),
            )
            .child(self.action(
                orbit::small_button("pilot-discard", "Descartar", cx),
                Action::Discard,
                dirty && !self.busy,
                cx,
            ))
            .child(self.action(
                orbit::carmine_button("pilot-save", "Guardar perfil", cx),
                Action::Save,
                dirty && !self.busy && self.loaded,
                cx,
            ))
    }

    fn account_group(&self, cx: &mut Context<Self>) -> Div {
        group(
            4,
            "Cuenta Vantare",
            div()
                .flex()
                .items_center()
                .gap(px(16.0))
                .child(orbit::icon("v-shield", 18.0, orbit::ink_3(cx)))
                .child(
                    div()
                        .flex_1()
                        .min_w_0()
                        .flex()
                        .flex_col()
                        .gap(px(2.0))
                        .child(orbit::text("Sesión, plan y dispositivos", 14.0, 600, orbit::ink(cx), cx))
                        .child(orbit::text(
                            "Tu perfil es privado: solo lo ves tú. El correo y el plan no se muestran en él.",
                            12.0,
                            400,
                            orbit::ink_3(cx),
                            cx,
                        )),
                )
                .child(self.action(
                    orbit::small_button("pilot-open-account", "Abrir Cuenta", cx),
                    Action::OpenAccount,
                    true,
                    cx,
                )),
            cx,
        )
    }
}

impl Render for PilotEditor {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let draft = self.draft(cx);
        let dirty = self.dirty(cx);
        div()
            .id("pilot-profile")
            .size_full()
            .min_h_0()
            .overflow_y_scroll()
            .child(
                div()
                    .flex()
                    .flex_wrap()
                    .items_start()
                    .gap(px(20.0))
                    .pb(px(24.0))
                    .child(
                        div()
                            .flex_1()
                            .min_w(px(420.0))
                            .flex()
                            .flex_col()
                            .gap(px(18.0))
                            .child(self.photo_group(&draft.public_name, cx))
                            .child(self.details_group(&draft, cx))
                            .child(self.simulators_group(cx))
                            .child(self.save_bar(dirty, cx))
                            .child(self.account_group(cx)),
                    )
                    .child(
                        div()
                            .w(px(300.0))
                            .flex_none()
                            .child(self.preview(&draft, cx)),
                    ),
            )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn country_options_keep_an_unknown_saved_code() {
        let (options, selected) = country_options(None);
        assert_eq!((options.len(), selected), (COUNTRIES.len() + 1, 0));
        let (_, selected) = country_options(Some("es"));
        assert_eq!(options[selected].label, "España");
        let (options, selected) = country_options(Some("is"));
        assert_eq!(options[selected].label, "IS");
        assert_eq!(options.len(), COUNTRIES.len() + 2);
    }
}

fn photo_diff(current: Option<&Arc<Image>>, saved: Option<&Arc<Image>>) -> bool {
    match (current, saved) {
        (None, None) => false,
        (Some(current), Some(saved)) => !Arc::ptr_eq(current, saved),
        _ => true,
    }
}
fn has_changes(current: &Draft, saved: &Draft, photo_changed: bool) -> bool {
    photo_changed || current.trimmed() != saved.trimmed()
}

#[cfg(test)]
mod wiring_tests {
    use super::*;
    #[test]
    fn late_crop_inputs_keep_the_selection_sent_to_the_worker() {
        let mut source = Source {
            image: Arc::new(Image::from_bytes(gpui::ImageFormat::Png, vec![])),
            width: 600,
            height: 300,
            crop: Crop::centered(600, 300),
            drag: None,
        };
        source.zoom(1.25, false);
        let sent = source.crop;
        // El worker recibe `sent` por valor; rueda/teclado/arrastre comparten
        // estos puntos de entrada del modelo mientras el editor está ocupado.
        source.zoom(1.25, true);
        assert_eq!(source.crop, sent);
        source.nudge(0.1, 0.1, true);
        assert_eq!(source.crop, sent);
        source.nudge(0.1, 0.0, false);
        assert_ne!(source.crop, sent, "respuesta libera la edición");
    }
    #[test]
    fn cancel_crop_is_disabled_after_processing_starts_until_result_arrives() {
        assert!(
            Action::CancelCrop.enabled(false),
            "cancelar antes de enviar"
        );
        assert!(
            !Action::CancelCrop.enabled(true),
            "no cancelar un worker ya enviado"
        );
        assert!(
            Action::CancelCrop.enabled(false),
            "respuesta libera la operación"
        );
        assert!(Action::OpenAccount.enabled(true));
    }
    #[test]
    fn photo_only_edit_is_dirty_and_discard_restores_saved_photo() {
        let saved = Draft {
            public_name: "Piloto".into(),
            ..Default::default()
        };
        assert!(!has_changes(&saved, &saved, false));
        assert!(
            has_changes(&saved, &saved, true),
            "photo-only edit must enable saving"
        );
        let photo = Some(Arc::new(Image::from_bytes(
            gpui::ImageFormat::Jpeg,
            vec![1, 2, 3],
        )));
        assert!(photo_diff(photo.as_ref(), None));
        assert!(photo_diff(None, photo.as_ref()));
        assert!(!photo_diff(photo.as_ref(), photo.as_ref()));
        assert!(!has_changes(
            &saved,
            &saved,
            photo_diff(photo.as_ref(), photo.as_ref())
        ));
    }
}
