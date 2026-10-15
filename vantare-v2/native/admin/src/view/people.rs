use super::{
    Action, Admin, CYAN, Context, Dialog, Div, EMBER, Event, FluentBuilder, GREEN, INK1, INK3,
    InteractiveElement, Module, ParentElement, Plan, RED, S2, Stateful, StatefulInteractiveElement,
    Styled, account_matches, avatar, column, date, div, empty_card, eyebrow, heading, money_amount,
    muted, note, panel, px, rgb, tag, text,
};

impl Admin {
    pub(super) fn users(&self, cx: &mut Context<Self>) -> Div {
        if self.state.user.is_some() {
            return self.user_detail(cx);
        }
        let mut body = column().child(self.page_head(
            "Personas",
            "Busca a alguien para ver su plan, sus pagos y sus permisos.",
            cx,
        ));
        let mut filters = div().flex().gap(px(6.));
        for (i, (filter, label)) in [
            ("all", "Todas"),
            ("paying", "Con plan de pago"),
            ("testers", "Testers"),
            ("blocked", "Bloqueadas"),
        ]
        .into_iter()
        .enumerate()
        {
            let n = self
                .state
                .account_counts
                .get(filter)
                .copied()
                .unwrap_or_else(|| {
                    self.state
                        .users
                        .iter()
                        .filter(|u| account_matches(u, filter))
                        .count()
                        .try_into()
                        .unwrap_or(u32::MAX)
                });
            filters = filters.child(
                self.button(
                    "account-filter",
                    &format!("{label}  {n}"),
                    Event::AccountFilter(filter),
                    cx,
                )
                .id(("account-filter", i))
                .h(px(34.))
                .px(px(13.))
                .when(self.account_filter == filter, |d| {
                    d.bg(rgb(0x0028_1018)).border_color(rgb(RED))
                }),
            );
        }
        body = body.child(
            div()
                .flex()
                .items_center()
                .gap(px(12.))
                .child(self.search_field(cx))
                .child(filters),
        );
        if let Some(state) = self.list_state("Nadie coincide con la búsqueda", cx) {
            return body.child(state);
        }
        let mut table = panel().p_0().gap_0().child(
            div()
                .flex()
                .px(px(20.))
                .h(px(42.))
                .items_center()
                .child(div().flex_1().child(eyebrow("PERSONA")))
                .child(div().w(px(132.)).child(eyebrow("PLAN")))
                .child(div().w(px(126.)).child(eyebrow("ESTADO")))
                .child(div().w(px(80.)).child(eyebrow("INFORMES")))
                .child(div().w(px(130.)).child(eyebrow("ÚLTIMA VEZ"))),
        );
        let query = self.search.read(cx).value.to_lowercase();
        let mut visible = 0;
        for (i, user) in self.state.users.iter().enumerate() {
            if !account_matches(user, self.account_filter)
                || !format!(
                    "{} {}",
                    user.name.as_deref().unwrap_or(""),
                    user.email.as_deref().unwrap_or("")
                )
                .to_lowercase()
                .contains(&query)
            {
                continue;
            }
            visible += 1;
            table = table.child(Self::user_row(i, user, cx));
        }
        if visible == 0 {
            table = table.child(empty_card("Nadie coincide con la búsqueda"));
        }
        body = body.child(table);
        if self.state.users_cursor.is_some() {
            body = body.child(self.button("next-users", "Siguiente página", Event::NextUsers, cx));
        }
        body.child(muted(
            "Los filtros se aplican a la página cargada. Los recuentos incluyen todas las cuentas.",
        ))
    }
    pub(super) fn user_detail(&self, cx: &mut Context<Self>) -> Div {
        let Some(user) = &self.state.user else {
            return empty_card("Selecciona una persona");
        };
        let name = user.name.as_deref().unwrap_or("Sin nombre");
        let mut body = column().child(
            div()
                .flex()
                .items_center()
                .gap(px(18.))
                .child(avatar(name, 62.))
                .child(
                    column()
                        .flex_1()
                        .gap(px(6.))
                        .child(heading(name, 28.))
                        .child(muted(&format!(
                            "{} · Cuenta desde el {} · Última vez: {}",
                            user.email.as_deref().unwrap_or("Sin correo"),
                            date(&user.created_at),
                            user.last_seen_at.as_deref().unwrap_or("Sin datos")
                        )))
                        .child(
                            div()
                                .flex()
                                .gap(px(6.))
                                .child(tag(&super::plan_label(user), GREEN))
                                .when(user.owner, |d| d.child(tag("Dueño", GREEN)))
                                .when(user.blocked, |d| d.child(tag("Bloqueada", RED)))
                                .when(
                                    user.roles.iter().any(|r| r == "tester") && !user.owner,
                                    |d| d.child(tag("Tester", CYAN)),
                                ),
                        ),
                )
                .child(
                    self.button("back", "‹ Volver", Event::Back, cx)
                        .bg(gpui::transparent_black())
                        .border_0(),
                ),
        );
        if user.blocked {
            body = body.child(note(
                "Esta cuenta está bloqueada. Desbloquearla no reactiva su suscripción.",
                RED,
            ));
        }
        body.child(
            div()
                .flex()
                .items_start()
                .gap(px(18.))
                .child(
                    column()
                        .flex_1()
                        .min_w_0()
                        .child(Self::person_plan(user))
                        .when_some(user.report_promotion.as_ref(), |d, promotion| {
                            d.child(panel().child(eyebrow("PROMOCIÓN POR INFORMES")).child(muted(&promotion.summary())))
                        })
                        .child(self.person_danger(user, cx)),
                )
                .child(
                    div()
                        .w(gpui::relative(0.44))
                        .flex_shrink_0()
                        .child(self.person_accesses(user, cx)),
                ),
        )
    }
    pub(super) fn payments(payments: &[crate::client::Payment]) -> Div {
        let mut table = column().gap(px(8.)).child(eyebrow("COMPRAS"));
        if payments.is_empty() {
            return table.child(muted("Todavía no tiene pagos."));
        }
        table = table.child(
            div()
                .flex()
                .gap(px(10.))
                .child(div().w(px(94.)).child(eyebrow("FECHA")))
                .child(div().flex_1().child(eyebrow("COMPRA EN POLAR")))
                .child(div().w(px(70.)).child(eyebrow("PAGÓ")))
                .child(div().w(px(100.)).child(eyebrow("ESTADO"))),
        );
        for (i, p) in payments.iter().enumerate() {
            table = table.child(
                div()
                    .id(("payment", i))
                    .flex()
                    .items_center()
                    .gap(px(10.))
                    .py(px(10.))
                    .border_t_1()
                    .border_color(gpui::rgba(0xffff_ff0c))
                    .child(div().w(px(94.)).child(muted(&date(&p.paid_at))))
                    .child(div().flex_1().min_w_0().child(text(
                        &format!(
                            "{}{}",
                            p.product,
                            if p.amount_basis.as_deref() == Some("net") {
                                " · neto"
                            } else {
                                ""
                            }
                        ),
                        13.,
                        INK1,
                    )))
                    .child(div().w(px(70.)).child(text(
                        &format!(
                            "{} {}",
                            money_amount(p.amount_cents),
                            if p.currency == "eur" {
                                "€"
                            } else {
                                &p.currency
                            }
                        ),
                        13.,
                        INK1,
                    )))
                    .child(div().w(px(100.)).child(tag(
                        match p.status.as_str() {
                            "refunded" => "Reembolsado",
                            "partially_refunded" => "Parcial",
                            "refund_pending" => "Pendiente",
                            _ => "Pagado",
                        },
                        if p.status == "paid" { GREEN } else { CYAN },
                    ))),
            );
            if let Some(reason) = &p.refund_reason {
                let reason = match reason.as_str() {
                    "customer_request" => "Solicitado por el cliente",
                    "duplicate" => "Cobro duplicado",
                    "fraudulent" => "Posible fraude",
                    "other" => "Otro motivo",
                    other => other,
                };
                table = table.child(muted(&format!(
                    "Reembolso: {}{}",
                    reason,
                    p.refunded_at
                        .as_ref()
                        .map_or(String::new(), |stamp| format!(
                            " · confirmado {}",
                            date(stamp)
                        ))
                )));
            }
        }
        table
    }
    fn user_row(i: usize, user: &crate::client::User, cx: &mut Context<Self>) -> Stateful<Div> {
        let name = user.name.as_deref().unwrap_or("Sin nombre");
        let entity = cx.entity().downgrade();
        div()
            .id(("person", i))
            .flex()
            .items_center()
            .h(px(58.))
            .px(px(20.))
            .border_t_1()
            .border_color(gpui::rgba(0xffff_ff0c))
            .cursor_pointer()
            .role(gpui::Role::Button)
            .aria_label(format!("Abrir {name}"))
            .tab_index(0)
            .child(
                div()
                    .flex_1()
                    .flex()
                    .items_center()
                    .gap(px(12.))
                    .child(avatar(name, 36.))
                    .child(
                        column()
                            .gap(px(2.))
                            .child(text(name, 13.5, INK1))
                            .child(text(
                                user.email.as_deref().unwrap_or("Sin correo"),
                                12.5,
                                INK3,
                            )),
                    ),
            )
            .child(div().w(px(132.)).flex().child(tag(
                &super::plan_label(user),
                if user.plan == Plan::ProPlus {
                    RED
                } else {
                    INK3
                },
            )))
            .child(
                div()
                    .w(px(126.))
                    .flex()
                    .flex_wrap()
                    .gap(px(4.))
                    .when(user.blocked, |d| d.child(tag("Bloqueada", RED)))
                    .when(!user.blocked && user.owner, |d| {
                        d.child(tag("Tú · dueño", GREEN))
                    })
                    .when(
                        !user.blocked && user.roles.iter().any(|r| r == "tester"),
                        |d| d.child(tag("Tester", GREEN)),
                    )
                    .when(
                        !user.blocked && !user.owner && !user.roles.iter().any(|r| r == "tester"),
                        |d| d.child(tag("—", INK3)),
                    ),
            )
            .child(div().w(px(80.)).child(user.reports_count.to_string()))
            .child(div().w(px(114.)).child(text(
                &date(user.last_seen_at.as_deref().unwrap_or("Sin datos")),
                12.5,
                INK3,
            )))
            .child(text("›", 18., INK3))
            .on_a11y_action(gpui::AccessibleAction::Click, move |_, window, cx| {
                let _ = entity.update(cx, |this, cx| this.event(Event::SelectUser(i), cx));
                window.refresh();
            })
            .on_click(cx.listener(move |this, _, _, cx| this.event(Event::SelectUser(i), cx)))
            .on_key_down(cx.listener(move |this, key: &gpui::KeyDownEvent, _, cx| {
                if matches!(key.keystroke.key.as_str(), "enter" | "space") {
                    this.event(Event::SelectUser(i), cx);
                    cx.stop_propagation();
                }
            }))
    }

