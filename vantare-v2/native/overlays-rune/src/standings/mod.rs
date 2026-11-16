mod layout;
#[cfg(test)]
mod painting_tests;
mod render;
#[cfg(test)]
mod tests;
use crate::{
    vantare::Style,
    widget::{Update, Widget},
};
use layout::{Options, Plan};
use std::sync::Arc;
use vantare_domain::{
    Snapshot,
    format::Preferences,
    geometry::Size,
    standings::{self, Board},
    widget_session::Session,
    widget_settings::{Settings, standings::Settings as Config},
};
#[derive(PartialEq)]
struct Scene {
    board: Option<Arc<Board>>,
    plan: Plan,
    options: Options,
}
pub(crate) struct Standings {
    settings: Config,
    prefs: Preferences,
    style: Arc<Style>,
    scene: Scene,
    session: Session,
    content: standings::Content,
}
impl Standings {
    fn new(settings: &Config, prefs: Preferences) -> Self {
        let settings = settings.normalized();
        let style = Style::compiled();
        let options = Options::from_settings(&settings);
        let plan = layout::plan(None, &options, &style);
        let content = content(&settings);
        Self {
            settings,
            prefs,
            style,
            session: Session::Race,
            content,
            scene: Scene {
                board: None,
                plan,
                options,
            },
        }
    }
    fn settings_for(&self, session: Session) -> Config {
        let mut settings = self.settings.clone();
        let columns = match session {
            Session::Practice => settings.practice_columns.as_ref(),
            Session::Qualifying => settings.qualifying_columns.as_ref(),
            Session::Race => None,
        };
        settings.columns = columns.or(settings.columns.as_ref()).cloned();
        settings
    }
}
impl Widget for Standings {
    fn new(
        settings: &Settings,
        prefs: Preferences,
        _reduced: bool,
        _hz: u16,
        _clock: f64,
    ) -> Option<Box<dyn Widget>> {
        let Settings::Standings(s) = settings else {
            return None;
        };
        Some(Box::new(Self::new(s, prefs)))
    }
    fn configured(&self, settings: &Settings, prefs: Preferences) -> bool {
        matches!(settings,Settings::Standings(s) if s.normalized()==self.settings)
            && prefs == self.prefs
    }
    fn size(&self) -> Size {
        Size {
            width: self.scene.plan.width,
            height: self.scene.plan.height,
        }
    }
    fn size_for(&self, snapshot: Option<&Snapshot>) -> Size {
        let session = snapshot
            .and_then(|s| Session::of(&s.state.session.kind))
            .unwrap_or(self.session);
        let o = Options::from_settings(&self.settings_for(session));
        Size {
            width: o.layout(&self.style, o.driver_max(&self.style)).1,
            height: layout::fixed_height(&o, &self.style),
        }
    }

    fn policy(&mut self, _reduced: bool, _hz: u16, _clock: f64) -> Update {
        Update::default()
    }
    fn update(&mut self, snapshot: &Snapshot, _clock: f64) -> Update {
        let session = Session::of(&snapshot.state.session.kind).unwrap_or(self.session);
        let options = if session != self.session {
            self.session = session;
            let settings = self.settings_for(session);
            self.content = content(&settings);
            Options::from_settings(&settings)
        } else {
            self.scene.options.clone()
        };
        let board = standings::project_cached(
            snapshot,
            self.prefs,
            &self.content,
            self.scene.board.as_ref(),
        );
        if self
            .scene
            .board
            .as_ref()
            .is_some_and(|old| Arc::ptr_eq(old, &board))
            && self.scene.options == options
        {
            return Update::default();
        }
        let scene = Scene {
            plan: layout::plan(Some(&board), &options, &self.style),
            board: Some(board),
            options,
        };
        let build = scene != self.scene;
        self.scene = scene;
        Update {
            build,
            pixels: false,
        }
    }
    fn animate(&mut self, _clock: f64) -> Update {
        Update::default()
    }
    fn schedule(&self, _clock: f64, _tx: &mut rune::Tx) {}
    fn view(&self) -> rune::El {
        render::view(
            &self.scene.options,
            self.scene.board.as_deref(),
            &self.scene.plan,
            &self.style,
            self.prefs.language,
        )
    }
}

fn content(settings: &Config) -> standings::Content {
    let lap_format = |metric: &str| {
        settings
            .columns
            .as_ref()
            .and_then(|cols| cols.iter().find(|c| c.enabled && c.metric_id == metric))
            .map(|c| standings::LapFormat {
                compact: c.format.display.as_deref() == Some("compact"),
                decimals: c.format.decimals.unwrap_or(3),
            })
            .filter(|f| f.compact || f.decimals != 3)
    };
    let visible = |metric: &str| {
        settings
            .columns
            .as_ref()
            .is_some_and(|columns| columns.iter().any(|c| c.enabled && c.metric_id == metric))
    };
    let footer_slots = settings
        .footer_slots
        .as_ref()
        .is_some_and(|s| !s.is_empty());
    standings::Content {
        lap_visible: visible("currentLap"),
        interval_visible: visible("interval"),
        footer_visible: settings.show_session_footer,
        legacy_track_visible: settings.show_session_footer
            && !footer_slots
            && [&settings.footer_first, &settings.footer_second]
                .iter()
                .all(|id| ["none", "track", "estimatedLaps"].contains(&id.as_str()))
            && [&settings.footer_first, &settings.footer_second]
                .iter()
                .any(|id| id.as_str() == "track"),
        footer_ids: if footer_slots {
            settings.footer_slots.clone().unwrap_or_default()
        } else {
            vec![
                settings.footer_first.clone(),
                settings.footer_second.clone(),
            ]
        },
        footer_slots,
        player_class: settings.class_scope != "all-classes",
        row_count: settings.row_count,
        player_window: settings.player_window,
        window_around: settings.window_around,
        multiclass: settings.classification_mode == "multiclass",
        class_gaps: settings.class_scope != "all-classes"
            || settings.classification_mode == "multiclass",
        last_lap_format: lap_format("lastLap"),
        best_lap_format: lap_format("bestLap"),
    }
}
