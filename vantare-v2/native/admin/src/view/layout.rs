use super::{
    Action, Admin, Context, Dialog, Div, EMBER, Event, FluentBuilder, INK1, INK2, INK3,
    InteractiveElement, ParentElement, RED, Screen, Status, Styled, avatar, column, div, heading,
    money, muted, note, panel, px, rgb, text,
};
use vantare_hub::orbit;

impl Admin {
    pub(super) fn confirmation_panel(
        &self,
        action: Option<&Action>,
        cx: &mut Context<Self>,
    ) -> Div {
        let (title,lead)=match self.dialog {
            Some(Dialog::Block(true))=>("Bloquear esta cuenta","No podrá entrar. Se cerrarán sus sesiones y se cancelará su suscripción, sin reembolso automático.".to_owned()),
            Some(Dialog::Block(false))=>("Desbloquear esta cuenta","Podrá volver a entrar. Su suscripción cancelada no se reactivará.".to_owned()),
            Some(Dialog::Delete)=>("Borrar esta cuenta para siempre","Se borrarán sus datos personales y se cancelará su suscripción. Esta acción no se puede deshacer.".to_owned()),
            Some(Dialog::Creator)=>("Añadir creador","Se creará su código en Polar: 20 % de descuento durante dos meses, en los planes de lanzamiento.".to_owned()),
            Some(Dialog::Payout)=>("Apuntar pago al creador",format!("Apunta que has pagado {}. Esta acción no envía dinero.",money(self.state.creator.as_ref().map_or(0,|c|c.payable_cents)))),
            Some(Dialog::Report(Status::Fixed))=>("Arreglado en una versión","Indica la versión donde se ha corregido. El informe debe estar aceptado.".to_owned()),
            Some(Dialog::Report(Status::Rejected))=>("No aceptar este informe","Escribe la nota de revisión para la persona que lo envió.".to_owned()),
            Some(Dialog::Report(_))=>("Cambiar estado del informe","Confirma el nuevo estado.".to_owned()),
            None=>("Confirmar cambio",match action {
                Some(Action::MailApprove{..})=>format!("Confirmas el texto guardado en ES, EN, IT y PT-BR para {} personas con consentimiento en este grupo. El servidor vuelve a comprobarlo en cada tanda. Después pulsa Enviar siguiente tanda.",self.state.mail.campaign.as_ref().and_then(|c|self.state.mail.counts.get(&c.target_group)).copied().unwrap_or_default()),
                Some(Action::MailSendBatch{..})=>"Se enviará la siguiente tanda, hasta tres correos, de la campaña confirmada. Solo a personas que sigan teniendo consentimiento.".into(),
                Some(Action::MailDraft{..})=>"Claude preparará cuatro borradores a partir del brief. Revisa su contenido antes de guardarlo. No envía correos.".into(),
                Some(Action::SetTester{enabled,..})=>format!("{} el acceso de tester a esta persona.",if *enabled{"Activar"}else{"Desactivar"}),
                Some(Action::SetModule{module,enabled,..})=>format!("{} el acceso propio a {}. Los accesos del plan o para todos se conservan.",if *enabled{"Activar"}else{"Desactivar"},module.label()),
                Some(Action::SetRollout{module,enabled_for_all})=>format!("{} {} para todas las cuentas ({}). Los accesos propios se conservan.",if *enabled_for_all{"Activar"}else{"Desactivar"},module.label(),self.state.accounts_total),
                _=>"Confirma el cambio antes de guardarlo.".into(),
            }),
        };
        let mut dialog = panel()
            .w(px(500.))
            .gap(px(14.))
            .p(px(26.))
            .rounded(px(22.))
            .child(heading(title, 22.))
            .child(text(&lead, 14., INK2));
        if let Some(user) = &self.state.user
            && matches!(self.dialog, Some(Dialog::Block(_) | Dialog::Delete))
        {
            dialog = dialog.child(text(
                &format!(
                    "{} · {}",
                    user.name.as_deref().unwrap_or("Persona"),
                    user.email.as_deref().unwrap_or("Sin correo")
                ),
                13.,
                INK1,
            ));
        }
        dialog = self.dialog_fields(dialog);
        if !self.state.message.is_empty() && self.state.message.starts_with("Revisa")
            || self.state.message.starts_with("Escribe")
        {
            dialog = dialog.child(note(&self.state.message, RED));
        }
        let valid = self
            .dialog
            .is_none_or(|d| self.dialog_action(d, cx).is_ok());
        dialog = dialog.child(
            div()
                .flex()
                .justify_end()
                .gap(px(10.))
                .child(self.button("cancel", "Cancelar", Event::Cancel, cx))
                .child(
                    self.button("confirm", "Confirmar", Event::Confirm, cx)
                        .bg(rgb(if matches!(self.dialog, Some(Dialog::Delete)) {
                            RED
                        } else {
                            0x00f3_eeee
                        }))
                        .text_color(rgb(if matches!(self.dialog, Some(Dialog::Delete)) {
                            INK1
                        } else {
                            0x001c_1719
                        }))
                        .when(!valid, |d| {
                            orbit::disabled(d, "Revisa los datos antes de confirmar")
                        }),
                ),
        );
        div()
            .absolute()
            .inset_0()
            .size_full()
            .bg(gpui::rgba(0x0404_06dc))
            .flex()
            .items_center()
            .justify_center()
            .child(dialog)
    }
    pub(super) fn sidebar(&self, cx: &mut Context<Self>) -> Div {
        let mut side = column()
            .w(px(232.))
            .flex_shrink_0()
            .h_full()
            .px(px(14.))
            .py(px(20.))
            .bg(rgb(0x000b_0c0e))
            .border_r_1()
            .border_color(gpui::rgba(0xffff_ff13))
            .gap(px(4.))
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(11.))
                    .px(px(8.))
                    .pb(px(22.))
                    .child(
                        div()
                            .w(px(34.))
                            .h(px(34.))
                            .rounded(px(10.))
                            .bg(rgb(0x00d5_2f49))
                            .flex()
                            .items_center()
                            .justify_center()
                            .font_weight(gpui::FontWeight::BOLD)
                            .child("V"),
                    )
                    .child(
                        column()
                            .gap(px(2.))
                            .child(text("Vantare", 15., INK1))
                            .child(muted("Gestión privada")),
                    ),
            );
        for (i, screen) in Screen::ALL.into_iter().enumerate() {
            let label = if screen == Screen::Reports {
                format!(
                    "{}   {}",
                    screen.label(),
                    self.state
                        .report_counts
                        .get("submitted")
                        .copied()
                        .unwrap_or_default()
                )
            } else {
                screen.label().to_owned()
            };
            side = side.child(
                self.button("nav", &label, Event::Screen(screen), cx)
                    .id(("nav", i))
                    .w_full()
                    .h(px(44.))
                    .bg(gpui::rgba(0x0000_0000))
                    .border_0()
                    .justify_start()
                    .when(screen == self.state.screen, |d| {
                        d.bg(rgb(0x0024_1017)).border_l_2().border_color(rgb(RED))
                    }),
            );
        }
        side = side.child(div().flex_1());
        if self.state.demo {
            side = side.child(self.demo_controls(cx));
        }
        side.child(self.sidebar_account(cx))
    }
    pub(super) fn login(&self, cx: &mut Context<Self>) -> Div {
        panel()
            .w(px(470.))
            .p(px(38.))
            .gap(px(18.))
            .items_center()
            .child(
                div()
                    .w(px(64.))
                    .h(px(64.))
                    .rounded(px(18.))
                    .bg(rgb(0x00d5_2f49))
                    .flex()
                    .items_center()
                    .justify_center()
                    .text_size(px(30.))
                    .font_weight(gpui::FontWeight::BOLD)
                    .child("V"),
            )
            .child(heading("Vantare · Gestión", 26.))
            .child(text(
                "Tu espacio privado para gestionar Vantare.",
                14.,
                INK3,
            ))
            .child(
                self.button(
                    "login",
                    if self.state.busy {
                        "Esperando en el navegador…"
                    } else {
                        "Entrar con mi cuenta"
                    },
                    Event::Login,
                    cx,
                )
                .bg(rgb(0x00f3_eeee))
                .text_color(rgb(0x001c_1719))
                .w_full()
                .h(px(44.)),
            )
            .child(muted("Solo puede entrar la cuenta del dueño."))
            .when(!self.state.message.is_empty() && !self.state.demo, |d| {
                d.child(note(&self.state.message, EMBER))
            })
    }
    fn dialog_fields(&self, mut dialog: Div) -> Div {
        match self.dialog {
            Some(Dialog::Creator) => {
                dialog = dialog
                    .child(muted("Nombre"))
                    .child(self.form_a.clone())
                    .child(muted("Correo"))
                    .child(self.form_b.clone())
                    .child(muted("Código · letras y números, en mayúsculas"))
                    .child(self.form_c.clone());
            }
            Some(Dialog::Delete) => {
                dialog = dialog
                    .child(muted(&format!(
                        "Para confirmar, escribe {}",
                        self.state
                            .user
                            .as_ref()
                            .and_then(|u| u.email.as_deref())
                            .unwrap_or("su correo")
                    )))
                    .child(self.form_a.clone())
                    .child(note(
                        "Se comprueba el correo en el servidor. Si queda incompleto, repite con el mismo correo para terminar.",
                        RED,
                    ));
            }
            Some(Dialog::Block(true)) => {
                dialog = dialog
                    .child(muted("Motivo · opcional, hasta 200 caracteres"))
                    .child(self.form_a.clone());
            }
            Some(Dialog::Report(Status::Fixed)) => {
                dialog = dialog
                    .child(muted("Versión de la corrección"))
                    .child(self.form_a.clone());
            }
            Some(Dialog::Report(Status::Validated | Status::Rejected | Status::Spam)) => {
                dialog = dialog
                    .child(muted(
                        "Nota de revisión · obligatoria, hasta 500 caracteres",
                    ))
                    .child(self.form_a.clone());
            }
            _ => {}
        }
        dialog
    }

    fn demo_controls(&self, cx: &mut Context<Self>) -> Div {
        if self.state.demo {
            let mut states = div().flex().flex_wrap().gap(px(5.));
            for (i, (state, label)) in [
                ("normal", "Normal"),
                ("cargando", "Cargando"),
                ("vacio", "Vacío"),
                ("error", "Error"),
            ]
            .into_iter()
            .enumerate()
            {
                states = states.child(
                    self.button("demo-state", label, Event::DemoState(state), cx)
                        .id(("demo-state", i))
                        .text_size(px(11.))
                        .h(px(27.))
                        .px(px(7.)),
                );
            }
            return panel()
                .p(px(10.))
                .gap(px(8.))
                .child(text("VER ESTADO · DEMO", 11., EMBER))
                .child(states);
        }
        div()
    }
    fn sidebar_account(&self, cx: &mut Context<Self>) -> Div {
        div()
            .flex()
            .items_center()
            .gap(px(10.))
            .p(px(10.))
            .mt(px(12.))
            .bg(rgb(0x000d_0e11))
            .rounded(px(12.))
            .child(avatar("Isaac Simracing", 30.))
            .child(
                column()
                    .gap(px(2.))
                    .child(text(
                        if self.state.demo {
                            "Isaac"
                        } else {
                            "Tu cuenta"
                        },
                        13.,
                        INK1,
                    ))
                    .child(muted("Dueño")),
            )
            .child(
                self.button("logout", "Salir", Event::Logout, cx)
                    .text_size(px(11.))
                    .px(px(5.)),
            )
    }
}
