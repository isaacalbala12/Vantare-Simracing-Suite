use super::account::{account_demo, purchase_disabled_reason};
use super::{Area, Command, Remote};
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
                button: "Founders · 50 € · precio de fundador",
                included: "Todos los módulos y widgets presentes y futuros, para siempre. Incluye Nightly. Pago único. Disponible desde la beta pública. Este precio subirá más adelante, sin fecha prevista.",
                subscription: "Founders se activa al instante. Si tienes Pro o Pro Plus, se desactiva su renovación al terminar el periodo pagado, sin reembolso automático. El servidor confirma la disponibilidad.",
                owned: "Founders · todo para siempre",
            },
            Self::En => Copy {
                button: "Founders · €50 · founder price",
                included: "All current and future modules and widgets, forever. Includes Nightly. One-time payment. Available from the public beta. This price will rise later, with no date set.",
                subscription: "Founders activates immediately. If you have Pro or Pro Plus, renewal stops at the end of the paid period, with no automatic refund. The server confirms availability.",
                owned: "Founders · everything forever",
            },
            Self::It => Copy {
                button: "Founders · 50 € · prezzo fondatore",
                included: "Tutti i moduli e widget presenti e futuri, per sempre. Include Nightly. Pagamento unico. Disponibile dalla beta pubblica. Il prezzo aumenterà in futuro, senza una data prevista.",
                subscription: "Founders si attiva subito. Con Pro o Pro Plus, il rinnovo termina alla fine del periodo pagato, senza rimborso automatico. Il server conferma la disponibilità.",
                owned: "Founders · tutto per sempre",
            },
            Self::PtBr => Copy {
                button: "Founders · € 50 · preço de fundador",
                included: "Todos os módulos e widgets atuais e futuros, para sempre. Inclui Nightly. Pagamento único. Disponível a partir da beta pública. O preço aumentará no futuro, sem data prevista.",
                subscription: "Founders é ativado imediatamente. Com Pro ou Pro Plus, a renovação termina ao final do período pago, sem reembolso automático. O servidor confirma a disponibilidade.",
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
            .child(self.purchase_buttons(cx))
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
                        this.select_email(crate::services::protocol::EmailMode::SignInCode, cx);
                    }
                }))
            })
    }

    fn purchase_buttons(&self, cx: &mut Context<Self>) -> gpui::Div {
        let signed_in = self.account.signed_in;
        div().flex().flex_col().gap(px(6.0)).children(
            [
                crate::services::protocol::BillingProduct::ProMonthly,
                crate::services::protocol::BillingProduct::ProAnnual,
                crate::services::protocol::BillingProduct::Founders,
            ]
            .into_iter()
            .enumerate()
            .map(|(index, product)| {
                orbit::small_button(
                    ["purchase-monthly", "purchase-annual", "purchase-founders"][index],
                    [
                        "Pro · 5,99 €/mes",
                        "Pro · 59,99 €/año",
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
    }

    pub(super) fn founders_details(&self, cx: &mut Context<Self>) -> gpui::Div {
        let copy = self.founders_language.copy();
        div()
            .w_full()
            .min_w_0()
            .flex()
            .flex_col()
            .gap(px(6.0))
            .child(orbit::text(copy.button, 14.0, 600, orbit::ink_2(cx), cx))
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
            assert!(copy.included.contains("Nightly"));
            assert!(copy.button.contains("50"));
            assert!(copy.owned.starts_with("Founders"));
            assert!(!copy.subscription.is_empty());
        }
    }
}
