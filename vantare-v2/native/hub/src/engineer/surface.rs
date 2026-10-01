//! Composición de Engineer dentro de la shell; un solo árbol visual para uso y captura.
use super::{Engineer, TEXT, text};
use gpui::{
    Context, Div, IntoElement, Pixels, Size, Window, anchored, canvas, deferred, div, point,
    prelude::*, px, rgb,
};

pub(super) fn render(
    engineer: &Engineer,
    page: impl IntoElement,
    window: &Window,
    cx: &mut Context<Engineer>,
) -> Div {
    // Composición local: la shell aún no ofrece una ranura sin su cabecera
    // genérica. El origen horizontal sigue el ancho real de la columna.
    let demo = engineer.demo.is_some();
    let top = if demo { 110.0 } else { 70.0 };
    let surface = div()
        .id("engineer-page-scroll")
        .w(window.viewport_size().width - engineer.content_left)
        // El harness Wails añade su franja sin reducir el 100vh de la shell.
        // La captura también conserva ese alto; el borde inferior queda recortado.
        .h(window.viewport_size().height - px(70.0))
        .bg(rgb(crate::orbit::CANVAS))
        .overflow_y_scroll()
        .track_scroll(&engineer.history_scroll)
        .child(page);
    let entity = cx.weak_entity();
    let mut root = div()
        .relative()
        .w_full()
        .h(px(0.0))
        .child(
            canvas(
                move |bounds, _, cx| {
                    if let Some(entity) = entity.upgrade() {
                        entity.update(cx, |this, cx| {
                            let left = bounds.left() - px(crate::orbit::GUTTER);
                            if this.content_left != left {
                                this.content_left = left;
                                cx.notify();
                            }
                        });
                    }
                },
                |_, (), _, _| {},
            )
            .absolute()
            .size_full(),
        )
        .child(deferred(
            anchored()
                .position(point(engineer.content_left, px(top)))
                .child(
                    div()
                        .relative()
                        .w(window.viewport_size().width - engineer.content_left)
                        .h(window.viewport_size().height - px(top))
                        .child(surface.absolute().top_0().left_0()),
                ),
        ));
    if demo {
        root = capture_chrome(root, engineer.content_left, window.viewport_size());
    }
    root
}

fn capture_chrome(root: Div, left: Pixels, viewport: Size<Pixels>) -> Div {
    // Artefactos del harness Wails, exclusivamente en --capture engineer-*.
    // No desplazan la shell ni alteran los estados de usuario en uso normal.
    root.child(deferred(
        anchored().position(point(px(0.0), px(0.0))).child(
            div()
                .w(viewport.width)
                .h(px(40.0))
                .bg(rgb(0x0054_3f18))
                .p(px(8.0))
                .child(text(
                    "Harness sintético · no valida LMU ni audio real",
                    16.0,
                    400,
                    TEXT,
                )),
        ),
    ))
    .child(deferred(
        anchored().position(point(left, px(40.0))).child(
            div()
                .relative()
                .w(viewport.width - left)
                .h(px(70.0))
                .flex()
                .items_center()
                .gap(px(10.0))
                .px(px(26.0))
                .bg(rgb(crate::orbit::CANVAS))
                .border_b_1()
                .border_color(rgb(0x001b_1c1e))
                .child(crate::orbit::tracked_text(
                    "TELEMETRY CORE",
                    10.5,
                    700,
                    crate::orbit::INK_4,
                    1.155,
                ))
                .child(text("/", 12.0, 400, crate::orbit::INK_4))
                .child(text("Ingeniero", 16.0, 700, TEXT))
                .child(
                    crate::orbit::icon("i-campana", 14.0, crate::orbit::INK_4)
                        .absolute()
                        .right(px(26.0))
                        .top(px(28.0)),
                ),
        ),
    ))
    .child(deferred(
        anchored().position(point(px(81.0), px(40.0))).child(
            div()
                .w(left - px(81.0))
                .h(px(70.0))
                .flex()
                .items_center()
                .justify_between()
                .px(px(23.0))
                .bg(rgb(0x000f_1012))
                .child(text("Ingeniero", 14.0, 700, TEXT))
                .child(crate::orbit::mono_text("v0.3.9", 10.0, crate::orbit::INK_4))
                .child(text("‹", 16.0, 400, crate::orbit::INK_4)),
        ),
    ))
}