    fn person_plan(user: &crate::client::User) -> Div {
        let total: i64 = user
            .payments
            .iter()
            .map(|p| p.amount_cents - p.refunded_cents)
            .sum();
        let refunds: i64 = user.payments.iter().map(|p| p.refunded_cents).sum();
        panel()
            .gap(px(14.))
            .child(heading("Plan y pagos", 15.))
            .child(
                div()
                    .flex()
                    .items_center()
                    .justify_between()
                    .p(px(16.))
                    .rounded(px(14.))
                    .bg(rgb(S2))
                    .border_1()
                    .border_color(gpui::rgba(0xf047_5540))
                    .child(
                        column()
                            .gap(px(5.))
                            .child(eyebrow("PLAN ACTUAL"))
                            .child(heading(
                                &format!("{}{}", super::plan_label(user), if user.billing.as_deref() == Some("monthly") { " mensual" } else { "" }),
                                20.,
                            ))
                            .when_some(user.renews_at.as_ref(), |d, renew| {
                                d.child(muted(&format!("Se renueva el {}", date(renew))))
                            }),
                    )
                    .child(
                        column()
                            .gap(px(4.))
                            .items_end()
                            .child(eyebrow(if user.payments.iter().any(|p|p.amount_basis.as_deref()==Some("net")) {"IMPORTE REGISTRADO"} else {"HA PAGADO EN TOTAL"}))
                            .child(heading(&super::money(total), 22.)),
                    ),
            )
            .child(muted(&format!(
                "Código de creador: {}",
                user.creator_code
                    .as_ref()
                    .map_or("No usó ninguno".into(), |c| format!(
                        "{} · {} · 20 % de descuento",
                        c.code, c.creator_name
                    ))
            )))
            .child(muted(&format!(
                "Reembolsos: {}",
                if refunds > 0 {
                    super::money(refunds)
                } else {
                    "Ninguno".into()
                }
            )))
            .when(user.payments.iter().any(|p|p.amount_basis.as_deref()==Some("net")), |d|d.child(note("Los pagos históricos marcados como netos no incluyen impuestos y muestran su fecha de registro.",EMBER)))
            .child(Self::payments(&user.payments))
    }

