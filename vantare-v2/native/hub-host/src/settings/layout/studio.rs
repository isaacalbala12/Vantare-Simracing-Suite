//! Studio uses the Settings adapter's duplicate-safe `RawValue` document and writer.
use super::{Document, Fields, LIMIT};
use crate::{
    protocol::HostError,
    studio::{
        Edit, HISTORY_LIMIT, ID_LIMIT, INSTANCE_LIMIT, InstancePatch, OffTrack, OverlayInstance,
        OverlaySize, SIZE_LIMIT, ShowIn, State, StudioState, StudioView, WidgetKind,
    },
};
use serde::{Serialize, de::DeserializeOwned};
use serde_json::value::RawValue;
use std::{collections::HashSet, path::Path};
use vantare_ipc::{control::CatalogAccess, files};
fn read<T: DeserializeOwned>(fields: &Fields, key: &str) -> Result<T, HostError> {
    serde_json::from_str(fields.0.get(key).ok_or(HostError::Protected)?.get())
        .map_err(|_| HostError::Protected)
}
fn optional<T: DeserializeOwned>(fields: &Fields, key: &str, default: T) -> Result<T, HostError> {
    fields.0.get(key).map_or(Ok(default), |v| {
        serde_json::from_str(v.get()).map_err(|_| HostError::Protected)
    })
}
fn put<T: Serialize>(fields: &mut Fields, key: &str, value: &T) -> Result<(), HostError> {
    fields.0.insert(
        key.into(),
        RawValue::from_string(serde_json::to_string(value).map_err(|_| HostError::Io)?)
            .map_err(|_| HostError::Io)?,
    );
    Ok(())
}
#[path = "studio_frequency.rs"]
mod frequency_edit;
#[path = "studio_geometry.rs"]
mod geometry_edit;
#[path = "studio_fields.rs"]
mod ordered;
#[path = "studio_settings.rs"]
mod setting_edit;
struct Open {
    document: Document,
    instances: Vec<Fields>,
    projected: Vec<OverlayInstance>,
    monitor: crate::studio::monitor::Monitor,
    canvas: crate::studio::CanvasView,
    monitor_size: OverlaySize,
}
impl Open {
    fn read(
        path: &Path,
        source: fn() -> Vec<crate::studio::monitor::Monitor>,
        pinned: Option<crate::studio::monitor::Monitor>,
    ) -> Result<Self, HostError> {
        if !vantare_launcher::is_local_path(path) {
            return Err(HostError::Denied);
        }
        let document = Document::open(path).map_err(|()| HostError::Protected)?;
        Self::project(document, source, pinned)
    }
    fn project(
        document: Document,
        source: fn() -> Vec<crate::studio::monitor::Monitor>,
        pinned: Option<crate::studio::monitor::Monitor>,
    ) -> Result<Self, HostError> {
        if document.observed.is_none() {
            return Err(HostError::Protected);
        }
        let instances: Vec<Fields> = read(&document.fields, "instances")?;
        if instances.len() > INSTANCE_LIMIT {
            return Err(HostError::Protected);
        }
        let mut ids = HashSet::new();
        let mut projected = Vec::with_capacity(instances.len());
        let rates = frequency_edit::Rates::read(&document.fields)?;
        for fields in &instances {
            let mut item = instance(fields, None)?;
            item.frequency = rates.view(&item.id, item.kind);
            companion(fields)?;
            if !ids.insert(item.id.clone()) {
                return Err(HostError::Protected);
            }
            projected.push(item);
        }
        let positions: Vec<_> = projected
            .iter()
            .map(|item| (f64::from(item.x), f64::from(item.y), item.visible))
            .collect();
        let monitors = source();
        let monitor = match pinned {
            Some(monitor) if monitors.contains(&monitor) => monitor,
            Some(_) => return Err(HostError::Protected),
            None => {
                crate::studio::monitor::choose(&monitors, &positions).ok_or(HostError::Protected)?
            }
        };
        let monitor_size = monitor.size_view().ok_or(HostError::Protected)?;
        let canvas = canvas(&document.fields, monitor)?;
        for item in &mut projected {
            relative(item, monitor, canvas)?;
        }
        Ok(Self {
            document,
            instances,
            projected,
            monitor,
            canvas,
            monitor_size,
        })
    }
    fn fits_frame(&self, access: Option<CatalogAccess>) -> bool {
        self.fits_instances(
            self.projected
                .iter()
                .zip(&self.instances)
                .filter(|(_, fields)| companion(fields).expect("validated companion").is_none())
                .map(|(item, _)| {
                    let mut item = item.clone();
                    item.locked = !item.kind.info(access).allowed;
                    item
                })
                .collect(),
            access,
            self.canvas,
        )
    }
    fn bytes(&self) -> Result<Vec<u8>, HostError> {
        let mut root = Fields(self.document.fields.0.clone());
        let instances: Vec<_> = self.instances.iter().map(|fields| &fields.0).collect();
        put(&mut root, "instances", &instances)?;
        let bytes = serde_json::to_vec(&root.0).map_err(|_| HostError::Io)?;
        if bytes.len() > usize::try_from(LIMIT).expect("layout limit") {
            return Err(HostError::Protected);
        }
        Ok(bytes)
    }
    fn revision(&self) -> String {
        vantare_services::content_hash(self.document.observed.as_deref().expect("existing layout"))
    }
    fn find(&mut self, id: &str) -> Result<&mut Fields, HostError> {
        self.instances
            .iter_mut()
            .find(|f| read::<String>(f, "id").as_deref() == Ok(id))
            .filter(|f| companion(f).is_ok_and(|id| id.is_none()))
            .ok_or(HostError::Denied)
    }
}
#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)] // Finite positive presentation sizes, bounded before casting.
fn instance(fields: &Fields, access: Option<CatalogAccess>) -> Result<OverlayInstance, HostError> {
    let id: String = read(fields, "id")?;
    if id.is_empty() || id.len() > ID_LIMIT || id.contains('\0') {
        return Err(HostError::Protected);
    }
    let x = coordinate(read(fields, "x")?)?;
    let y = coordinate(read(fields, "y")?)?;
    let settings: Fields = read(fields, "settings")?;
    let kind: WidgetKind = read(&settings, "kind")?;
    let opacity: f64 = optional(fields, "opacity", 1.0)?;
    let opacity = if opacity.is_finite() {
        opacity.clamp(0.0, 1.0)
    } else {
        1.0
    };
    let geometry: Fields = optional(fields, "geometry", Fields::default())?;
    let size: Option<Fields> = optional(&geometry, "size", None)?;
    let defaults = crate::widget_defaults::get(kind.id()).ok_or(HostError::Protected)?;
    let (mut width, mut height) = size.as_ref().map_or(
        Ok((
            f64::from(defaults.size.width),
            f64::from(defaults.size.height),
        )),
        |f| Ok::<_, HostError>((read::<f64>(f, "width")?, read::<f64>(f, "height")?)),
    )?;
    if ![width, height]
        .iter()
        .all(|v| v.is_finite() && *v > 0.0 && *v <= f64::from(f32::MAX))
    {
        return Err(HostError::Protected);
    }
    if size.is_some() {
        width = width.clamp(crate::studio::GEOMETRY_MIN.0, crate::studio::GEOMETRY_MAX.0);
        height = height.clamp(crate::studio::GEOMETRY_MIN.1, crate::studio::GEOMETRY_MAX.1);
    }
    let stored: String = optional(fields, "offTrack", "inherit".into())?;
    let off_track = match stored.as_str() {
        "inherit" => OffTrack::Inherit,
        "always_visible" => OffTrack::AlwaysVisible,
        "hide" => OffTrack::Hide,
        _ => return Err(HostError::Protected),
    };
    Ok(OverlayInstance {
        id,
        kind,
        settings: typed_settings(kind, &settings)?,
        frequency: crate::studio::FrequencyView::new(
            kind,
            crate::settings::track::PerformanceLevel::default(),
            None,
        ),
        visible: optional(fields, "visible", true)?,
        locked: !kind.info(access).allowed,
        opacity: (opacity * 100.0).round() as u8,
        show_in: {
            let stored: Fields = optional(fields, "showIn", Fields::default())?;
            ShowIn {
                practice: optional(&stored, "practice", true)?,
                qualifying: optional(&stored, "qualifying", true)?,
                race: optional(&stored, "race", true)?,
            }
        },
        off_track,
        size: OverlaySize {
            width: coordinate(width)?,
            height: coordinate(height)?,
        },
        x,
        y,
        size_mode: if size.is_some() {
            crate::studio::SizeMode::Explicit
        } else {
            crate::studio::SizeMode::Auto
        },
        aspect_locked: optional(&geometry, "aspectLocked", true)?,
        canvas_placement: crate::studio::CanvasPlacement::Inside,
    })
}
fn coordinate(value: f64) -> Result<crate::studio::Coordinate, HostError> {
    value.try_into().map_err(|_| HostError::Protected)
}
fn relative(
    item: &mut OverlayInstance,
    monitor: crate::studio::monitor::Monitor,
    canvas: crate::studio::CanvasView,
) -> Result<(), HostError> {
    item.x = coordinate(f64::from(item.x) - monitor.origin.0)?;
    item.y = coordinate(f64::from(item.y) - monitor.origin.1)?;
    let outside = f64::from(item.x) < 0.0
        || f64::from(item.y) < 0.0
        || f64::from(item.x) + f64::from(item.size.width) > f64::from(canvas.width)
        || f64::from(item.y) + f64::from(item.size.height) > f64::from(canvas.height);
    item.canvas_placement = if outside {
        crate::studio::CanvasPlacement::Outside
    } else {
        crate::studio::CanvasPlacement::Inside
    };
    Ok(())
}
fn merged_settings(kind: WidgetKind, stored: &Fields) -> Result<Fields, HostError> {
    let defaults = crate::widget_defaults::get(kind.id()).ok_or(HostError::Protected)?;
    let mut merged: Fields =
        serde_json::from_str(defaults.settings.get()).map_err(|_| HostError::Protected)?;
    merged.0.extend(stored.0.clone());
    let source = serde_json::to_string(&stored.0).map_err(|_| HostError::Io)?;
    let native = crate::studio::WidgetSettings::unnormalized_json(&source)?;
    // Absence/null of native optional fields means inheritance, not a new-widget
    // preset. Derive that distinction from serde itself, without another table.
    merged
        .0
        .retain(|key, _| stored.0.contains_key(key) || native.get(key).is_some());
    for (key, value) in native.as_object().ok_or(HostError::Protected)? {
        if !stored.0.contains_key(key)
            && (value.is_null()
                || key == "contentVersion"
                || (kind == WidgetKind::Pedals && key == "designSystem"))
        {
            put(&mut merged, key, value)?;
        }
    }
    Ok(merged)
}
fn typed_settings(
    kind: WidgetKind,
    stored: &Fields,
) -> Result<Option<crate::studio::WidgetSettings>, HostError> {
    if !crate::studio::WidgetSettings::supports(kind) {
        return Ok(None);
    }
    let merged = merged_settings(kind, stored)?;
    crate::studio::WidgetSettings::from_json(
        kind,
        &serde_json::to_string(&merged.0).map_err(|_| HostError::Protected)?,
    )
}

