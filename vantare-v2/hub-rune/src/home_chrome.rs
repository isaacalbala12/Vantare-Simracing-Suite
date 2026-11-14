//! Home's clock, shared text cases and keyboard-accessible in-place panels.
use crate::{
    State,
    catalog::{catalog, text},
    design::{Theme, body_style, button, label, surface},
};
use chrono::Timelike;
use rune::{El, Key, KeyEvent, TextEdit, Tx, row};

pub fn now(state: &State) -> chrono::NaiveDateTime {
    state
        .now_override
        .unwrap_or_else(|| chrono::Local::now().naive_local())
}
pub fn greeting(name: &str, now: chrono::NaiveDateTime) -> String {
    let Some(first) = name.split_whitespace().next() else {
        return text("home.welcome").to_owned();
    };
    let index = if now.hour() < 12 {
        0
    } else if now.hour() < 20 {
        1
    } else {
        2
    };
    catalog()["home"]["greetings"][index]
        .as_str()
        .unwrap()
        .replace("__VANTARE_NAME__", first)
}
pub fn initials(name: &str) -> String {
    let value: String = name
        .split_whitespace()
        .take(2)
        .filter_map(|w| w.chars().next())
        .collect();
    if value.is_empty() {
        "·".into()
    } else {
        value.to_uppercase()
    }
}
pub fn open_commands(state: &mut State) {
    state.commands_open = true;
    state.activity_open = false;
    state.command_query = TextEdit::default();
}
pub fn shortcuts(state: &mut State, event: &KeyEvent, tx: &mut Tx) -> bool {
    if !event.mods.ctrl || event.mods.alt || event.mods.shift || event.mods.logo {
        return false;
    }
    let Key::Text(key) = &event.key else {
        return false;
    };
    if !key.eq_ignore_ascii_case("k") && !key.eq_ignore_ascii_case("l") {
        return false;
    }
    if !tx.key_repeat() {
        if key.eq_ignore_ascii_case("k") {
            if state.commands_open {
                state.commands_open = false;
            } else {
                open_commands(state);
            }
        } else {
            state.commands_open = false;
            state.home.queue_launch(&state.core, true);
        }
    }
    true
}
#[derive(Clone)]
enum Action {
    Section(String),
    Profile(String),
    Theme,
}
fn choices(state: &State) -> Vec<(String, Action)> {
    let query = state.command_query.text.to_lowercase();
    let mut items: Vec<_> = catalog()["navigation"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|item| crate::section_allowed(state, item["id"].as_str().unwrap()))
        .map(|item| {
            (
                item["label"].as_str().unwrap().to_owned(),
                Action::Section(item["id"].as_str().unwrap().to_owned()),
            )
        })
        .collect();
    if let Some(value) = &state.home.value {
        items.extend(value.profiles.iter().map(|p| {
            (
                catalog()["home"]["launch"]
                    .as_str()
                    .unwrap()
                    .replace("__VANTARE_NAME__", &p.name),
                Action::Profile(p.id.clone()),
            )
        }));
    }
    items.push((text("settings.shell.toggleTheme").to_owned(), Action::Theme));
    items
        .into_iter()
        .filter(|(name, _)| name.to_lowercase().contains(&query))
        .collect()
}
fn activate(state: &mut State, action: Action) {
    state.commands_open = false;
    match action {
        Action::Section(section) => {
            if crate::section_allowed(state, &section) {
                state.section = section;
            }
        }
        Action::Profile(id) => {
            state.home.selected = id;
            state.home.queue_launch(&state.core, false);
        }
        Action::Theme => crate::toggle(state),
    }
}
fn backdrop(theme: &Theme, panel: El) -> El {
    row()
        .key("home-panel-backdrop")
        .pin(Some(0.0), Some(0.0), Some(0.0), Some(0.0))
        .center()
        .fill(theme.color("bg-base").alpha(0.65))
        .child(panel)
}
pub fn commands(state: &State) -> El {
    let theme = &state.theme;
    let input = rune::text_input(&state.command_query, body_style(14.0, 400.0))
        .key("commands-query")
        .w_full()
        .single_line()
        .autofocus()
        .label(text("commands.placeholder"))
        .placeholder(text("commands.placeholder"), theme.color("text-3"))
        .on_edit(|s: &mut State| &mut s.command_query)
        .on_input_key(shortcuts)
        .on_submit(|s: &mut State, _| {
            if let Some((_, action)) = choices(s).into_iter().next() {
                activate(s, action);
            }
        });
    let mut panel = surface(theme)
        .key("commands-panel")
        .w(560.0)
        .max_h(600.0)
        .role("dialog")
        .label(text("commands.placeholder"))
        .modal(true, |s: &mut State| s.commands_open = false)
        .scroll(rune::ScrollSpec {
            stick_bottom: false,
        })
        .child(input);
    for (index, (name, action)) in choices(state).into_iter().enumerate() {
        let disabled =
            matches!(action, Action::Profile(_)) && !state.home.can_launch(&state.core, false);
        panel = panel.child(
            button(
                theme,
                &format!("command-{index}"),
                &name,
                move |s: &mut State| activate(s, action.clone()),
            )
            .disabled(disabled),
        );
    }
    backdrop(
        theme,
        panel.child(button(
            theme,
            "commands-close",
            text("settings.shell.close"),
            |s: &mut State| s.commands_open = false,
        )),
    )
}
pub fn activity(state: &State) -> El {
    let theme = &state.theme;
    backdrop(
        theme,
        surface(theme)
            .key("home-activity-panel")
            .w(680.0)
            .max_h(600.0)
            .role("dialog")
            .label(text("home.activity"))
            .modal(true, |s: &mut State| s.activity_open = false)
            .scroll(rune::ScrollSpec {
                stick_bottom: false,
            })
            .child(
                row()
                    .center_y()
                    .child(label(theme, text("home.activity")).grow(1.0))
                    .child(
                        button(
                            theme,
                            "activity-close",
                            text("settings.shell.close"),
                            |s: &mut State| s.activity_open = false,
                        )
                        .autofocus(),
                    ),
            )
            .child(crate::home_view::activity_rows(state, usize::MAX)),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn greeting_and_initials_match_electron_generated_cases() {
        for case in catalog()["home"]["greetingCases"].as_array().unwrap() {
            let date = chrono::NaiveDate::from_ymd_opt(2026, 9, 30)
                .unwrap()
                .and_hms_opt(case["hour"].as_u64().unwrap() as u32, 0, 0)
                .unwrap();
            assert_eq!(
                greeting(case["name"].as_str().unwrap(), date),
                case["output"].as_str().unwrap()
            );
        }
        for case in catalog()["home"]["initialsCases"].as_array().unwrap() {
            assert_eq!(
                initials(case["name"].as_str().unwrap()),
                case["output"].as_str().unwrap()
            );
        }
    }
    #[test]
    fn command_filter_preserves_unicode_and_respects_revoked_navigation() {
        let mut state = crate::init();
        open_commands(&mut state);
        state.command_query = TextEdit::new("roadmap");
        let items = choices(&state);
        assert_eq!(items.len(), 1);
        activate(&mut state, items.into_iter().next().unwrap().1);
        assert_eq!(state.section, "roadmap");
        assert!(!state.commands_open);
        state.command_query = TextEdit::new("Testing");
        assert!(choices(&state).is_empty());
    }
}
