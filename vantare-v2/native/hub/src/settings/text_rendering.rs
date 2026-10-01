//! Wails rasteriza en gris el texto sobre sus superficies transparentes.
//! El ámbito de pintura restaura el modo GPUI antes de dibujar otra sección.
use gpui::{
    AnyElement, App, Bounds, Element, ElementId, GlobalElementId, InspectorElementId, IntoElement,
    LayoutId, Pixels, TextRenderingMode, Window,
};
use std::{cell::RefCell, rc::Rc};

/// `TextLayout` redondea el interlineado antes de envolver. Las noticias Wails
/// usan 18,75px: conservar esa medida evita acumular desfase entre releases.
/// La forma de las letras y los saltos siguen siendo los de GPUI.
pub(super) struct Paragraph {
    pub text: gpui::SharedString,
    pub runs: Vec<gpui::TextRun>,
}

impl IntoElement for Paragraph {
    type Element = Self;

    fn into_element(self) -> Self {
        self
    }
}

impl Element for Paragraph {
    type RequestLayoutState = Rc<RefCell<Vec<gpui::WrappedLine>>>;
    type PrepaintState = gpui::Pixels;

    fn id(&self) -> Option<ElementId> {
        None
    }

    fn source_location(&self) -> Option<&'static std::panic::Location<'static>> {
        None
    }

    fn request_layout(
        &mut self,
        _: Option<&GlobalElementId>,
        _: Option<&InspectorElementId>,
        window: &mut Window,
        _: &mut App,
    ) -> (LayoutId, Self::RequestLayoutState) {
        let state = Rc::new(RefCell::new(Vec::new()));
        let measured = state.clone();
        let text = self.text.clone();
        let runs = self.runs.clone();
        let style = window.text_style();
        let size = style.font_size.to_pixels(window.rem_size());
        let height = style.line_height.to_pixels(size.into(), window.rem_size());
        let layout = window.request_measured_layout(
            gpui::Style::default(),
            move |known, available, window, _| {
                let width = known.width.or(match available.width {
                    gpui::AvailableSpace::Definite(width) => Some(width),
                    _ => None,
                });
                // GPUI cuenta el espacio final al decidir el salto; CSS lo
                // descarta. Permitir ese avance evita cortar una palabra antes.
                let space = runs
                    .last()
                    .cloned()
                    .map(|mut run| {
                        run.len = 1;
                        window
                            .text_system()
                            .shape_line(" ".into(), size, &[run], None)
                            .width()
                    })
                    .unwrap_or_default();
                let wrap_width = width.map(|width| width + space);
                match window
                    .text_system()
                    .shape_text(text.clone(), size, &runs, wrap_width, None)
                {
                    Ok(lines) => {
                        let mut bounds = gpui::size(gpui::px(0.0), gpui::px(0.0));
                        for line in &lines {
                            let line_size = line.size(height);
                            bounds.width = bounds.width.max(line_size.width);
                            bounds.height += line_size.height;
                        }
                        bounds.width = width.unwrap_or(bounds.width);
                        *measured.borrow_mut() = lines.into_iter().collect();
                        bounds
                    }
                    Err(error) => {
                        eprintln!("No se pudo componer la nota de versión: {error}");
                        measured.borrow_mut().clear();
                        gpui::size(width.unwrap_or_default(), height)
                    }
                }
            },
        );
        (layout, state)
    }

    fn prepaint(
        &mut self,
        _: Option<&GlobalElementId>,
        _: Option<&InspectorElementId>,
        _: Bounds<Pixels>,
        _: &mut Self::RequestLayoutState,
        window: &mut Window,
        _: &mut App,
    ) -> Pixels {
        let style = window.text_style();
        style.line_height.to_pixels(
            style.font_size.to_pixels(window.rem_size()).into(),
            window.rem_size(),
        )
    }

    fn paint(
        &mut self,
        _: Option<&GlobalElementId>,
        _: Option<&InspectorElementId>,
        bounds: Bounds<Pixels>,
        state: &mut Self::RequestLayoutState,
        height: &mut Pixels,
        window: &mut Window,
        cx: &mut App,
    ) {
        let mut origin = bounds.origin;
        for line in state.borrow().iter() {
            let size = f32::from(line.unwrapped_layout.font_size);
            let centered_baseline =
                (f32::from(*height) + f32::from(line.ascent()) - f32::from(line.descent())) / 2.0;
            let css_baseline =
                vantare_ui::efficiency::text::baseline(0.0, f32::from(*height), size);
            // LayoutNG redondea el empate hacia arriba; GPUI hacia cero.
            let paint_origin = gpui::point(
                origin.x,
                origin.y + gpui::px(css_baseline - centered_baseline + 0.01),
            );
            if let Err(error) = line.paint(
                paint_origin,
                *height,
                gpui::TextAlign::Left,
                None,
                window,
                cx,
            ) {
                eprintln!("No se pudo pintar la nota de versión: {error}");
            }
            origin.y += line.size(*height).height;
        }
    }
}

pub(super) struct Grayscale(pub AnyElement);

impl IntoElement for Grayscale {
    type Element = Self;

    fn into_element(self) -> Self {
        self
    }
}

impl Element for Grayscale {
    type RequestLayoutState = ();
    type PrepaintState = ();

    fn id(&self) -> Option<ElementId> {
        None
    }

    fn source_location(&self) -> Option<&'static std::panic::Location<'static>> {
        None
    }

    fn request_layout(
        &mut self,
        _: Option<&GlobalElementId>,
        _: Option<&InspectorElementId>,
        window: &mut Window,
        cx: &mut App,
    ) -> (LayoutId, ()) {
        (self.0.request_layout(window, cx), ())
    }

    fn prepaint(
        &mut self,
        _: Option<&GlobalElementId>,
        _: Option<&InspectorElementId>,
        _: Bounds<Pixels>,
        (): &mut (),
        window: &mut Window,
        cx: &mut App,
    ) {
        self.0.prepaint(window, cx);
    }

    fn paint(
        &mut self,
        _: Option<&GlobalElementId>,
        _: Option<&InspectorElementId>,
        _: Bounds<Pixels>,
        (): &mut (),
        (): &mut (),
        window: &mut Window,
        cx: &mut App,
    ) {
        let previous = cx.text_rendering_mode();
        cx.set_text_rendering_mode(TextRenderingMode::Grayscale);
        self.0.paint(window, cx);
        cx.set_text_rendering_mode(previous);
    }
}
