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
#[path = "studio_fields.rs"]
mod ordered;
struct Open {
    document: Document,
    instances: Vec<Fields>,
}
impl Open {
    fn read(path: &Path) -> Result<Self, HostError> {
        if !vantare_launcher::is_local_path(path) {
            return Err(HostError::Denied);
        }
        let document = Document::open(path).map_err(|()| HostError::Protected)?;
        if document.observed.is_none() {
            return Err(HostError::Protected);
        }
        canvas(&document.fields)?;
        let instances: Vec<Fields> = read(&document.fields, "instances")?;
        if instances.len() > INSTANCE_LIMIT {
            return Err(HostError::Protected);
        }
        let mut ids = HashSet::new();
        for fields in &instances {
            let item = instance(fields, None)?;
            companion(fields)?;
            if !ids.insert(item.id) {
                return Err(HostError::Protected);
            }
        }
        Ok(Self {
            document,
            instances,
        })
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
    // Required native coordinates are validated, but never projected or edited.
    for axis in ["x", "y"] {
        let value: f64 = read(fields, axis)?;
        if !value.is_finite() || value.abs() > f64::from(f32::MAX) {
            return Err(HostError::Protected);
        }
    }
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
            width: width.round() as u32,
            height: height.round() as u32,
        },
    })
}
fn free_spot(opened: &Open, size: (f64, f64)) -> Result<(f64, f64), HostError> {
    let (width, height) = canvas(&opened.document.fields)?;
    let taken: Vec<_> = opened
        .instances
        .iter()
        .map(|f| {
            let item = instance(f, None)?;
            Ok::<_, HostError>((
                read::<f64>(f, "x")?,
                read::<f64>(f, "y")?,
                f64::from(item.size.width),
                f64::from(item.size.height),
            ))
        })
        .collect::<Result<_, _>>()?;
    let margin = width * 0.02;
    let step = width * 0.01;
    let gap = 12.0;
    let mut y = margin;
    while y + size.1 <= height - margin {
        let mut x = margin;
        while x + size.0 <= width - margin {
            if !taken.iter().any(|r| {
                x < r.0 + r.2 + gap
                    && x + size.0 + gap > r.0
                    && y < r.1 + r.3 + gap
                    && y + size.1 + gap > r.1
            }) {
                return Ok((x, y));
            }
            x += step;
        }
        y += step;
    }
    Ok((
        (width - size.0).max(0.0) / 2.0,
        (height - size.1).max(0.0) / 2.0,
    ))
}
pub(crate) fn view(state: &mut State, access: Option<CatalogAccess>) -> StudioView {
    let opened = Open::read(&state.path);
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
    StudioView {
        revision,
        instances: opened
            .instances
            .iter()
            .filter(|f| companion(f).expect("validated companion").is_none())
            .map(|f| instance(f, access).expect("validated instance"))
            .collect(),
        showing: showing(&state.path),
        can_undo: !state.undo.is_empty(),
        can_redo: !state.redo.is_empty(),
        ..State::unavailable(StudioState::Ready, access)
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
pub(crate) fn edit_result(
    state: &mut State,
    edit: Edit,
    revision: &str,
    access: Option<CatalogAccess>,
) -> Result<(StudioView, Option<String>), HostError> {
    let mut opened = Open::read(&state.path)?;
    if opened.revision() != revision {
        return Err(HostError::StudioConflict {
            current: view(state, access),
        });
    }
    if state.revision.as_ref().is_some_and(|last| last != revision) {
        state.undo.clear();
        state.redo.clear();
    }
    let known: Vec<(String, WidgetKind)> = opened
        .instances
        .iter()
        .map(|fields| {
            let settings: Fields = read(fields, "settings")?;
            Ok::<_, HostError>((read(fields, "id")?, read(&settings, "kind")?))
        })
        .collect::<Result<_, _>>()?;
    let before = opened
        .document
        .observed
        .as_deref()
        .expect("existing layout")
        .to_vec();
    let after = apply(&mut opened, state, &edit, access)?;
    let adding = matches!(edit, Edit::Add(_));
    // Undo/redo may cross a plan change: restoring a removed Pro instance is an addition.
    let root: Fields = serde_json::from_slice(&after).map_err(|_| HostError::Protected)?;
    let restored: Vec<Fields> = read(&root, "instances")?;
    let mut added = None;
    for fields in &restored {
        let item = instance(fields, access)?;
        let existed = known
            .iter()
            .any(|(id, kind)| *id == item.id && *kind == item.kind);
        if adding && !existed && companion(fields)?.is_none() {
            added = Some(item.id.clone());
        }
        if !existed && item.locked {
            return Err(HostError::Denied);
        }
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
        Edit::Instance(id, patch) => {
            let fields = opened.find(id)?;
            match patch {
                InstancePatch::Opacity(value)
                    if (crate::studio::OPACITY_MIN..=crate::studio::OPACITY_MAX)
                        .contains(value) =>
                {
                    put(fields, "opacity", &(f64::from(*value) / 100.0))?;
                }
                InstancePatch::Opacity(_) => return Err(HostError::Denied),
                InstancePatch::ShowIn(value) => {
                    let mut stored: Fields = optional(fields, "showIn", Fields::default())?;
                    put(&mut stored, "practice", &value.practice)?;
                    put(&mut stored, "qualifying", &value.qualifying)?;
                    put(&mut stored, "race", &value.race)?;
                    put(fields, "showIn", &stored.0)?;
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
        Edit::Add(kind) => add(opened, *kind, access)?,
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
        Open::read(&state.path)?;
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
#[path = "studio_tests.rs"]
mod tests;

fn add(
    opened: &mut Open,
    kind: WidgetKind,
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
    let (x, y) = free_spot(
        opened,
        (
            f64::from(defaults.size.width),
            f64::from(defaults.size.height),
        ),
    )?;
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

fn canvas(fields: &Fields) -> Result<(f64, f64), HostError> {
    let canvas: Option<Fields> = optional(fields, "canvasResolution", None)?;
    let (width, height) = canvas.as_ref().map_or(Ok((1920.0, 1080.0)), |f| {
        Ok::<_, HostError>((read::<f64>(f, "width")?, read::<f64>(f, "height")?))
    })?;
    if ![width, height]
        .iter()
        .all(|v| v.is_finite() && (64.0..=f64::from(SIZE_LIMIT)).contains(v))
    {
        return Err(HostError::Protected);
    }
    Ok((width, height))
}
