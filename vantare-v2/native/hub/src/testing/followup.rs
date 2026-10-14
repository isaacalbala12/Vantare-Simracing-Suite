//! Account-scoped follow-up; no synthetic history or private text in notices.
use super::view::Testing;
use crate::{orbit, services::protocol::Command};
use gpui::{Context, div, prelude::*, px};

impl Testing {
    pub(super) fn reports_panel(&self, cx: &mut Context<Self>) -> gpui::Div {
        let remote = self.remote.read(cx);
        let ready = remote.participation_ready();
        let data = remote.participation.contributions.clone();
        let message = remote.participation_message.clone();
        let has_receipts = !remote.report_receipts.is_empty();
        let mut rows = div()
            .id("testing-account-reports")
            .flex_1()
            .min_h_0()
            .overflow_y_scroll()
            .flex()
            .flex_col()
            .gap(px(10.0));
        if data.is_empty() {
            rows = rows.child(orbit::empty_state(
                "Aún no hay informes cargados",
                "Inicia sesión y recarga para consultar tus informes.",
                cx,
            ));
        }
        for report in data {
            rows = rows.child(Self::report_row(&report, ready, cx));
        }
        orbit::neo_card(cx)
            .flex_1()
            .min_h_0()
            .gap(px(10.0))
            .child(orbit::neo_header("Mis informes", "v-testing", cx))
            .child(orbit::text("Últimos 20 informes de tu cuenta, entre canales. Los recibos antiguos se muestran aparte.", 11.0, 400, orbit::ink_3(cx), cx))
            .child(orbit::text(message, 12.0, 400, orbit::ink_2(cx), cx))
            .child(
                orbit::small_button("testing-reports-refresh", "Recargar", cx)
                    .when(!ready, |button| {
                        orbit::disabled(button, "Inicia sesión o espera la operación actual")
                    })
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.remote.update(cx, |remote, cx| {
                            remote.participation_request(Command::TestingRefresh, cx);
                        });
                    })),
            )
            .child(rows)
            .when(has_receipts, |card| {
                card.child(self.session_reports_panel(cx))
            })
    }
    fn report_row(
        report: &crate::services::protocol::testing_document::Contribution,
        ready: bool,
        cx: &mut Context<Self>,
    ) -> gpui::Div {
        let (label, tone) = match report.state.as_str() {
            "received" => ("Recibido", orbit::Tone::Neutral),
            "reviewing" => ("En revisión", orbit::Tone::Warning),
            "accepted" => ("Aceptado", orbit::Tone::Accent),
            "fixed" if report.fixed_version.is_some() => ("Arreglado", orbit::Tone::Success),
            "declined" | "spam" => ("No aceptado", orbit::Tone::Neutral),
            _ => ("Estado no disponible", orbit::Tone::Neutral),
        };
        let credit = cx.new(|cx| {
            orbit::Checkbox::new("Quiero aparecer en los agradecimientos", report.credit, cx)
        });
        let credit_id = report.id.clone();
        cx.subscribe(&credit, move |this, _, event: &orbit::Checked, cx| {
            this.remote.update(cx, |remote, cx| {
                remote.participation_request(
                    Command::TestingCredit {
                        id: credit_id.clone(),
                        consent: event.0,
                    },
                    cx,
                );
            });
        })
        .detach();
        credit.update(cx, |credit, _| credit.enabled = ready);
        let mut row = orbit::neo_card(cx).flex_none().gap(px(8.0))
            .child(div().flex().justify_between().gap(px(10.0))
                .child(orbit::text(report.title.clone(), 14.0, 600, orbit::ink(cx), cx))
                .child(orbit::tag(label, tone, cx)))
            .child(orbit::meta(&report.id, 10.0, orbit::ink_3(cx), cx))
            .when_some(report.fixed_version.clone(), |row, version| row.child(orbit::text(
                format!("Arreglado en {version}"), 12.0, 400, orbit::ink_2(cx), cx)))
            .child(credit)
            .child(orbit::text("Opcional y revocable. Las notas podrán acreditar tu informe con un identificador de colaborador, sin nombre ni email. Retirarlo no cambia notas ya publicadas.", 11.0, 400, orbit::ink_3(cx), cx));
        if report.notice {
            row = row.child(orbit::callout(
                if report.state == "fixed" {
                    "Tu informe está arreglado. Gracias por avisar."
                } else {
                    "Tu informe ha sido aceptado. Gracias por avisar."
                },
                cx,
            ));
            if let Some(updated_at) = report.updated_at.clone() {
                let id = report.id.clone();
                row = row.child(
                    orbit::small_button("testing-notice-read", "Entendido", cx)
                        .when(!ready, |button| {
                            orbit::disabled(button, "Espera a que termine la operación")
                        })
                        .id(format!("testing-notice-{}", report.id))
                        .on_click(cx.listener(move |this, _, _, cx| {
                            this.remote.update(cx, |remote, cx| {
                                remote.participation_request(
                                    Command::TestingNoticeRead {
                                        id: id.clone(),
                                        updated_at: updated_at.clone(),
                                    },
                                    cx,
                                );
                            });
                        })),
                );
            }
        }
        row
    }
}
