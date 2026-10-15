use super::{Area, Command, Remote, account_demo, purchase_disabled_reason};
use crate::orbit;
use gpui::{Context, div, prelude::*, px};

#[derive(Clone, Copy, Default)]
pub(super) enum Language {
    #[default]
    Es,
    En,
    It,
    PtBr,
}

pub(super) struct Copy {
    pub button: &'static str,
    pub included: &'static str,
    pub subscription: &'static str,
    pub owned: &'static str,
}

impl Language {
    pub fn copy(self) -> Copy {
        match self {
            Self::Es => Copy {
                button: "Founders · 50 € · pago único",
                included: "Todos los módulos y widgets presentes y futuros, para siempre. Sin caducidad ni renovación.",
                subscription: "Con una suscripción vigente, la compra queda bloqueada para evitar otro cobro. No se cancela automáticamente. El servidor confirma la disponibilidad de venta.",
                owned: "Founders · todo para siempre",
            },
            Self::En => Copy {
                button: "Founders · €50 · one-time payment",
                included: "All current and future modules and widgets, forever. No expiry or renewal.",
                subscription: "Purchases are blocked while a subscription is current to avoid another charge. It is never cancelled automatically. The server confirms sale availability.",
                owned: "Founders · everything forever",
            },
            Self::It => Copy {
                button: "Founders · 50 € · pagamento unico",
                included: "Tutti i moduli e widget presenti e futuri, per sempre. Senza scadenza né rinnovo.",
                subscription: "L’acquisto è bloccato con un abbonamento in corso per evitare un altro addebito. Nessuna cancellazione automatica. Il server conferma la disponibilità della vendita.",
                owned: "Founders · tutto per sempre",
            },
            Self::PtBr => Copy {
                button: "Founders · € 50 · pagamento único",
                included: "Todos os módulos e widgets atuais e futuros, para sempre. Sem vencimento nem renovação.",
                subscription: "A compra é bloqueada enquanto houver uma assinatura vigente para evitar outra cobrança. Nenhum cancelamento automático. O servidor confirma a disponibilidade da venda.",
                owned: "Founders · tudo para sempre",
            },
        }
    }
}

impl Remote {
    pub(super) fn account_identity_actions(&self, cx: &mut Context<Self>) -> gpui::Div {
        if account_demo().is_some() {
            return div()
                .flex()
                .flex_none()
                .flex_col()
                .gap(px(6.0))
                .child(
                    orbit::small_button("services-account-check", "Comprobar acceso", cx)
                        .tab_stop(false),
                )
                .child(
                    orbit::small_button("services-sign-out", "Cerrar sesión", cx)
                        .tab_stop(false)
                        .aria_description("Datos de demostración; acciones deshabilitadas"),
                );
        }
        let signed_in = self.account.signed_in;
        let can_start = self.requires_access();
        div()
            .flex()
            .flex_none()
            .flex_col()
            .gap(px(6.0))
            .child(
                orbit::small_button(
                    "services-account-check",
                    if self.working() && matches!(self.active, Area::Licenses { .. }) {
                        "Comprobando…"
                    } else {
                        "Comprobar acceso"
                    },
                    cx,
                )
                .tab_stop(!self.working())
                .when(self.working(), |button| button.opacity(orbit::DISABLED))
                .on_click(cx.listener(|this, _, _, cx| {
                    if !this.working() {
                        this.request(Command::LicenseRenew, cx);
                    }
                })),
            )
            .child(self.founders_details(cx))
            .children(
                [
                    crate::services::protocol::BillingProduct::ProMonthly,
                    crate::services::protocol::BillingProduct::ProAnnual,
                    crate::services::protocol::BillingProduct::LaunchLifetime,
                    crate::services::protocol::BillingProduct::Founders,
                ]
                .into_iter()
                .enumerate()
                .map(|(index, product)| {
                    orbit::small_button(
                        [
                            "purchase-monthly",
                            "purchase-annual",
                            "purchase-launch",
                            "purchase-founders",
                        ][index],
                        [
                            "Pro · 5,99 €/mes",
                            "Pro · 59,90 €/año",
                            "Launch · 30 €",
                            self.founders_language.copy().button,
                        ][index],
                        cx,
                    )
                    .tab_stop(signed_in && !self.working())
                    .when_some(
                        purchase_disabled_reason(signed_in, self.working()),
                        orbit::disabled,
                    )
                    .on_click(cx.listener(move |this, _, _, cx| {
                        if this.account.signed_in && !this.working() {
                            this.request(Command::Purchase { product }, cx);
                        }
                    }))
                }),
            )
            .child(if signed_in {
                orbit::small_button("services-sign-out", "Cerrar sesión", cx)
                    .tab_stop(!self.working())
                    .when(self.working(), |button| button.opacity(orbit::DISABLED))
                    .on_click(cx.listener(|this, _, _, cx| {
                        if !this.working() {
                            this.request(Command::Logout, cx);
                        }
                    }))
            } else {
                orbit::small_button(
                    "services-login",
                    if self.account.pending {
                        "Esperando…"
                    } else {
                        "Iniciar sesión"
                    },
                    cx,
                )
                .tab_stop(can_start && !self.working())
                .when(!can_start || self.working(), |button| {
                    button
                        .opacity(orbit::DISABLED)
                        .aria_description("El servicio de cuenta no está configurado")
                })
                .on_click(cx.listener(|this, _, _, cx| {
                    if this.requires_access() && !this.working() {
                        this.request(Command::AccountBegin, cx);
                    }
                }))
            })
    }

    pub(super) fn founders_details(&self, cx: &mut Context<Self>) -> gpui::Div {
        let copy = self.founders_language.copy();
        div()
            .flex()
            .flex_col()
            .gap(px(6.0))
            .child(orbit::text(copy.included, 12.0, 400, orbit::ink_2(cx), cx))
            .child(orbit::text(
                copy.subscription,
                12.0,
                400,
                orbit::ink_3(cx),
                cx,
            ))
            .child(
                div().flex().gap(px(6.0)).children(
                    [
                        ("founders-es", "ES", Language::Es),
                        ("founders-en", "EN", Language::En),
                        ("founders-it", "IT", Language::It),
                        ("founders-pt", "PT-BR", Language::PtBr),
                    ]
                    .into_iter()
                    .map(|(id, label, language)| {
                        orbit::small_button(id, label, cx).on_click(cx.listener(
                            move |this, _, _, cx| {
                                this.founders_language = language;
                                cx.notify();
                            },
                        ))
                    }),
                ),
            )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn all_founders_languages_describe_a_one_time_plan_with_future_content() {
        for (language, future) in [
            (Language::Es, "futuros"),
            (Language::En, "future"),
            (Language::It, "futuri"),
            (Language::PtBr, "futuros"),
        ] {
            let copy = language.copy();
            assert!(copy.included.contains(future));
            assert!(copy.button.contains("50"));
            assert!(copy.owned.starts_with("Founders"));
            assert!(!copy.subscription.is_empty());
        }
    }
}