fn free_spot(opened: &Open, size: (f64, f64)) -> Result<(f64, f64), HostError> {
    let taken: Vec<_> = opened
        .projected
        .iter()
        .map(|item| {
            (
                f64::from(item.x),
                f64::from(item.y),
                f64::from(item.size.width),
                f64::from(item.size.height),
            )
        })
        .collect();
    crate::studio::geometry::free_spot(opened.canvas.size(), size, &taken)
        .ok_or(HostError::Protected)
}
fn open(state: &mut State) -> Result<Open, HostError> {
    let opened = Open::read(&state.path, state.monitor_source, state.monitor)?;
    state.monitor = Some(opened.monitor);
    Ok(opened)
}
pub(crate) fn view(state: &mut State, access: Option<CatalogAccess>) -> StudioView {
    let opened = open(state);
    let Ok(opened) = opened else {
        let mut unavailable = State::unavailable(
            if state.path.try_exists().unwrap_or(true) {
                StudioState::Protected
            } else {
                StudioState::Missing
            },
            access,
        );
        unavailable.showing = showing(&state.path);
        return unavailable;
    };
    let revision = opened.revision();
    if state
        .revision
        .as_ref()
        .is_some_and(|last| *last != revision)
    {
        state.undo.clear();
        state.redo.clear();
    }
    state.revision = Some(revision.clone());
    let value = StudioView {
        revision,
        instances: opened
            .projected
            .into_iter()
            .zip(&opened.instances)
            .filter(|(_, fields)| companion(fields).expect("validated companion").is_none())
            .map(|(mut item, _)| {
                item.locked = !item.kind.info(access).allowed;
                item
            })
            .collect(),
        showing: showing(&state.path),
        can_undo: !state.undo.is_empty(),
        can_redo: !state.redo.is_empty(),
        canvas: Some(opened.canvas),
        monitor: Some(Box::new(opened.monitor_size)),
        ..State::unavailable(StudioState::Ready, access)
    };
    if crate::studio::widget_settings::fits_view(&value) {
        value
    } else {
        let mut protected = State::unavailable(StudioState::Protected, access);
        protected.revision = value.revision;
        protected.monitor = value.monitor;
        protected.showing = value.showing;
        protected
    }
}
pub(crate) fn edit(
    state: &mut State,
    edit: Edit,
    revision: &str,
    access: Option<CatalogAccess>,
) -> Result<StudioView, HostError> {
    edit_result(state, edit, revision, access).map(|(value, _)| value)
}
fn open_revision(
    state: &mut State,
    revision: &str,
    access: Option<CatalogAccess>,
) -> Result<Open, HostError> {
    if !vantare_launcher::is_local_path(&state.path) {
        return Err(HostError::Denied);
    }
    let observed = files::read_optional(&state.path, LIMIT).map_err(|_| HostError::Protected)?;
    if observed
        .as_deref()
        .map(vantare_services::content_hash)
        .as_deref()
        != Some(revision)
    {
        return Err(HostError::StudioConflict {
            current: view(state, access),
        });
    }
    let document = Document::from_observed(observed).map_err(|()| HostError::Protected)?;
    Open::project(document, state.monitor_source, state.monitor)
}
pub(crate) fn edit_result(
    state: &mut State,
    edit: Edit,
    revision: &str,
    access: Option<CatalogAccess>,
) -> Result<(StudioView, Option<String>), HostError> {
    let mut opened = open_revision(state, revision, access)?;
    state.monitor = Some(opened.monitor);
    let settings_edit = matches!(&edit, Edit::Instance(_, InstancePatch::Settings(_)));
    let frequency_only = matches!(&edit, Edit::Instance(_, InstancePatch::Frequency(_)));
    let geometry_edit = matches!(
        &edit,
        Edit::Geometry(..) | Edit::Canvas(..) | Edit::AddAt(..)
    );
    if (settings_edit || geometry_edit) && !opened.fits_frame(access) {
        return Err(HostError::Protected);
    }
    if state.revision.as_ref().is_some_and(|last| last != revision) {
        state.undo.clear();
        state.redo.clear();
    }
    let known = instance_kinds(&opened.instances)?;
    let before = opened
        .document
        .observed
        .as_deref()
        .expect("existing layout")
        .to_vec();
    let after = apply(&mut opened, state, &edit, access)?;
    if (settings_edit || geometry_edit || frequency_only) && after == before {
        return Ok((view(state, access), None));
    }
    let adding = matches!(edit, Edit::Add(_) | Edit::AddAt(..));
    // Undo/redo may cross a plan change: restoring a removed Pro instance is an addition.
    let root: Fields = serde_json::from_slice(&after).map_err(|_| HostError::Protected)?;
    if matches!(edit, Edit::Undo | Edit::Redo) {
        frequency_edit::authorize_history(&opened.document.fields, &root, access)?;
    }
    let restored: Vec<Fields> = read(&root, "instances")?;
    let after_canvas = canvas(&root, opened.monitor)?;
    let mut added = None;
    let mut projected = Vec::new();
    let rates = frequency_edit::Rates::read(&root)?;
    for fields in &restored {
        let mut item = instance(fields, access)?;
        item.frequency = rates.view(&item.id, item.kind);
        relative(&mut item, opened.monitor, after_canvas)?;
        let existed = known
            .iter()
            .any(|(id, kind)| *id == item.id && *kind == item.kind);
        if adding && !existed && companion(fields)?.is_none() {
            added = Some(item.id.clone());
        }
        if !existed && item.locked {
            return Err(HostError::Denied);
        }
        if (settings_edit || geometry_edit) && companion(fields)?.is_none() {
            projected.push(item);
        }
    }
    if (settings_edit || geometry_edit) && !opened.fits_instances(projected, access, after_canvas) {
        return Err(HostError::Protected);
    }
    if let Err(error) = files::save(
        &state.path,
        &after,
        files::Mode::Observed(Some(&before)),
        &files::Options {
            limit: LIMIT,
            ..Default::default()
        },
    ) {
        return Err(if error.kind().is_conflict() {
            HostError::StudioConflict {
                current: view(state, access),
            }
        } else if error.kind() == files::Kind::Busy {
            HostError::Busy
        } else {
            HostError::Io
        });
    }
    match edit {
        Edit::Undo => {
            state.undo.pop();
            state.redo.push(before);
        }
        Edit::Redo => {
            state.redo.pop();
            state.undo.push(before);
        }
        _ => {
            state.undo.push(before);
            state.redo.clear();
            if state.undo.len() > HISTORY_LIMIT {
                state.undo.remove(0);
            }
        }
    }
    state.revision = Some(vantare_services::content_hash(&after));
    drop(edit);
    Ok((view(state, access), added))
}
fn companion(fields: &Fields) -> Result<Option<String>, HostError> {
    let settings: Fields = read(fields, "settings")?;
    optional(&settings, "companionFor", None)
}
fn apply(
    opened: &mut Open,
    state: &State,
    edit: &Edit,
    access: Option<CatalogAccess>,
) -> Result<Vec<u8>, HostError> {
    Ok(match edit {
        Edit::Undo => state.undo.last().cloned().ok_or(HostError::Denied)?,
        Edit::Redo => state.redo.last().cloned().ok_or(HostError::Denied)?,
        Edit::Visibility(id, visible) => {
            opened.find(id)?;
            for fields in &mut opened.instances {
                if read::<String>(fields, "id")? == *id
                    || companion(fields)?.as_deref() == Some(id.as_str())
                {
                    put(fields, "visible", visible)?;
                }
            }
            opened.bytes()?
        }
        Edit::Remove(id) => remove(opened, id)?,
        Edit::Instance(id, InstancePatch::Frequency(value)) => {
            if !frequency_edit::apply(opened, id, value.value(), access)? {
                return Ok(opened.document.observed.clone().expect("existing layout"));
            }
            opened.bytes()?
        }
        Edit::Instance(id, patch) => {
            let fields = opened.find(id)?;
            match patch {
                InstancePatch::Opacity(value)
                    if (crate::studio::OPACITY_MIN..=crate::studio::OPACITY_MAX)
                        .contains(value) =>
                {
                    put(fields, "opacity", &(f64::from(*value) / 100.0))?;
                }
                InstancePatch::Opacity(_) | InstancePatch::Frequency(_) => {
                    return Err(HostError::Denied);
                }
                InstancePatch::ShowIn(value) => {
                    let mut stored: Fields = optional(fields, "showIn", Fields::default())?;
                    put(&mut stored, "practice", &value.practice)?;
                    put(&mut stored, "qualifying", &value.qualifying)?;
                    put(&mut stored, "race", &value.race)?;
                    put(fields, "showIn", &stored.0)?;
                }
                InstancePatch::Settings(patch) => {
                    if !setting_edit::apply(fields, patch, access)? {
                        return Ok(opened.document.observed.clone().expect("existing layout"));
                    }
                }
                InstancePatch::OffTrack(value) => put(
                    fields,
                    "offTrack",
                    &match value {
                        OffTrack::Inherit => "inherit",
                        OffTrack::AlwaysVisible => "always_visible",
                        OffTrack::Hide => "hide",
                    },
                )?,
            }
            opened.bytes()?
        }
        Edit::Add(kind) => add(opened, *kind, None, access)?,
        Edit::AddAt(kind, at) => add(opened, *kind, Some(*at), access)?,
        Edit::Geometry(id, change) => {
            if !geometry_edit::apply(opened, id, *change, access)? {
                return Ok(opened.document.observed.clone().expect("existing layout"));
            }
            opened.bytes()?
        }
        Edit::Canvas(choice) => {
            if access.is_none() {
                return Err(HostError::Denied);
            }
            if !geometry_edit::canvas(opened, *choice)? {
                return Ok(opened.document.observed.clone().expect("existing layout"));
            }
            opened.bytes()?
        }
    })
}
fn showing(path: &Path) -> bool {
    files::read_optional(&path.with_extension("show.json"), LIMIT)
        .ok()
        .flatten()
        .is_some()
}
pub(crate) fn track(
    state: &mut State,
    show: bool,
    access: Option<CatalogAccess>,
) -> Result<StudioView, HostError> {
    if !vantare_launcher::is_local_path(&state.path) {
        return Err(HostError::Denied);
    }
    if show {
        if access.is_none() {
            return Err(HostError::Denied);
        }
        open(state)?;
    }
    if show && showing(&state.path) {
        return Ok(view(state, access));
    }
    let path = state.path.with_extension("show.json");
    if show {
        let before = files::read_optional(&path, LIMIT).map_err(|_| HostError::Protected)?;
        let current = before
            .as_deref()
            .map_or(Ok(0_u64), serde_json::from_slice)
            .map_err(|_| HostError::Protected)?;
        let next = current.checked_add(1).ok_or(HostError::Protected)?;
        files::save(
            &path,
            &serde_json::to_vec(&next).map_err(|_| HostError::Io)?,
            files::Mode::Observed(before.as_deref()),
            &files::Options {
                limit: LIMIT,
                backup: false,
                sibling_base: Some(path.with_extension("json")),
            },
        )
        .map_err(|e| {
            if e.kind() == files::Kind::Busy || e.kind().is_conflict() {
                HostError::Busy
            } else {
                HostError::Io
            }
        })?;
    } else {
        let lock = std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(false)
            .open(path.with_extension("json.lock"))
            .map_err(|_| HostError::Io)?;
        match lock.try_lock() {
            Ok(()) => {}
            Err(std::fs::TryLockError::WouldBlock) => return Err(HostError::Busy),
            Err(std::fs::TryLockError::Error(_)) => return Err(HostError::Io),
        }
        for stale in [path, state.path.with_extension("show.json.bak")] {
            match std::fs::remove_file(stale) {
                Ok(()) => {}
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(_) => return Err(HostError::Io),
            }
        }
    }
    Ok(view(state, access))
}

