use super::{Admin, Event, INK3, column, empty_card, heading, muted, panel, text};
use gpui::{Context, Div, InteractiveElement, ParentElement, Styled, px};
impl Admin {
    pub(super) fn audit(&self, cx: &mut Context<Self>) -> Div {
        let mut body = column().child(self.page_head("Efectos pendientes", "Comprueba el proveedor antes de reconciliar. Esta pantalla solo consulta; no reenvía operaciones.", cx));
        if let Some(state) = self.list_state("No hay efectos pendientes", cx) {
            return body.child(state);
        }
        if self.state.effects.is_empty() {
            return body.child(empty_card("No hay efectos pendientes"));
        }
        for (index, row) in self.state.effects.iter().enumerate() {
            body = body.child(
                panel()
                    .id(("pending-effect", index))
                    .gap(px(8.))
                    .child(heading(&row.effect.replace('_', " "), 17.))
                    .child(muted(&format!(
                        "{} · {} · HTTP {}",
                        row.action.replace('_', " "),
                        if row.outcome == "unknown" {
                            "Resultado incierto"
                        } else {
                            "Sin resultado"
                        },
                        row.http_status
                            .map_or_else(|| "sin respuesta".into(), |n| n.to_string())
                    )))
                    .child(text(&format!("Inicio: {}", row.occurred_at), 13., INK3))
                    .child(text(&format!("Efecto: {}", row.effect_id), 12., INK3))
                    .child(text(&format!("Petición: {}", row.request_id), 12., INK3))
                    .child(self.button(
                        "copy-effect",
                        "Copiar identificadores",
                        Event::CopyEffect(index),
                        cx,
                    )),
            );
        }
        if self.state.effects_cursor.is_some() {
            body =
                body.child(self.button("next-effects", "Siguiente página", Event::NextEffects, cx));
        }
        body
    }
}
