use super::{
    Admin, Context, Dialog, Div, EMBER, Event, FluentBuilder, GREEN, INK1, INK2, INK3,
    InteractiveElement, ParentElement, RED, S1, Stateful, Styled, avatar, column, date, div,
    empty_card, eyebrow, heading, kpi, money, muted, note, panel, px, rgb, tag, text,
};

impl Admin {
    pub(super) fn creators(&self, cx: &mut Context<Self>) -> Div {
        if self.state.creator.is_some() {
            return self.creator_detail(cx);
        }
        let mut body = column().child(
            div()
                .flex()
                .items_end()
                .justify_between()
                .mb(px(4.))
                .child(
                    column()
                        .gap(px(6.))
                        .child(heading("Creadores", 30.))
                        .child(text(
                            "Quién trae clientes con su código y cuánto le debes.",
                            14.,
                            INK3,
                        )),
                )
                .child(
                    self.button(
                        "new-creator",
                        "+ Añadir creador",
                        Event::OpenDialog(Dialog::Creator),
                        cx,
                    )
                    .bg(rgb(0x00f3_eeee))
                    .text_color(rgb(0x001c_1719)),
                ),
        );
        if let Some(state) = self.list_state("Todavía no hay creadores", cx) {
            return body.child(state);
        }
        let owed = self.state.creators.iter().map(|c| c.owed_cents).sum();
        let sales = self.state.creators.iter().map(|c| c.sales_cents).sum();
        let clients = self
            .state
            .creators
            .iter()
            .map(|c| c.clients_count)
            .sum::<u32>();
        body = body.child(
            div()
                .flex()
                .gap(px(16.))
                .child(kpi("LES DEBES EN TOTAL", &money(owed), true))
                .child(kpi("VENTAS CON CÓDIGO", &money(sales), false))
                .child(kpi("CLIENTES CON CÓDIGO", &clients.to_string(), false)),
        );
        let mut rows = panel().p_0().gap_0().child(
            div()
                .flex()
                .h(px(42.))
                .items_center()
                .px(px(20.))
                .child(div().flex_1().child(eyebrow("CREADOR")))
                .child(div().w(px(152.)).child(eyebrow("CÓDIGO")))
                .child(div().w(px(70.)).child(eyebrow("CLIENTES")))
                .child(div().w(px(95.)).child(eyebrow("VENTAS")))
                .child(div().w(px(95.)).child(eyebrow("YA PAGADO")))
                .child(div().w(px(95.)).child(eyebrow("SE LE DEBE"))),
        );
        for (i, c) in self.state.creators.iter().enumerate() {
            rows = rows.child(self.creator_row(i, c, cx));
        }
        if self.state.creators.is_empty() {
            rows = rows.child(empty_card("Todavía no hay creadores"));
        }
        body.when(self.state.creators.iter().any(|c| !c.history_complete), |d| d.child(note("Hay historiales incompletos. Abre cada creador antes de pagar.", EMBER))).child(rows).child(note("30 % el primer mes · 10 % del mes 2 al 12 · sobre lo cobrado y no reembolsado. Se paga al cerrar el mes.",INK3))
    }
    pub(super) fn creator_detail(&self, cx: &mut Context<Self>) -> Div {
        let Some(c) = &self.state.creator else {
            return empty_card("Selecciona un creador");
        };
        let mut body = column()
            .child(
                div().flex().child(
                    self.button("back", "‹ Creadores", Event::Back, cx)
                        .border_0()
                        .bg(gpui::transparent_black()),
                ),
            )
            .child(
                div()
                    .flex()
                    .items_center()
                    .justify_between()
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(18.))
                            .child(avatar(&c.name, 62.))
                            .child(
                                column()
                                    .gap(px(6.))
                                    .child(heading(&c.name, 28.))
                                    .child(muted(&c.email))
                                    .child(tag(&c.code, INK2)),
                            ),
                    )
                    .when(c.payable_cents > 0 && c.history_complete, |d| {
                        d.child(
                            self.button(
                                "payout",
                                "Apuntar pago",
                                Event::OpenDialog(Dialog::Payout),
                                cx,
                            )
                            .bg(rgb(0x00f3_eeee))
                            .text_color(rgb(0x001c_1719)),
                        )
                    }),
            );
        if !c.history_complete {
            body = body.child(note("Historial incompleto. Las comisiones son provisionales y no se puede apuntar un pago. Actualiza para volver a comprobarlo.", EMBER));
        }
        if c.status == "pending" {
            body=body.child(note("El código aún no está activo en Polar. Repite el alta con los mismos datos para terminar.",EMBER));
        }
        body = body.child(div().flex().gap(px(16.))
            .child(kpi("SE LE DEBE", &money(c.owed_cents), true)
                .child(muted(&c.last_payout_at.as_ref().map_or("Aún no le has pagado nada".to_owned(), |v| format!("Último pago: {}", date(v))))))
            .child(kpi("HA GANADO EN TOTAL", &money(c.earned_cents), false)
                .child(muted(&format!("Ya pagado: {}", money(c.paid_out_cents)))))
            .child(kpi("CLIENTES", &c.clients_count.to_string(), false)
                .child(muted(&format!("Ventas: {}", money(c.sales_cents))))))
            .child(note(&format!("Disponible para pagar de meses cerrados: {}. Las comisiones ya liquidadas no se reclaman por reembolsos posteriores.", money(c.payable_cents)), INK3));

        let mut rows = panel()
            .gap(px(12.))
            .child(heading("De dónde sale su comisión", 15.));
        for (i, line) in self.state.creator_lines.iter().enumerate() {
            let p = &line.payment;
            rows = rows.child(
                div()
                    .id(("commission", i))
                    .flex()
                    .items_center()
                    .gap(px(12.))
                    .py(px(9.))
                    .border_t_1()
                    .border_color(gpui::rgba(0xffff_ff0c))
                    .child(
                        column()
                            .flex_1()
                            .gap(px(4.))
                            .child(text(
                                line.name
                                    .as_deref()
                                    .or(line.email.as_deref())
                                    .unwrap_or("Cuenta sin nombre"),
                                13.5,
                                INK1,
                            ))
                            .child(muted(&format!(
                                "{} · {} · mes {}",
                                date(&p.paid_at),
                                p.product,
                                p.period_index
                            ))),
                    )
                    .child(div().w(px(82.)).child(money(p.amount_cents)))
                    .child(div().w(px(54.)).child(format!("{} %", line.rate_bp / 100)))
                    .child(
                        div()
                            .w(px(85.))
                            .child(text(&money(line.commission_cents), 14., GREEN)),
                    ),
            );
        }
        if self.state.creator_lines.is_empty() {
            rows = rows.child(empty_card("Todavía no tiene ventas con su código"));
        }
        body.child(rows)
    }
    fn creator_row(
        &self,
        i: usize,
        c: &crate::client::Creator,
        cx: &mut Context<Self>,
    ) -> Stateful<Div> {
        div()
            .id(("creator", i))
            .flex()
            .items_center()
            .h(px(58.))
            .px(px(20.))
            .border_t_1()
            .border_color(gpui::rgba(0xffff_ff0c))
            .child(
                div()
                    .flex_1()
                    .flex()
                    .gap(px(12.))
                    .items_center()
                    .child(avatar(&c.name, 36.))
                    .child(
                        column()
                            .gap(px(2.))
                            .child(
                                self.button("select-creator", &c.name, Event::SelectCreator(i), cx)
                                    .id(("select-creator", i))
                                    .bg(rgb(S1))
                                    .p_0()
                                    .gap_0()
                                    .border_0(),
                            )
                            .child(muted(&c.email)),
                    ),
            )
            .child(div().w(px(152.)).child(tag(&c.code, INK2)))
            .child(div().w(px(70.)).child(c.clients_count.to_string()))
            .child(div().w(px(95.)).child(money(c.sales_cents)))
            .child(div().w(px(95.)).child(money(c.paid_out_cents)))
            .child(div().w(px(95.)).child(text(
                &money(c.owed_cents),
                14.,
                if c.owed_cents > 0 { RED } else { INK3 },
            )))
    }
}
