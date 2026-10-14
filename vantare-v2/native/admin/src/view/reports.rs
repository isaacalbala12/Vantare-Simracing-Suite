use super::{
    Admin, Context, Dialog, Div, EMBER, Event, FluentBuilder, GREEN, INK2, ImageSource,
    InteractiveElement, ParentElement, RED, StatefulInteractiveElement, Status, Styled,
    StyledImage, column, date, div, empty_card, eyebrow, heading, img, muted, note, panel, px, rgb,
    status_color, tag, text,
};

impl Admin {
    pub(super) fn reports(&self, cx: &mut Context<Self>) -> Div {
        let mut body = column().child(self.page_head(
            "Informes de testers",
            "Lee lo que te envían y marca en qué punto está cada uno.",
            cx,
        ));
        if let Some(state) = self.list_state("No hay informes en este estado", cx) {
            return body.child(state);
        }
        let mut filters = div().flex().flex_wrap().gap(px(6.)).child(self.button(
            "all-status",
            &format!("Todos  {}", self.state.report_counts.values().sum::<u32>()),
            Event::Filter(None),
            cx,
        ));
        for (i, status) in Status::ALL.into_iter().enumerate() {
            let n = self
                .state
                .report_counts
                .get(status.key())
                .copied()
                .unwrap_or_else(|| {
                    self.state
                        .reports
                        .iter()
                        .filter(|r| r.status == status)
                        .count()
                        .try_into()
                        .unwrap_or(u32::MAX)
                });
            filters = filters.child(
                self.button(
                    "filter",
                    &format!("{}  {n}", status.label()),
                    Event::Filter(Some(status)),
                    cx,
                )
                .id(("filter", i))
                .when(self.state.filter == Some(status), |d| {
                    d.bg(rgb(0x0028_1018)).border_color(rgb(RED))
                }),
            );
        }
        body = body.child(filters);
        let mut list = panel()
            .w(gpui::relative(0.39))
            .flex_shrink_0()
            .p_0()
            .gap_0();
        for (i, r) in self.state.visible_reports() {
            list = list.child(
                div()
                    .id(("report", i))
                    .p(px(16.))
                    .border_t_1()
                    .border_color(gpui::rgba(0xffff_ff0c))
                    .when(
                        self.state
                            .report
                            .as_ref()
                            .is_some_and(|selected| selected.report_id == r.report_id),
                        |d| d.bg(rgb(0x0021_1015)),
                    )
                    .child(
                        div()
                            .flex()
                            .justify_between()
                            .child(tag(r.status.label(), status_color(r.status)))
                            .child(muted(&date(&r.created_at))),
                    )
                    .child(
                        self.button("select-report", &r.title, Event::SelectReport(i), cx)
                            .id(("select-report", i))
                            .h_auto()
                            .p_0()
                            .gap_0()
                            .py(px(7.))
                            .bg(gpui::rgba(0x0000_0000))
                            .border_0(),
                    )
                    .child(muted(&format!("{} · {}", r.author, r.module))),
            );
        }
        if self.state.visible_reports().next().is_none() {
            list = list.child(empty_card("No hay informes en este estado"));
        }
        if self.state.cursor.is_some() {
            list = list.child(self.button("next", "Siguiente página", Event::Next, cx));
        }
        body.child(
            div()
                .flex()
                .items_start()
                .gap(px(18.))
                .child(list)
                .child(self.report_detail(cx)),
        )
    }
    pub(super) fn report_detail(&self, cx: &mut Context<Self>) -> Div {
        let Some(r) = &self.state.report else {
            return panel()
                .flex_1()
                .items_center()
                .py(px(56.))
                .child(heading("Selecciona un informe", 17.))
                .child(muted("A la izquierda tienes los informes de los testers."));
        };
        let mut detail = panel()
            .flex_1()
            .min_w_0()
            .gap(px(14.))
            .child(
                div()
                    .flex()
                    .justify_between()
                    .child(tag(r.status.label(), status_color(r.status)))
                    .child(muted(&format!("Informe {}", r.report_id))),
            )
            .child(heading(&r.title, 20.))
            .child(muted(&format!(
                "{} · {} · {}",
                r.author, r.module, r.app_version
            )))
            .child(text(&r.text, 14.5, INK2));
        if let Some(version) = &r.fixed_in_version {
            detail = detail.child(note(&format!("Arreglado en {version}"), GREEN));
        }
        if let Some(reason) = &r.reject_reason {
            detail = detail.child(note(reason, RED));
        }
        detail = detail.child(eyebrow("CAPTURAS"));
        let mut shots = div().flex().flex_wrap().gap(px(12.));
        for (i, image) in self.images.iter().enumerate() {
            shots = shots.child(
                div()
                    .id(("shot", i))
                    .w(px(180.))
                    .h(px(100.))
                    .rounded(px(12.))
                    .overflow_hidden()
                    .cursor_pointer()
                    .role(gpui::Role::Button)
                    .aria_label("Ampliar captura")
                    .tab_index(0)
                    .child(
                        img(ImageSource::Image(image.clone()))
                            .size_full()
                            .object_fit(gpui::ObjectFit::Contain),
                    )
                    .on_click(cx.listener(move |this, _, _, cx| {
                        this.zoomed = Some(i);
                        cx.notify();
                    }))
                    .on_key_down(cx.listener(move |this, key: &gpui::KeyDownEvent, _, cx| {
                        if matches!(key.keystroke.key.as_str(), "enter" | "space") {
                            this.zoomed = Some(i);
                            cx.notify();
                            cx.stop_propagation();
                        }
                    })),
            );
        }
        detail = detail.child(shots);
        if self.images.is_empty() {
            detail = detail.child(muted(if r.has_screenshots {
                "Capturas no disponibles. Vuelve a abrir el informe."
            } else {
                "Sin capturas adjuntas."
            }));
        }
        if self.image_error.is_some() {
            detail = detail.child(note(
                "No se pudo cargar una captura. Vuelve a abrir el informe para renovarla.",
                EMBER,
            ));
        }
        detail = detail.child(eyebrow("CAMBIAR ESTADO"));
        let mut statuses = div().flex().flex_wrap().gap(px(6.));
        for (i, status) in Status::ALL.into_iter().enumerate() {
            statuses = statuses.child(
                self.button(
                    "status",
                    status.label(),
                    Event::OpenDialog(Dialog::Report(status)),
                    cx,
                )
                .id(("status", i))
                .when(status == r.status, |d| d.border_color(rgb(RED))),
            );
        }
        detail.child(statuses)
    }
}