#[cfg(test)]
#[path = "studio_additional_tests.rs"]
mod additional_tests;
#[cfg(test)]
#[path = "studio_frequency_tests.rs"]
mod frequency_tests;

#[cfg(test)]
#[path = "studio_geometry_tests.rs"]
mod geometry_tests;
#[cfg(test)]
#[path = "table_preset_tests.rs"]
mod table_preset_tests;
#[cfg(test)]
#[path = "studio_tests.rs"]
mod tests;

fn add(
    opened: &mut Open,
    kind: WidgetKind,
    at: Option<crate::studio::Point>,
    access: Option<CatalogAccess>,
) -> Result<Vec<u8>, HostError> {
    if !kind.info(access).allowed
        || !WidgetKind::CATALOG.contains(&kind)
        || opened.instances.len() >= INSTANCE_LIMIT
    {
        return Err(HostError::Denied);
    }
    let defaults = crate::widget_defaults::get(kind.id()).ok_or(HostError::Protected)?;
    let id = (1..=INSTANCE_LIMIT + 1)
        .map(|n| format!("widget-{n}"))
        .find(|id| {
            !opened
                .instances
                .iter()
                .any(|f| read::<String>(f, "id").as_deref() == Ok(id.as_str()))
        })
        .ok_or(HostError::Denied)?;
    let (x, y) = if let Some(at) = at {
        let point = at.pair();
        let bounds = opened.canvas.size();
        if point.0 < 0.0 || point.1 < 0.0 || point.0 >= bounds.0 || point.1 >= bounds.1 {
            return Err(HostError::Rejected);
        }
        point
    } else {
        free_spot(
            opened,
            (
                f64::from(defaults.size.width),
                f64::from(defaults.size.height),
            ),
        )?
    };
    let x = x + opened.monitor.origin.0;
    let y = y + opened.monitor.origin.1;
    let mut fields = Fields::default();
    put(&mut fields, "id", &id)?;
    put(&mut fields, "x", &x)?;
    put(&mut fields, "y", &y)?;
    put(&mut fields, "visible", &true)?;
    put(&mut fields, "opacity", &1.0)?;
    fields.0.insert("settings".into(), defaults.settings);
    opened.instances.push(fields);
    opened.bytes()
}

