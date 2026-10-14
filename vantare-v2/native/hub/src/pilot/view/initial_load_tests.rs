//! Driver del editor real; la carga se entrega después de editar, sin sleeps.
use super::*;

pub(crate) fn delayed_load(
    existing: &Draft,
    edit_simulators: bool,
    window: &mut Window,
    cx: &mut Context<PilotEditor>,
) -> PilotEditor {
    let mut pending = PilotEditor::new(Draft::default(), window, cx);
    pending.name.update(cx, |input, cx| {
        input.set_value("Antes de cargar".into(), cx);
    });
    pending.discard_changes(cx);
    pending.name.update(cx, |input, cx| {
        input.set_value("Después de descartar".into(), cx);
    });
    pending.act(Action::Save, window, cx);
    assert!(
        !pending.busy,
        "Descartar antes de cargar no habilita Guardar"
    );

    let mut control = PilotEditor::new(Draft::default(), window, cx);
    control.load_preserving_edits(existing.clone(), cx);
    assert_eq!(&control.draft(cx), existing, "control sin edición temprana");

    let mut editor = PilotEditor::new(Draft::default(), window, cx);
    if edit_simulators {
        editor.toggle_simulator("acc", cx);
    } else {
        editor
            .name
            .update(cx, |input, cx| input.set_value("Bea".into(), cx));
    }
    assert!(editor.dirty(cx));
    editor.set_status(Some("fallo de carga QA".into()), cx);
    editor.act(Action::Save, window, cx);
    assert!(
        !editor.busy,
        "Guardar no inicia una operación antes de la primera carga"
    );
    editor.load_preserving_edits(existing.clone(), cx);
    let retained = editor.draft(cx);
    editor.act(Action::Save, window, cx);
    assert!(
        editor.busy,
        "Guardar se habilita tras cargar, conservando la edición"
    );
    editor.set_status(Some("fallo de guardado QA".into()), cx);
    assert_eq!(
        editor.draft(cx),
        retained,
        "un fallo conserva la edición para reintentar"
    );
    let mut reset = PilotEditor::new(Draft::default(), window, cx);
    reset.load(retained.clone(), cx);
    reset.reset_for_load(cx);
    reset
        .name
        .update(cx, |input, cx| input.set_value("Otra cuenta".into(), cx));
    reset.act(Action::Save, window, cx);
    assert!(
        !reset.busy,
        "Logout vuelve a bloquear Guardar hasta la nueva carga"
    );
    reset.load(existing.clone(), cx);
    reset.name.update(cx, |input, cx| {
        input.set_value("Cambio descartado".into(), cx);
    });
    reset.discard_changes(cx);
    assert_eq!(
        &reset.draft(cx),
        existing,
        "Descartar vuelve a los datos recibidos de disco"
    );
    assert!(!reset.dirty(cx));
    editor
}
