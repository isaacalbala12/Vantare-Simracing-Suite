//! Controles de Orbit: el propietario recibe cambios, nunca persistencia aquí.
use super::*;
use gpui::{
    Context, Div, EventEmitter, FocusHandle, IntoElement, Render, Stateful, Window, anchored,
    deferred, div, px, rgb, rgba,
};
pub fn field(id: &'static str, cx: &gpui::App) -> Stateful<Div> {
    div()
        .id(id)
        .h(px(CONTROL_H))
        .min_w(px(FIELD_W))
        .px(px(FIELD_PAD))
        .flex()
        .items_center()
        .rounded(px(RADIUS_CONTROL))
        .border_1()
        .border_color(rgba(line(cx)))
        .bg(tint(ink(cx), 0.028))
        .font_family(sans_family(500, cx))
        .text_size(px(FIELD_TEXT))
        .text_color(rgb(ink_2(cx)))
        .hover(|s| s.border_color(rgba(line_strong(cx))))
        .focus_visible(|s| s.border_2().border_color(rgb(coral(cx))))
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ChoiceKind {
    Dropdown,
    Tabs,
    Segmented,
    List,
}
#[derive(Clone, Copy, Debug)]
pub struct ChoiceChanged(pub usize);
pub struct Choice {
    pub state: ChoiceState,
    label: &'static str,
    kind: ChoiceKind,
    focus: FocusHandle,
    scroll: gpui::ScrollHandle,
    trigger_bounds: Option<gpui::Bounds<gpui::Pixels>>,
    reference_trigger: bool,
    compact_width: Option<f32>,
}
impl EventEmitter<ChoiceChanged> for Choice {}
impl Choice {
    pub fn new(
        label: &'static str,
        kind: ChoiceKind,
        options: Vec<OptionItem>,
        selected: Option<usize>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Self {
        let focus = cx.focus_handle();
        cx.on_focus_out(&focus, window, |this, _, _, cx| {
            this.state.close();
            cx.notify();
        })
        .detach();
        cx.observe_window_activation(window, |this, window, cx| {
            if !window.is_window_active() {
                this.state.close();
                cx.notify();
            }
        })
        .detach();
        Self {
            state: ChoiceState::new(options, selected),
            label,
            kind,
            focus,
            scroll: gpui::ScrollHandle::new(),
            trigger_bounds: None,
            reference_trigger: false,
            compact_width: None,
        }
    }
    pub fn reference_trigger(&mut self) {
        self.reference_trigger = true;
    }
    /// Variante estrecha para opciones contextuales; conserva menú, foco y teclado.
    pub fn compact(&mut self, width: f32) {
        self.compact_width = Some(width.clamp(72.0, FIELD_W));
    }
    pub fn focus_handle(&self) -> FocusHandle {
        self.focus.clone()
    }
    pub fn set_enabled(&mut self, enabled: bool, cx: &mut Context<Self>) {
        self.state.enabled = enabled;
        if !enabled {
            self.state.close();
        }
        cx.notify();
    }
    fn choose(&mut self, index: usize, cx: &mut Context<Self>) {
        if self.state.choose(index) {
            cx.emit(ChoiceChanged(index));
        }
        cx.notify();
    }
    fn key(&mut self, event: &gpui::KeyDownEvent, _: &mut Window, cx: &mut Context<Self>) {
        if !self.state.enabled
            || !matches!(
                event.keystroke.key.as_str(),
                "left" | "right" | "up" | "down" | "home" | "end" | "enter" | "space" | "escape"
            )
        {
            return;
        }
        if self
            .state
            .key(&event.keystroke.key, self.kind != ChoiceKind::Dropdown)
            && let Some(index) = self.state.selected
        {
            cx.emit(ChoiceChanged(index));
        }
        if let Some(index) = self.state.active {
            self.scroll.scroll_to_item(index);
        }
        cx.stop_propagation();
        cx.notify();
    }
}
impl Choice {
    fn option(&self, index: usize, option: &OptionItem, cx: &mut Context<Self>) -> Stateful<Div> {
        let selected = self.state.selected == Some(index);
        div()
            .id(("option", index))
            .role(gpui::Role::ListBoxOption)
            .aria_label(option.label.clone())
            .aria_selected(selected)
            .tab_stop(false)
            .h(px(OPTION_H))
            .px(px(RADIUS_CHIP + FOCUS_WIDTH))
            .rounded(px(RADIUS_CHIP))
            .flex()
            .items_center()
            .justify_between()
            .when(self.state.active == Some(index), |s| {
                s.bg(rgba(line_row(cx)))
            })
            .when(!option.enabled, |s| {
                s.opacity(DISABLED).aria_description("Deshabilitado")
            })
            .when(option.enabled, |s| {
                s.cursor_pointer().hover(|s| s.bg(rgba(line_row(cx))))
            })
            .child(text(
                option.label.clone(),
                BODY,
                if selected { 650 } else { 500 },
                ink_2(cx),
                cx,
            ))
            .when(selected, |s| {
                s.child(text("✓", SECONDARY, 650, coral(cx), cx))
            })
            .on_mouse_move(cx.listener(move |this, _, _, cx| {
                if this.state.options[index].enabled && this.state.active != Some(index) {
                    this.state.active = Some(index);
                    cx.notify();
                }
            }))
            .on_click(cx.listener(move |this, _, _, cx| this.choose(index, cx)))
    }
    fn trigger_tracker(cx: &mut Context<Self>) -> impl IntoElement {
        let entity = cx.entity();
        gpui::canvas(
            move |bounds, _, cx| {
                entity.update(cx, |this, _| this.trigger_bounds = Some(bounds));
            },
            |_, (), _, _| {},
        )
        .absolute()
        .size_full()
    }
    fn trigger_label(
        &self,
        label: impl Into<SharedString>,
        size: f32,
        weight: u16,
        color: u32,
        cx: &gpui::App,
    ) -> Div {
        text(label, size, weight, color, cx).when(self.reference_trigger, |text| {
            text.font_weight(
                if cx.global::<theme::Theme>().interface_font == theme::InterfaceFont::Inter {
                    gpui::FontWeight::NORMAL
                } else {
                    gpui::FontWeight(f32::from(weight))
                },
            )
            .line_height(px(size * 1.5))
            .relative()
            .font_features(gpui::FontFeatures(std::sync::Arc::new(vec![(
                "kern".into(),
                1,
            )])))
        })
    }
    fn dropdown(&self, cx: &mut Context<Self>) -> Div {
        let value = self
            .state
            .selected
            .and_then(|i| self.state.options.get(i))
            .map_or("Seleccionar…", |o| o.label.as_str());
        let trigger = field("choice-trigger", cx)
            .relative()
            .w(px(FIELD_W))
            .when_some(self.compact_width, |field, width| {
                field.w(px(width)).min_w(px(width)).h(px(30.0)).px(px(8.0))
            })
            .tab_stop(false)
            .cursor_pointer()
            .justify_between()
            .when(!self.state.enabled, |s| s.opacity(DISABLED))
            .child(Self::trigger_tracker(cx))
            .when(self.reference_trigger, |field| {
                field.bg(tint(ink(cx), 7.0 / 255.0))
            })
            .child(self.trigger_label(
                value.to_owned(),
                if self.compact_width.is_some() {
                    12.0
                } else if self.reference_trigger {
                    14.0
                } else {
                    BODY
                },
                500,
                ink_2(cx),
                cx,
            ))
            .child(self.trigger_label(
                "⌄",
                if self.reference_trigger {
                    16.0
                } else {
                    SECONDARY
                },
                if self.reference_trigger { 400 } else { 500 },
                ink_3(cx),
                cx,
            ))
            .on_click(cx.listener(|this, _, window, cx| {
                if !this.state.enabled {
                    return;
                }
                this.focus.focus(window, cx);
                this.state.toggle();
                cx.notify();
            }));
        let mut result = div().child(trigger);
        if self.state.open {
            let mut list = div()
                .id("choice-options")
                .role(gpui::Role::ListBox)
                .tab_stop(false)
                .w(px(FIELD_W))
                .max_h(px(ROW_H * 5.0))
                .overflow_y_scroll()
                .track_scroll(&self.scroll)
                .shadow(layer_shadow(false, cx))
                .p(px(MENU_PAD))
                .rounded(px(RADIUS_CONTROL))
                .border_1()
                .border_color(rgba(line_strong(cx)))
                .bg(rgb(surface_2(cx)))
                .on_mouse_down_out(cx.listener(|this, event: &gpui::MouseDownEvent, _, cx| {
                    // El botón alterna en click; cerrarlo aquí lo volvería a abrir.
                    if !this
                        .trigger_bounds
                        .is_some_and(|bounds| bounds.contains(&event.position))
                    {
                        this.state.close();
                        cx.notify();
                    }
                }));
            for (index, option) in self.state.options.iter().enumerate() {
                list = list.child(self.option(index, option, cx));
            }
            result = result.child(
                deferred(
                    anchored()
                        .offset(gpui::point(px(0.0), px(MENU_PAD)))
                        .snap_to_window()
                        .child(list),
                )
                .with_priority(MENU_Z),
            );
        }
        result
    }
    fn rows(&self, cx: &mut Context<Self>) -> Div {
        let mut list = div().flex().flex_col();
        for (index, option) in self.state.options.iter().enumerate() {
            list = list.child(
                list_row(
                    ("choice-row", index),
                    &option.label,
                    "",
                    self.state.selected == Some(index),
                    option.enabled && self.state.enabled,
                    cx,
                )
                .role(gpui::Role::ListBoxOption)
                .tab_stop(false)
                .on_click(cx.listener(move |this, _, window, cx| {
                    if this.state.enabled && this.state.options[index].enabled {
                        this.focus.focus(window, cx);
                        this.choose(index, cx);
                    }
                })),
            );
        }
        list
    }
    fn segments(&self, cx: &mut Context<Self>) -> Div {
        let tabs = self.kind == ChoiceKind::Tabs;
        let mut segments = div()
            .flex()
            .when(tabs, |s| {
                s.gap(px(SEGMENT_PAD))
                    .border_b_1()
                    .border_color(rgba(line(cx)))
            })
            .when(!tabs, |s| {
                s.gap(px(SEGMENT_GAP))
                    .p(px(SEGMENT_PAD))
                    .rounded(px(RADIUS_CONTROL))
                    .bg(tint(ink(cx), 0.02))
                    .border_1()
                    .border_color(rgba(line_row(cx)))
            });
        for (index, option) in self.state.options.iter().enumerate() {
            let selected = self.state.selected == Some(index);
            segments = segments.child(
                div()
                    .id(("segment", index))
                    .role(gpui::Role::Tab)
                    .aria_label(option.label.clone())
                    .aria_selected(selected)
                    .tab_stop(false)
                    .flex()
                    .items_center()
                    .relative()
                    .when(tabs, |s| s.h(px(OPTION_H)).px(px(TAB_PAD)))
                    .when(!tabs, |s| {
                        s.h(px(SEGMENT_H))
                            .px(px(RADIUS_CONTROL))
                            .rounded(px(RADIUS_CHIP))
                    })
                    .when(selected && !tabs, |s| {
                        s.bg(tint(carmine(cx), 0.16))
                            .border_1()
                            .border_color(tint(red(cx), 0.22))
                    })
                    .when(selected && tabs, |s| {
                        s.child(
                            div()
                                .absolute()
                                .left(px(TAB_INSET))
                                .right(px(TAB_INSET))
                                .bottom_0()
                                .h(px(FOCUS_WIDTH))
                                .rounded(px(FOCUS_WIDTH))
                                .bg(rgb(red(cx))),
                        )
                    })
                    .when(selected && is_mono(cx), |c| {
                        c.bg(rgb(surface_3(cx)))
                            .border_1()
                            .border_color(selection_border(cx))
                    })
                    .when(!option.enabled || !self.state.enabled, |s| {
                        s.opacity(DISABLED).aria_description("Deshabilitado")
                    })
                    .when(option.enabled && self.state.enabled, |s| {
                        s.cursor_pointer().hover(|s| s.bg(rgba(line_row(cx))))
                    })
                    .child(text(
                        option.label.clone(),
                        if tabs { BODY } else { SECONDARY },
                        650,
                        if selected { ink(cx) } else { ink_4(cx) },
                        cx,
                    ))
                    .on_click(cx.listener(move |this, _, window, cx| {
                        if this.state.enabled && this.state.options[index].enabled {
                            this.focus.focus(window, cx);
                            this.choose(index, cx);
                        }
                    })),
            );
        }
        segments
    }
}
impl Render for Choice {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        div()
            .id("orbit-choice")
            .track_focus(&self.focus.clone().tab_stop(self.state.enabled))
            .tab_index(0)
            .tab_stop(self.state.enabled)
            .role(match self.kind {
                ChoiceKind::Dropdown => gpui::Role::ComboBox,
                ChoiceKind::List => gpui::Role::ListBox,
                ChoiceKind::Tabs | ChoiceKind::Segmented => gpui::Role::TabList,
            })
            .aria_label(self.label)
            .aria_expanded(self.state.open)
            .relative()
            .on_key_down(cx.listener(Self::key))
            .child(match self.kind {
                ChoiceKind::Dropdown => self.dropdown(cx),
                ChoiceKind::List => self.rows(cx),
                ChoiceKind::Tabs | ChoiceKind::Segmented => self.segments(cx),
            })
            .focus_visible(|s| {
                s.border_2()
                    .m(px(-FOCUS_WIDTH))
                    .rounded(px(RADIUS_CONTROL))
                    .border_color(rgb(coral(cx)))
            })
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Tone {
    Neutral,
    Accent,
    Success,
    Warning,
    Danger,
    Reference,
    Bronze,
    Silver,
    Gold,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StatusShape {
    Plain,
    Outline,
    Dashed,
    Inverted,
    Info,
}
impl Tone {
    pub fn color(self, cx: &gpui::App) -> u32 {
        self.color_in(cx.global::<theme::Theme>())
    }
    pub fn color_in(self, theme: &theme::Theme) -> u32 {
        match self {
            Self::Neutral => theme.ink_4,
            Self::Accent => theme.coral,
            Self::Success => theme.green,
            Self::Warning => theme.ember,
            Self::Gold => {
                if theme.palette == theme::Palette::Mono {
                    theme.tier_gold
                } else {
                    theme.ember
                }
            }
            Self::Danger => theme.red,
            Self::Reference => theme.cyan,
            Self::Bronze => theme.bronze,
            Self::Silver => theme.silver,
        }
    }
    pub fn status_shape(self) -> StatusShape {
        match self {
            Self::Success => StatusShape::Outline,
            Self::Warning => StatusShape::Dashed,
            Self::Danger => StatusShape::Inverted,
            Self::Reference => StatusShape::Info,
            _ => StatusShape::Plain,
        }
    }
    pub fn symbol(self) -> &'static str {
        match self {
            Self::Success => "✓",
            Self::Warning => "⚠",
            Self::Danger => "✕",
            Self::Reference => "ⓘ",
            Self::Bronze => "★",
            Self::Silver => "★★",
            Self::Gold => "★★★",
            _ => "",
        }
    }
}
fn mono_status(control: Div, tone: Tone, cx: &gpui::App) -> Div {
    if !is_mono(cx) {
        return control;
    }
    let color = tone.color(cx);
    control
        .bg(rgb(cx.global::<theme::Theme>().surface_0))
        .when(tone.status_shape() == StatusShape::Outline, |c| {
            c.border_1().border_color(rgb(color))
        })
        .when(tone.status_shape() == StatusShape::Dashed, |c| {
            c.border_1().border_dashed().border_color(rgb(color))
        })
        .when(tone.status_shape() == StatusShape::Inverted, |c| {
            c.bg(rgb(color))
                .text_color(rgb(cx.global::<theme::Theme>().primary_ink))
        })
}
/// Indicador semántico: mantiene el punto original y añade forma solo en Grises.
pub fn status_dot(tone: Tone, size: f32, cx: &gpui::App) -> Div {
    if is_mono(cx) && !tone.symbol().is_empty() {
        mono_status(
            text(
                tone.symbol(),
                size.max(11.0),
                700,
                if tone == Tone::Danger {
                    cx.global::<theme::Theme>().primary_ink
                } else {
                    tone.color(cx)
                },
                cx,
            ),
            tone,
            cx,
        )
    } else {
        div().size(px(size)).rounded_full().bg(rgb(tone.color(cx)))
    }
}
pub fn chip(label: &str, tone: Tone, cx: &gpui::App) -> Div {
    let label = if is_mono(cx)
        && !tone.symbol().is_empty()
        && !matches!(tone, Tone::Bronze | Tone::Silver | Tone::Gold)
    {
        format!("{} {}", tone.symbol(), label.to_uppercase())
    } else {
        label.to_uppercase()
    };
    let color = if is_mono(cx) && tone == Tone::Danger {
        cx.global::<theme::Theme>().primary_ink
    } else if is_mono(cx) && matches!(tone, Tone::Bronze | Tone::Silver | Tone::Gold) {
        ink(cx)
    } else {
        tone.color(cx)
    };
    let control = div()
        .h(px(CHIP_H))
        .px(px(CHIP_PAD))
        .rounded(px(RADIUS_CHIP))
        .flex_none()
        .flex()
        .items_center()
        .gap(px(DOT))
        .bg(match tone {
            Tone::Bronze | Tone::Gold => tint(tone.color(cx), 0.1),
            Tone::Silver => tint(silver(cx), 0.09),
            _ => rgba(line_chip(cx)).into(),
        })
        .when(
            is_mono(cx) && matches!(tone, Tone::Bronze | Tone::Silver | Tone::Gold),
            |chip| chip.child(text(tone.symbol(), CHIP_TEXT, 700, tone.color(cx), cx)),
        )
        .child(text(label, CHIP_TEXT, 700, color, cx));
    mono_status(control, tone, cx)
}
pub fn pill(label: &str, tone: Tone, cx: &gpui::App) -> Div {
    let control = div()
        .h(px(PILL_H))
        .px(px(FIELD_PAD))
        .rounded(px(RADIUS_CONTROL))
        .border_1()
        .border_color(rgba(line_pill(cx)))
        .bg(tint(white(cx), 0.022))
        .flex()
        .items_center()
        .gap(px(PILL_GAP))
        .child(status_dot(tone, PILL_DOT, cx))
        .child(text(
            label.to_owned(),
            PILL_TEXT,
            500,
            if is_mono(cx) && tone == Tone::Danger {
                cx.global::<theme::Theme>().primary_ink
            } else {
                match tone {
                    Tone::Success => ink_2(cx),
                    Tone::Neutral => ink_muted(cx),
                    _ => tone.color(cx),
                }
            },
            cx,
        ));
    mono_status(control, tone, cx)
}
pub fn badge(count: usize, tone: Tone, cx: &gpui::App) -> Div {
    chip(&count.to_string(), tone, cx)
}
/// Iniciales del ViewModel; sin acceso a cuenta ni red.
pub fn initials(name: &str) -> String {
    let mut words = name.split_whitespace();
    let Some(first) = words.next().and_then(|word| word.chars().next()) else {
        return "·".into();
    };
    let last = words.next_back().and_then(|word| word.chars().next());
    first
        .to_uppercase()
        .chain(last.into_iter().flat_map(char::to_uppercase))
        .collect()
}
pub fn profile_avatar(
    id: &'static str,
    name: &str,
    active: bool,
    enabled: bool,
    cx: &gpui::App,
) -> Stateful<Div> {
    div()
        .id(id)
        .role(gpui::Role::Button)
        .aria_label(if name.trim().is_empty() {
            "Cuenta · sin sesión".into()
        } else {
            name.to_owned()
        })
        .aria_selected(active)
        .tab_index(0)
        .tab_stop(enabled)
        .size(px(CONTROL_H))
        .rounded(px(RADIUS_CONTROL))
        .flex()
        .items_center()
        .justify_center()
        .bg(rgb(surface_3(cx)))
        .border_1()
        .border_color(if active {
            rgb(carmine(cx))
        } else {
            rgba(line(cx))
        })
        .when(enabled, |s| {
            s.cursor_pointer().hover(|s| s.bg(rgb(surface_2(cx))))
        })
        .when(!enabled, |s| s.opacity(DISABLED))
        .focus_visible(|s| s.border_2().border_color(rgb(coral(cx))))
        .child(text(initials(name), SECONDARY, 800, ink(cx), cx))
}
#[derive(Clone, Copy, Debug)]
pub struct Checked(pub bool);
pub struct Checkbox {
    pub checked: bool,
    pub enabled: bool,
    label: &'static str,
    focus: FocusHandle,
    switch: bool,
}
impl EventEmitter<Checked> for Checkbox {}
impl Checkbox {
    pub fn new(label: &'static str, checked: bool, cx: &mut Context<Self>) -> Self {
        Self {
            checked,
            enabled: true,
            label,
            focus: cx.focus_handle(),
            switch: false,
        }
    }
    pub fn switch(label: &'static str, checked: bool, cx: &mut Context<Self>) -> Self {
        Self {
            switch: true,
            ..Self::new(label, checked, cx)
        }
    }
    pub fn focus_handle(&self) -> FocusHandle {
        self.focus.clone()
    }
    fn activate(&mut self, key: &str, cx: &mut Context<Self>) {
        let next = state::toggled(self.checked, self.enabled, key);
        if next != self.checked {
            self.checked = next;
            cx.emit(Checked(next));
            cx.notify();
        }
    }
}
impl Render for Checkbox {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        if self.switch {
            return div()
                .flex()
                .w_full()
                .items_center()
                .justify_between()
                .gap(px(FIELD_PAD))
                .child(text(self.label, BODY, 500, ink_2(cx), cx))
                .child(
                    super::toggle("orbit-switch", self.label, self.checked, self.enabled, cx)
                        .aria_toggled(if self.checked {
                            gpui::Toggled::True
                        } else {
                            gpui::Toggled::False
                        })
                        .track_focus(&self.focus.clone().tab_stop(self.enabled))
                        .on_key_down(cx.listener(|this, event: &gpui::KeyDownEvent, _, cx| {
                            this.activate(event.keystroke.key.as_str(), cx);
                        }))
                        .on_click(cx.listener(|this, _, window, cx| {
                            if this.enabled {
                                this.focus.focus(window, cx);
                                this.activate("space", cx);
                            }
                        })),
                )
                .into_any_element();
        }
        div()
            .id("orbit-checkbox")
            .role(gpui::Role::CheckBox)
            .aria_label(self.label)
            .aria_toggled(if self.checked {
                gpui::Toggled::True
            } else {
                gpui::Toggled::False
            })
            .track_focus(&self.focus.clone().tab_stop(self.enabled))
            .tab_index(0)
            .tab_stop(self.enabled)
            .flex()
            .items_center()
            .gap(px(FIELD_PAD))
            .cursor_pointer()
            .when(!self.enabled, |s| s.opacity(DISABLED))
            .focus_visible(|s| {
                s.border_2()
                    .m(px(-FOCUS_WIDTH))
                    .rounded(px(CHECK_RADIUS))
                    .border_color(rgb(coral(cx)))
            })
            .on_click(cx.listener(|this, _, window, cx| {
                if this.enabled {
                    this.focus.focus(window, cx);
                    this.activate("space", cx);
                }
            }))
            .child(
                div()
                    .size(px(CHECK_SIZE))
                    .rounded(px(CHECK_RADIUS))
                    .when(self.enabled, |s| {
                        s.hover(|s| s.border_color(rgb(ink_4(cx))))
                    })
                    .border_1()
                    .border_color(if self.checked {
                        rgb(carmine(cx))
                    } else {
                        rgba(line_strong(cx))
                    })
                    .bg(if self.checked {
                        tint(carmine(cx), 1.0)
                    } else {
                        tint(ink(cx), 0.03)
                    })
                    .flex()
                    .items_center()
                    .justify_center()
                    .when(self.checked, |s| {
                        s.child(text("✓", SECONDARY, 700, ink(cx), cx))
                    }),
            )
            .child(text(self.label, BODY, 650, ink(cx), cx))
            .into_any_element()
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NumberKind {
    Slider,
    Stepper,
}
#[derive(Clone, Copy, Debug)]
pub struct NumberChanged(pub f64);
pub struct NumberControl {
    pub range: NumberRange,
    pub enabled: bool,
    label: &'static str,
    kind: NumberKind,
    focus: FocusHandle,
    bounds: Option<gpui::Bounds<gpui::Pixels>>,
    dragging: bool,
}
impl EventEmitter<NumberChanged> for NumberControl {}
impl NumberControl {
    pub fn new(
        label: &'static str,
        kind: NumberKind,
        range: NumberRange,
        cx: &mut Context<Self>,
    ) -> Self {
        Self {
            range,
            enabled: true,
            label,
            kind,
            focus: cx.focus_handle(),
            bounds: None,
            dragging: false,
        }
    }
    pub fn focus_handle(&self) -> FocusHandle {
        self.focus.clone()
    }
    fn key(&mut self, key: &str, cx: &mut Context<Self>) {
        if self.enabled && self.range.key(key) {
            cx.emit(NumberChanged(self.range.value));
            cx.notify();
        }
    }
    fn pointer(&mut self, x: gpui::Pixels, cx: &mut Context<Self>) {
        if !self.enabled {
            return;
        }
        if let Some(bounds) = self.bounds
            && bounds.size.width > px(0.0)
        {
            let fraction = f64::from((x - bounds.left()) / bounds.size.width).clamp(0.0, 1.0);
            if self
                .range
                .set(self.range.min + fraction * (self.range.max - self.range.min))
            {
                cx.emit(NumberChanged(self.range.value));
                cx.notify();
            }
        }
    }
}
impl NumberControl {
    fn stepper(&self, cx: &mut Context<Self>) -> Div {
        div()
            .flex()
            .items_center()
            .gap(px(RADIUS_CONTROL))
            .child(
                button("number-minus", "−", cx)
                    .tab_stop(false)
                    .when(!self.enabled || self.range.value <= self.range.min, |s| {
                        s.opacity(DISABLED)
                    })
                    .on_click(cx.listener(|this, _, window, cx| {
                        if this.enabled {
                            this.focus.focus(window, cx);
                            this.key("down", cx);
                        }
                    })),
            )
            .child(text(
                format!("{}", self.range.value),
                BODY,
                700,
                ink(cx),
                cx,
            ))
            .child(
                button("number-plus", "+", cx)
                    .tab_stop(false)
                    .when(!self.enabled || self.range.value >= self.range.max, |s| {
                        s.opacity(DISABLED)
                    })
                    .on_click(cx.listener(|this, _, window, cx| {
                        if this.enabled {
                            this.focus.focus(window, cx);
                            this.key("up", cx);
                        }
                    })),
            )
    }
    fn slider(&self, cx: &mut Context<Self>) -> Div {
        let fraction = self.range.fraction();
        let entity = cx.entity();
        div()
            .flex()
            .items_center()
            .gap(px(RADIUS_CONTROL))
            .child(
                div()
                    .id("slider-track")
                    .relative()
                    .w(px(FADER_W))
                    .h(px(CHECK_SIZE))
                    .cursor_pointer()
                    .on_mouse_down(
                        gpui::MouseButton::Left,
                        cx.listener(|this, event: &gpui::MouseDownEvent, window, cx| {
                            if this.enabled {
                                this.focus.focus(window, cx);
                                this.dragging = true;
                                this.pointer(event.position.x, cx);
                            }
                        }),
                    )
                    .on_mouse_move(cx.listener(|this, event: &gpui::MouseMoveEvent, _, cx| {
                        if this.dragging {
                            this.pointer(event.position.x, cx);
                        }
                    }))
                    .on_mouse_up(
                        gpui::MouseButton::Left,
                        cx.listener(|this, _, _, _| this.dragging = false),
                    )
                    .on_mouse_up_out(
                        gpui::MouseButton::Left,
                        cx.listener(|this, _, _, _| this.dragging = false),
                    )
                    .child(
                        gpui::canvas(
                            move |bounds, _, cx| {
                                entity.update(cx, |this, _| this.bounds = Some(bounds));
                            },
                            move |bounds, (), window, cx| {
                                paint_slider(bounds, fraction, window, cx);
                            },
                        )
                        .size_full(),
                    ),
            )
            .child(text(
                format!("{}", self.range.value),
                SECONDARY,
                650,
                ink_2(cx),
                cx,
            ))
    }
}
fn paint_slider(
    bounds: gpui::Bounds<gpui::Pixels>,
    fraction: f64,
    window: &mut Window,
    cx: &gpui::App,
) {
    let y = bounds.top() + bounds.size.height / 2.0;
    let track = gpui::Bounds::new(
        gpui::point(bounds.left(), y - px(FADER_H / 2.0)),
        gpui::size(bounds.size.width, px(FADER_H)),
    );
    window.paint_quad(gpui::fill(track, rgba(line_strong(cx))).corner_radii(px(FADER_RADIUS)));
    #[allow(clippy::cast_possible_truncation)] // Fracción 0..1 para el renderer f32 de GPUI.
    let width = bounds.size.width * fraction as f32;
    let gradient = gpui::linear_gradient(
        90.0,
        gpui::linear_color_stop(rgb(carmine(cx)), 0.0),
        gpui::linear_color_stop(rgb(coral(cx)), 1.0),
    );
    window.paint_quad(
        gpui::fill(
            gpui::Bounds::new(track.origin, gpui::size(width, track.size.height)),
            gradient,
        )
        .corner_radii(px(FADER_RADIUS)),
    );
    window.paint_quad(
        gpui::fill(
            gpui::Bounds::new(
                gpui::point(
                    bounds.left() + width - px(FADER_THUMB / 2.0),
                    y - px(FADER_THUMB / 2.0),
                ),
                gpui::size(px(FADER_THUMB), px(FADER_THUMB)),
            ),
            rgb(primary_bg(cx)),
        )
        .corner_radii(px(FADER_THUMB / 2.0)),
    );
}
impl Render for NumberControl {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let root = div()
            .id("orbit-number")
            .track_focus(&self.focus.clone().tab_stop(self.enabled))
            .tab_index(0)
            .tab_stop(self.enabled)
            .role(if self.kind == NumberKind::Slider {
                gpui::Role::Slider
            } else {
                gpui::Role::SpinButton
            })
            .aria_label(self.label)
            .aria_numeric_value(self.range.value)
            .aria_numeric_value_step(self.range.step)
            .aria_min_numeric_value(self.range.min)
            .aria_max_numeric_value(self.range.max)
            .h(px(CONTROL_H))
            .min_w(px(FIELD_W))
            .flex()
            .items_center()
            .gap(px(RADIUS_CONTROL))
            .when(!self.enabled, |s| s.opacity(DISABLED))
            .focus_visible(|s| {
                s.border_2()
                    .rounded(px(RADIUS_CONTROL))
                    .border_color(rgb(coral(cx)))
            })
            .on_key_down(cx.listener(|this, event: &gpui::KeyDownEvent, _, cx| {
                if matches!(
                    event.keystroke.key.as_str(),
                    "left" | "right" | "up" | "down" | "home" | "end" | "pageup" | "pagedown"
                ) {
                    this.key(&event.keystroke.key, cx);
                    cx.stop_propagation();
                }
            }));
        root.child(if self.kind == NumberKind::Stepper {
            self.stepper(cx)
        } else {
            self.slider(cx)
        })
    }
}
pub fn list_row(
    id: impl Into<gpui::ElementId>,
    label: &str,
    detail: &str,
    selected: bool,
    enabled: bool,
    cx: &gpui::App,
) -> Stateful<Div> {
    div()
        .id(id)
        .role(gpui::Role::Button)
        .aria_label(label.to_owned())
        .aria_selected(selected)
        .tab_index(0)
        .tab_stop(enabled)
        .min_h(px(ROW_H))
        .px(px(RADIUS_CONTROL))
        .py(px(RADIUS_CHIP))
        .rounded(px(RADIUS_CONTROL))
        .flex()
        .flex_col()
        .when(selected, |s| s.bg(tint(carmine(cx), 0.11)))
        .when(selected && is_mono(cx), |s| {
            s.bg(rgb(surface_3(cx)))
                .border_1()
                .border_color(selection_border(cx))
        })
        .when(enabled, |s| {
            s.cursor_pointer().hover(|s| s.bg(rgba(line_row(cx))))
        })
        .when(!enabled, |s| s.opacity(DISABLED))
        .focus_visible(|s| s.border_2().border_color(rgb(coral(cx))))
        // La cara Inter ya trae el peso: pedirlo otra vez sintetiza negrita.
        .child(text(label.to_owned(), BODY, 650, ink(cx), cx).font_weight(face_weight(650, cx)))
        .child(text(detail.to_owned(), SECONDARY, 400, ink_3(cx), cx))
}
pub fn empty_state(title: &str, help: &str, cx: &gpui::App) -> Div {
    div()
        .p(px(GUTTER))
        .flex()
        .flex_col()
        .items_center()
        .gap(px(RADIUS_CHIP))
        .child(text(title.to_owned(), BODY, 650, ink_2(cx), cx))
        .child(text(help.to_owned(), SECONDARY, 400, ink_3(cx), cx))
}
pub struct Table {
    pub headers: Vec<String>,
    pub rows: Vec<Vec<String>>,
}
impl Table {
    pub fn validate(&self) -> Result<(), &'static str> {
        if self.headers.is_empty() || self.rows.iter().any(|row| row.len() != self.headers.len()) {
            Err("tabla sin columnas o fila incompatible")
        } else {
            Ok(())
        }
    }
    pub fn render(&self, cx: &gpui::App) -> Result<Stateful<Div>, &'static str> {
        self.validate()?;
        let mut table = div()
            .id("orbit-table")
            .role(gpui::Role::Table)
            .flex()
            .flex_col();
        let row = |cells: &[String], header: bool, index| {
            let mut row = div()
                .id(("table-row", index))
                .role(gpui::Role::Row)
                .min_h(px(ROW_H))
                .flex()
                .items_center()
                .border_b_1()
                .border_color(rgba(line_row(cx)));
            for (i, cell) in cells.iter().enumerate() {
                row = row.child(
                    div()
                        .id(("cell", i))
                        .role(if header {
                            gpui::Role::ColumnHeader
                        } else {
                            gpui::Role::Cell
                        })
                        .flex_1()
                        .min_w_0()
                        .px(px(RADIUS_CONTROL))
                        .child(text(
                            cell.clone(),
                            if header { SECONDARY } else { BODY },
                            if header { 700 } else { 500 },
                            if header { ink_3(cx) } else { ink_2(cx) },
                            cx,
                        )),
                );
            }
            row
        };
        table = table.child(row(&self.headers, true, 0));
        for (i, cells) in self.rows.iter().enumerate() {
            table = table.child(row(cells, false, i + 1));
        }
        if self.rows.is_empty() {
            table = table.child(empty_state(
                "Sin resultados",
                "Cambia los filtros o añade una entrada.",
                cx,
            ));
        }
        Ok(table)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn avatar_uses_unicode_initials_and_empty_profile_fallback() {
        assert_eq!(initials(" Isaac Albala "), "IA");
        assert_eq!(initials("élise"), "É");
        assert_eq!(initials("  "), "·");
    }
    #[test]
    fn semantic_badges_keep_plan_status_and_channel_tokens_distinct() {
        let t = theme::Theme::default();
        assert_eq!(Tone::Success.color_in(&t), t.green);
        assert_eq!(Tone::Gold.color_in(&t), t.ember);
        assert_eq!(Tone::Accent.color_in(&t), t.coral);
        assert_ne!(Tone::Danger.color_in(&t), Tone::Neutral.color_in(&t));
        let states = [Tone::Success, Tone::Warning, Tone::Danger, Tone::Reference];
        for (index, tone) in states.iter().enumerate() {
            assert!(!tone.symbol().is_empty());
            for other in &states[..index] {
                assert_ne!(tone.symbol(), other.symbol());
                assert_ne!(tone.status_shape(), other.status_shape());
            }
        }
    }
    #[test]
    fn table_rejects_misaligned_rows_and_accepts_empty_results() {
        let mut table = Table {
            headers: vec!["Nombre".into(), "Estado".into()],
            rows: vec![],
        };
        assert!(table.validate().is_ok());
        table.rows.push(vec!["Uno".into()]);
        assert!(table.validate().is_err());
    }
}
