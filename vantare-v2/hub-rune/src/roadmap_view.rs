use crate::{
    State,
    catalog::text,
    design::{button, label, surface},
};
use rune::{El, TextStyle, col, row};
use vantare_hub_host::roadmap::RoadmapItem;
fn card(state: &State, item: &RoadmapItem) -> El {
    let theme = &state.theme;
    surface(theme)
        .key(format!("roadmap-item-{}", item.id))
        .role("article")
        .label(&item.title)
        .child(label(theme, &item.title).font(TextStyle::new(15.0, 600.0)))
        .child(label(theme, &item.body).w_full())
        .child(label(
            theme,
            format!(
                "{} · {}",
                item.version.as_deref().unwrap_or(text("roadmap.noVersion")),
                item.due_date.as_deref().unwrap_or(text("roadmap.noDate"))
            ),
        ))
}
pub fn view(state: &State) -> El {
    let theme = &state.theme;
    let data = &state.roadmap;
    let all: Vec<&RoadmapItem> = data
        .value
        .publication
        .as_ref()
        .map(|p| p.items.iter().collect())
        .unwrap_or_default();
    let lane = |name: &str| {
        all.iter()
            .copied()
            .filter(|i| i.section == name || (name == "next" && i.section == "later"))
            .collect::<Vec<_>>()
    };
    let mut tabs = row().gap(12.0).label(text("roadmap.tabs")).role("tablist");
    for tab in ["circuit", "board", "season"] {
        tabs = tabs.child(
            button(
                theme,
                &format!("roadmap-tab-{tab}"),
                text(&format!("roadmap.{tab}")),
                move |s: &mut State| s.roadmap.tab = tab,
            )
            .role("tab")
            .focus_selected(data.tab == tab),
        );
    }
    let mut page = col()
        .key("roadmap")
        .grow(1.0)
        .min_h(0.0)
        .w_full()
        .padding(24.0)
        .gap(20.0)
        .scroll(rune::ScrollSpec {
            stick_bottom: false,
        })
        .child(label(theme, text("roadmap.title")).font(TextStyle::new(28.0, 700.0)))
        .child(label(theme, text("roadmap.subtitle")))
        .child(tabs)
        .child(
            label(theme, text(data.status()))
                .key("roadmap-status")
                .role("status"),
        );
    if data.tab != "board" {
        let current = lane("now").first().copied();
        let mut hero = surface(theme)
            .child(label(theme, text("roadmap.current")))
            .child(
                label(
                    theme,
                    current.map_or(text("roadmap.noCurrent"), |i| i.title.as_str()),
                )
                .font(TextStyle::new(24.0, 600.0)),
            );
        if let Some(item) = current {
            hero = hero.child(label(theme, &item.body));
        }
        let mut counts = row().gap(24.0);
        for name in ["next", "now", "done"] {
            counts = counts.child(
                col()
                    .gap(6.0)
                    .child(label(theme, text(&format!("roadmap.{name}"))))
                    .child(label(
                        theme,
                        format!("{} {}", lane(name).len(), text("roadmap.tasks")),
                    )),
            );
        }
        page = page.child(hero.child(counts));
    }
    let mut content = row().w_full().gap(20.0);
    if data.tab == "season" {
        let mut schedule = surface(theme)
            .grow(1.0)
            .child(label(theme, text("roadmap.season")))
            .child(label(theme, text("roadmap.schedule")));
        if let Some(p) = &data.value.publication {
            schedule = schedule.child(label(
                theme,
                format!("{} {}", text("roadmap.published"), p.published_at),
            ));
        }
        let mut scheduled = all
            .iter()
            .copied()
            .filter(|i| i.version.is_some() || i.due_date.is_some())
            .collect::<Vec<_>>();
        scheduled.sort_by(|a, b| {
            a.due_date
                .as_deref()
                .unwrap_or("~")
                .cmp(b.due_date.as_deref().unwrap_or("~"))
                .then(a.version.cmp(&b.version))
        });
        if scheduled.is_empty() {
            schedule = schedule.child(label(theme, text("roadmap.noSchedule")));
        }
        for item in scheduled {
            schedule = schedule.child(card(state, item));
        }
        content = content.child(schedule);
    } else {
        let mut board = col()
            .grow(1.0)
            .gap(12.0)
            .child(label(theme, text("roadmap.coming")));
        let mut lanes = row().w_full().gap(16.0);
        for name in ["next", "now", "done"] {
            let mut column = col()
                .key(format!("roadmap-lane-{name}"))
                .grow(1.0)
                .min_w(0.0)
                .gap(12.0)
                .label(text(&format!("roadmap.{name}")))
                .role("region")
                .child(
                    label(theme, text(&format!("roadmap.{name}")))
                        .font(TextStyle::new(16.0, 600.0)),
                );
            let items = lane(name);
            if items.is_empty() {
                column = column.child(label(theme, text("roadmap.empty")));
            }
            for item in items {
                column = column.child(card(state, item));
            }
            lanes = lanes.child(column);
        }
        board = board.child(lanes);
        content = content.child(board);
    }
    let mut rail = col()
        .w(280.0)
        .gap(16.0)
        .child(label(theme, text("roadmap.areas")));
    let mut groups = std::collections::BTreeMap::<&str, (usize, usize)>::new();
    for item in &all {
        let entry = groups
            .entry(item.area.as_deref().unwrap_or(text("roadmap.noAreas")))
            .or_default();
        entry.1 += 1;
        entry.0 += usize::from(item.section == "done");
    }
    if groups.is_empty() {
        rail = rail.child(label(theme, text("roadmap.noAreas")));
    }
    for (area, (done, total)) in groups {
        rail = rail.child(label(
            theme,
            format!(
                "{area} · {done}/{total} {} · {}%",
                text("roadmap.completed"),
                done * 100 / total
            ),
        ));
    }
    rail = rail.child(label(theme, text("roadmap.delivered")));
    let delivered = lane("done");
    if delivered.is_empty() {
        rail = rail.child(label(theme, text("roadmap.noDelivered")));
    }
    for item in delivered {
        rail = rail.child(card(state, item));
    }
    page.child(content.child(rail))
}
