use iced::widget::{button, column, text};
use iced::{Element, Task, window};

#[derive(Default)]
struct Smoke {
    overlay: Option<window::Id>,
}

#[derive(Clone, Debug)]
enum Message {
    Toggle,
    ControlOpened,
    Opened(window::Id),
}

fn update(state: &mut Smoke, message: Message) -> Task<Message> {
    match message {
        Message::Toggle => {
            if let Some(id) = state.overlay.take() {
                window::close(id)
            } else {
                let (_, task) = window::open(window::Settings {
                    size: iced::Size::new(360.0, 120.0),
                    decorations: false,
                    transparent: true,
                    level: window::Level::AlwaysOnTop,
                    ..Default::default()
                });
                task.map(Message::Opened)
            }
        }
        Message::Opened(id) => {
            state.overlay = Some(id);
            Task::none()
        }
        Message::ControlOpened => Task::none(),
    }
}

fn view(state: &Smoke, id: window::Id) -> Element<'_, Message> {
    if state.overlay == Some(id) {
        return column![text("VANTARE / STANDINGS"), text("P09  PLAYER  +0.000")]
            .padding(20)
            .into();
    }
    column![
        text("Vantare native UI · Iced"),
        button(if state.overlay.is_some() {
            "Cerrar overlay"
        } else {
            "Mostrar overlay"
        })
        .on_press(Message::Toggle),
        text("P09  PLAYER  +0.000")
    ]
    .padding(20)
    .into()
}

fn main() -> iced::Result {
    iced::daemon(
        || {
            let (_, control) = window::open(window::Settings::default());
            let (_, overlay) = window::open(window::Settings {
                size: iced::Size::new(360.0, 120.0),
                decorations: false,
                transparent: true,
                level: window::Level::AlwaysOnTop,
                ..Default::default()
            });
            (
                Smoke::default(),
                Task::batch([
                    control.map(|_| Message::ControlOpened),
                    overlay.map(Message::Opened),
                ]),
            )
        },
        update,
        view,
    )
    .title(|state: &Smoke, id| {
        if state.overlay == Some(id) {
            String::from("Vantare Iced Smoke Overlay")
        } else {
            String::from("Vantare Iced Smoke Control")
        }
    })
    .style(|_, _| iced::theme::Style {
        background_color: iced::Color::TRANSPARENT,
        text_color: iced::Color::WHITE,
    })
    .run()
}