    fn person_accesses(&self, user: &crate::client::User, cx: &mut Context<Self>) -> Div {
        let mut accesses = panel().gap(px(14.)).child(heading("Permisos", 15.)).child(
            div()
                .flex()
                .items_center()
                .justify_between()
                .child(
                    column()
                        .gap(px(3.))
                        .child(text("Tester", 13.5, INK1))
                        .child(muted("Puede probar y enviar informes")),
                )
                .child(self.switch(
                    "tester",
                    user.roles.iter().any(|r| r == "tester"),
                    Action::SetTester {
                        account_id: user.account_id.clone(),
                        enabled: !user.roles.iter().any(|r| r == "tester"),
                    },
                    cx,
                )),
        );
        for module in Module::ALL {
            let access = user.module_access.iter().find(|a| a.module == module);
            let individual = access.is_some_and(|a| a.individual);
            let source = if access.is_some_and(|a| a.rollout) {
                "Para todos"
            } else if access.is_some_and(|a| a.plan) {
                "Incluido en su plan"
            } else if !user.roles.is_empty() {
                "Por su rol"
            } else if individual {
                "Solo para esta persona"
            } else {
                "Sin acceso"
            };
            accesses = accesses.child(
                div()
                    .flex()
                    .items_center()
                    .justify_between()
                    .py(px(9.))
                    .border_t_1()
                    .border_color(gpui::rgba(0xffff_ff0c))
                    .child(
                        column()
                            .gap(px(3.))
                            .child(text(module.label(), 13.5, INK1))
                            .child(muted(source)),
                    )
                    .when(access.is_some_and(|a| a.rollout), |d| {
                        d.child(tag("Para todos", GREEN))
                    })
                    .when(!access.is_some_and(|a| a.rollout), |d| {
                        d.child(self.switch(
                            module.key(),
                            individual,
                            Action::SetModule {
                                account_id: user.account_id.clone(),
                                module,
                                enabled: !individual,
                            },
                            cx,
                        ))
                    }),
            );
        }
        accesses
    }