fn remove(opened: &mut Open, id: &str) -> Result<Vec<u8>, HostError> {
    opened.find(id)?;
    let mut removed = Vec::new();
    for fields in &opened.instances {
        let own: String = read(fields, "id")?;
        if own == id || companion(fields)?.as_deref() == Some(id) {
            removed.push(own);
        }
    }
    opened.instances.retain(|fields| {
        !removed.contains(&read::<String>(fields, "id").expect("validated identity"))
    });
    ordered::remove_rates(&mut opened.document.fields, &removed)?;
    opened.bytes()
}

fn canvas(
    fields: &Fields,
    monitor: crate::studio::monitor::Monitor,
) -> Result<crate::studio::CanvasView, HostError> {
    let canvas: Option<Fields> = optional(fields, "canvasResolution", None)?;
    let (width, height) = canvas.as_ref().map_or(Ok(monitor.size), |f| {
        Ok::<_, HostError>((read::<f64>(f, "width")?, read::<f64>(f, "height")?))
    })?;
    if ![width, height]
        .iter()
        .all(|v| v.is_finite() && (64.0..=f64::from(SIZE_LIMIT)).contains(v))
    {
        return Err(HostError::Protected);
    }
    Ok(crate::studio::CanvasView {
        width: coordinate(width)?,
        height: coordinate(height)?,
        source: if canvas.is_some() {
            crate::studio::geometry::CanvasSource::Custom
        } else {
            crate::studio::geometry::CanvasSource::Monitor
        },
    })
}

impl Open {
    fn fits_instances(
        &self,
        instances: Vec<OverlayInstance>,
        access: Option<CatalogAccess>,
        canvas: crate::studio::CanvasView,
    ) -> bool {
        crate::studio::widget_settings::fits_view(&StudioView {
            instances,
            canvas: Some(canvas),
            monitor: Some(Box::new(self.monitor_size.clone())),
            ..State::unavailable(StudioState::Ready, access)
        })
    }
}

fn instance_kinds(instances: &[Fields]) -> Result<Vec<(String, WidgetKind)>, HostError> {
    instances
        .iter()
        .map(|fields| {
            let settings: Fields = read(fields, "settings")?;
            Ok((read(fields, "id")?, read(&settings, "kind")?))
        })
        .collect()
}
