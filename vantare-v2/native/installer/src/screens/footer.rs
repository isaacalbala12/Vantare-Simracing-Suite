//! Action rows for each screen.
use super::{
    Action, AnyElement, Context, Div, Icon, Installer, Kind, Mode, ParentElement, Screen, Window,
    controls, style,
};
fn primary(
    view: &Installer,
    a: Action,
    label: &str,
    kind: Kind,
    enabled: bool,
    cx: &mut Context<Installer>,
) -> AnyElement {
    controls::button(
        view, a, label, 546., 406., 132., 40., kind, enabled, None, cx,
    )
}
fn welcome(view: &Installer, _window: &Window, cx: &mut Context<Installer>) -> Div {
    let mut footer = style::at(0., 0., 718., 458.);

    footer = footer
        .child(controls::button(
            view,
            Action::Options,
            "Opciones",
            280.,
            414.,
            80.,
            22.,
            Kind::Link,
            true,
            Some(Icon::Chevron),
            cx,
        ))
        .child(primary(
            view,
            Action::Install,
            "Instalar",
            Kind::Primary,
            true,
            cx,
        ));
    footer
}
fn installed(view: &Installer, _window: &Window, cx: &mut Context<Installer>) -> Div {
    let mut footer = style::at(0., 0., 718., 458.);

    footer = footer
        .child(controls::button(
            view,
            Action::Remove,
            "Desinstalar…",
            280.,
            414.,
            96.,
            22.,
            Kind::Link,
            true,
            None,
            cx,
        ))
        .child(primary(
            view,
            Action::Proceed,
            if view.mode == Mode::Repair {
                "Reparar"
            } else {
                "Actualizar"
            },
            Kind::Primary,
            view.info.allows(view.mode),
            cx,
        ));
    footer
}
fn installing(view: &Installer, _window: &Window, cx: &mut Context<Installer>) -> Div {
    let mut footer = style::at(0., 0., 718., 458.);

    footer = footer.child(style::body(
        280.,
        418.,
        242.,
        32.,
        if view.can_cancel || view.mode == Mode::Remove {
            "Puedes seguir usando el PC."
        } else {
            "Ya no se puede cancelar."
        },
        12.,
        style::FAINT,
    ));
    if view.mode != Mode::Remove {
        footer = footer.child(primary(
            view,
            Action::Cancel,
            "Cancelar",
            Kind::Ghost,
            view.can_cancel,
            cx,
        ));
    }
    footer
}
fn uninstall(view: &Installer, window: &Window, cx: &mut Context<Installer>) -> Div {
    let mut footer = style::at(0., 0., 718., 458.);

    let width = (style::text_width("Cancelar", "Installer Inter W600", 14., window) + 44.).max(88.);
    footer = footer
        .child(controls::button(
            view,
            Action::Back,
            "Cancelar",
            536. - width,
            406.,
            width,
            40.,
            Kind::Ghost,
            true,
            None,
            cx,
        ))
        .child(primary(
            view,
            Action::Remove,
            "Desinstalar",
            Kind::Danger,
            true,
            cx,
        ));
    footer
}
fn done(view: &Installer, window: &Window, cx: &mut Context<Installer>) -> Div {
    let mut footer = style::at(0., 0., 718., 458.);

    let width =
        (style::text_width("Abrir Vantare", "Installer Inter W600", 14., window) + 66.).max(132.);
    let close = style::text_width("Cerrar", "Installer Inter W600", 14., window) + 44.;
    footer = footer
        .child(controls::button(
            view,
            Action::Close,
            "Cerrar",
            668. - width - close,
            406.,
            close,
            40.,
            Kind::Ghost,
            true,
            None,
            cx,
        ))
        .child(controls::button(
            view,
            Action::Open,
            if view.opening {
                "Abriendo…"
            } else {
                "Abrir Vantare"
            },
            678. - width,
            406.,
            width,
            40.,
            Kind::Primary,
            !view.opening,
            if view.opening {
                None
            } else {
                Some(Icon::Arrow)
            },
            cx,
        ));
    footer
}
fn error(view: &Installer, window: &Window, cx: &mut Context<Installer>) -> Div {
    let mut footer = style::at(0., 0., 718., 458.);

    footer = footer.child(controls::button(
        view,
        Action::Details,
        if view.details {
            "Ocultar detalles"
        } else {
            "Ver detalles"
        },
        280.,
        414.,
        112.,
        22.,
        Kind::Link,
        true,
        None,
        cx,
    ));
    let close = style::text_width("Cerrar", "Installer Inter W600", 14., window) + 44.;
    let retry = view.error == 1 || view.error == 2;
    let open = view.error == 4;
    footer = footer.child(controls::button(
        view,
        Action::Close,
        "Cerrar",
        if retry || open {
            536. - close
        } else {
            678. - close
        },
        406.,
        close,
        40.,
        Kind::Ghost,
        true,
        None,
        cx,
    ));
    if retry {
        footer = footer.child(primary(
            view,
            Action::Retry,
            "Reintentar",
            Kind::Primary,
            true,
            cx,
        ));
    }
    if open {
        footer = footer.child(primary(
            view,
            Action::Open,
            "Abrir Vantare",
            Kind::Primary,
            !view.opening,
            cx,
        ));
    }
    footer
}
fn uninstalled(view: &Installer, window: &Window, cx: &mut Context<Installer>) -> Div {
    let mut footer = style::at(0., 0., 718., 458.);

    let close = style::text_width("Cerrar", "Installer Inter W600", 14., window) + 44.;
    footer = footer.child(controls::button(
        view,
        Action::Close,
        "Cerrar",
        678. - close,
        406.,
        close,
        40.,
        Kind::Ghost,
        true,
        None,
        cx,
    ));
    footer
}
pub(super) fn render(view: &Installer, window: &Window, cx: &mut Context<Installer>) -> Div {
    match view.screen {
        Screen::Welcome => welcome(view, window, cx),
        Screen::Installed => installed(view, window, cx),
        Screen::Installing => installing(view, window, cx),
        Screen::Uninstall => uninstall(view, window, cx),
        Screen::Done => done(view, window, cx),
        Screen::Error => error(view, window, cx),
        Screen::Uninstalled => uninstalled(view, window, cx),
    }
}