    fn person_danger(&self, user: &crate::client::User, cx: &mut Context<Self>) -> Div {
        let mut danger = panel()
            .gap(px(12.))
            .border_color(gpui::rgba(0xf047_5538))
            .child(heading("Cuenta", 15.));
        if user.owner || user.roles.iter().any(|r| r == "owner") {
            danger = danger.child(note(
                "Esta es la cuenta del dueño. No se puede bloquear ni borrar.",
                GREEN,
            ));
        } else {
            danger = danger.child(
                div()
                    .flex()
                    .items_center()
                    .justify_between()
                    .child(
                        column()
                            .child(text(
                                if user.blocked {
                                    "Desbloquear cuenta"
                                } else {
                                    "Bloquear cuenta"
                                },
                                13.5,
                                INK1,
                            ))
                            .child(muted(if user.blocked {
                                "Puede volver a entrar. No reactiva la suscripción."
                            } else {
                                "No podrá entrar. Cancela su suscripción."
                            })),
                    )
                    .child(
                        self.button(
                            "block",
                            if user.blocked {
                                "Desbloquear"
                            } else {
                                "Bloquear"
                            },
                            Event::OpenDialog(Dialog::Block(!user.blocked)),
                            cx,
                        )
                        .text_color(rgb(EMBER)),
                    ),
            );
            danger = danger.child(
                div()
                    .flex()
                    .items_center()
                    .justify_between()
                    .child(
                        column()
                            .child(text("Borrar cuenta", 13.5, INK1))
                            .child(muted("No se puede deshacer.")),
                    )
                    .child(
                        self.button("delete", "Borrar…", Event::OpenDialog(Dialog::Delete), cx)
                            .text_color(rgb(RED)),
                    ),
            );
        }
        danger
    }

    fn search_field(&self, cx: &mut Context<Self>) -> Div {
        div()
            .relative()
            .flex_1()
            .min_w(px(180.))
            .max_w(px(520.))
            .child(self.search.clone())
            .when(self.search.read(cx).value.is_empty(), |d| {
                d.child(
                    div()
                        .absolute()
                        .left(px(16.))
                        .top(px(12.))
                        .child(text("Busca por nombre o correo", 14., INK3))
                        .on_mouse_down(
                            gpui::MouseButton::Left,
                            cx.listener(|this, _, window, cx| {
                                this.search.read(cx).focus_handle().focus(window, cx);
                            }),
                        ),
                )
            })
    }
}
