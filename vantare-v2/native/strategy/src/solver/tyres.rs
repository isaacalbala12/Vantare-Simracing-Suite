//! Go's finite uniform fitments: locked corners first, then physical identity.
use super::model::{require, source};
use super::{Input, evidence};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Fitment {
    pub front_left: String,
    pub front_right: String,
    pub rear_left: String,
    pub rear_right: String,
}
impl Fitment {
    pub(super) fn ids(&self) -> [&str; 4] {
        [
            &self.front_left,
            &self.front_right,
            &self.rear_left,
            &self.rear_right,
        ]
    }
}
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TyreInventory {
    pub maximum: usize,
    pub tyres: Vec<PhysicalTyre>,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PhysicalTyre {
    pub id: String,
    pub compound: String,
    pub origin: String,
    pub condition: Value,
    pub state: String,
    pub stints: usize,
    #[serde(default)]
    pub mounted_corner: String,
    #[serde(default)]
    pub locked_corner: String,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CurvePoint {
    pub lap_in_stint: u32,
    pub delta_seconds: f64,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CompoundPace {
    pub compound: String,
    pub presence: String,
    pub provenance: Value,
    pub confidence: Value,
    pub pace_delta_seconds: f64,
    pub degradation_per_lap_seconds: f64,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub curve: Vec<CurvePoint>,
}
impl CompoundPace {
    pub(super) fn validate(&mut self, input: &Input) -> Result<(), String> {
        require(
            valid_compound(&self.compound) && self.presence == "valid",
            "compound/presence",
        )?;
        source(&self.provenance, &self.confidence)?;
        require(
            self.pace_delta_seconds.is_finite()
                && self.degradation_per_lap_seconds.is_finite()
                && self.degradation_per_lap_seconds >= 0.0,
            "compound cost",
        )?;
        require(
            self.curve.is_empty() || self.degradation_per_lap_seconds == 0.0,
            "compound curve and slope cannot coexist",
        )?;
        require(self.curve.len() <= 256, "compound curve >256")?;
        let mut ages = BTreeSet::new();
        for point in &self.curve {
            require(
                point.lap_in_stint > 0
                    && point.lap_in_stint <= input.race_laps
                    && point.delta_seconds.is_finite()
                    && ages.insert(point.lap_in_stint),
                "compound curve point",
            )?;
        }
        self.curve.sort_by_key(|point| point.lap_in_stint);
        for lap in 1..=input.race_laps {
            require(
                input.base_lap_seconds.value + self.pace_delta_seconds + self.delta(lap) > 0.0,
                "compound produces nonpositive lap time",
            )?;
        }
        Ok(())
    }
    pub(super) fn delta(&self, lap: u32) -> f64 {
        sorted_curve_delta(&self.curve, self.degradation_per_lap_seconds, lap, 0.0)
    }
}
// Points belong to a prepared private model and are sorted by stint age.
pub(super) fn sorted_curve_delta(
    points: &[CurvePoint],
    slope: f64,
    lap: u32,
    tail_floor: f64,
) -> f64 {
    if points.is_empty() {
        return f64::from(lap - 1) * slope;
    }
    let first = &points[0];
    let last = &points[points.len() - 1];
    if lap <= first.lap_in_stint {
        return first.delta_seconds;
    }
    if lap > last.lap_in_stint {
        let mut tail = tail_floor.max(0.0);
        if points.len() > 1 {
            let prev = &points[points.len() - 2];
            tail = tail.max(
                (last.delta_seconds - prev.delta_seconds)
                    / f64::from(last.lap_in_stint - prev.lap_in_stint),
            );
        }
        return last.delta_seconds + f64::from(lap - last.lap_in_stint) * tail;
    }
    for pair in points.windows(2) {
        let (l, r) = (&pair[0], &pair[1]);
        if lap <= r.lap_in_stint {
            return l.delta_seconds
                + f64::from(lap - l.lap_in_stint) / f64::from(r.lap_in_stint - l.lap_in_stint)
                    * (r.delta_seconds - l.delta_seconds);
        }
    }
    last.delta_seconds
}
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub(super) struct Choice {
    pub compound: String,
    pub fitment: Option<Fitment>,
}
#[derive(Clone, Default)]
pub(super) struct TyreModel {
    pub compounds: BTreeMap<String, CompoundPace>,
    pub choices: Vec<Choice>,
}
pub(super) fn valid_compound(s: &str) -> bool {
    ["soft", "medium", "hard", "wet"].contains(&s)
}
const CORNERS: [&str; 4] = ["front_left", "front_right", "rear_left", "rear_right"];

impl TyreModel {
    #[allow(clippy::too_many_lines)] // Validate inventory before deterministic fitment assignment.
    pub fn new(
        input: &Input,
        inventory: Option<&TyreInventory>,
        compounds: &[CompoundPace],
    ) -> Result<Self, String> {
        if inventory.is_none() && compounds.is_empty() {
            return Ok(Self::default());
        }
        let inventory = inventory.ok_or("invalid_input: compoundPace requires tyreInventory")?;
        require(
            !compounds.is_empty() && input.degradation_per_lap_seconds.value == 0.0,
            "inventory requires compound pace without global degradation",
        )?;
        require(
            inventory.tyres.len() <= inventory.maximum,
            "inventory maximum",
        )?;
        let mut ids = BTreeSet::new();
        for t in &inventory.tyres {
            let safe = !t.id.is_empty()
                && t.id.len() <= 128
                && t.id.as_bytes()[0].is_ascii_alphanumeric()
                && t.id
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"._:-".contains(&b));
            require(
                safe && ids.insert(&t.id) && valid_compound(&t.compound),
                "physical tyre identity/compound",
            )?;
            require(
                ["event_allocation", "qualifying", "unknown"].contains(&t.origin.as_str()),
                "tyre origin",
            )?;
            let lo = t.condition["minimumRemainingPercent"]
                .as_f64()
                .ok_or("invalid_input: condition minimum")?;
            let hi = t.condition["maximumRemainingPercent"]
                .as_f64()
                .ok_or("invalid_input: condition maximum")?;
            require(
                lo.is_finite() && hi.is_finite() && lo >= 0.0 && hi <= 100.0 && lo <= hi,
                "tyre condition",
            )?;
            evidence(
                &json!({"provenance":t.condition["provenance"],"confidence":t.condition["confidence"]}),
            )?;
            let kind = t.condition["provenance"]["kind"].as_str().unwrap_or("");
            require(
                if lo.total_cmp(&hi).is_eq() {
                    ["observed", "corrected", "manual", "derived"].contains(&kind)
                } else {
                    ["range", "estimated"].contains(&kind)
                },
                "condition evidence kind",
            )?;
            let locked = CORNERS.contains(&t.locked_corner.as_str());
            let mounted = CORNERS.contains(&t.mounted_corner.as_str());
            let valid = match t.state.as_str() {
                "free" => {
                    t.stints == 0 && t.locked_corner.is_empty() && t.mounted_corner.is_empty()
                }
                "mounted" => {
                    mounted
                        && if t.stints == 0 {
                            t.locked_corner.is_empty()
                        } else {
                            locked && t.locked_corner == t.mounted_corner
                        }
                }
                "used" => t.stints > 0 && locked && t.mounted_corner.is_empty(),
                "discarded" => {
                    t.mounted_corner.is_empty()
                        && if t.stints == 0 {
                            t.locked_corner.is_empty()
                        } else {
                            locked
                        }
                }
                _ => false,
            };
            require(valid, "tyre state/corner history")?;
        }
        let mut model = Self::default();
        for c in compounds {
            let mut c = c.clone();
            c.validate(input)?;
            require(
                model.compounds.insert(c.compound.clone(), c).is_none(),
                "duplicate compound parameter",
            )?;
        }
        for compound in model.compounds.keys() {
            let mut excluded = BTreeSet::new();
            loop {
                let mut selected = vec![];
                if !assign(&inventory.tyres, compound, 0, &mut selected, &excluded) {
                    break;
                }
                let fitment = Fitment {
                    front_left: selected[0].clone(),
                    front_right: selected[1].clone(),
                    rear_left: selected[2].clone(),
                    rear_right: selected[3].clone(),
                };
                excluded.extend(selected);
                model.choices.push(Choice {
                    compound: compound.clone(),
                    fitment: Some(fitment),
                });
            }
        }
        Ok(model)
    }
    pub fn enabled(&self) -> bool {
        !self.compounds.is_empty()
    }
    pub fn initial(&self) -> Vec<Choice> {
        if !self.enabled() {
            return vec![Choice::default()];
        }
        self.compounds
            .keys()
            .filter_map(|c| self.choices.iter().find(|v| &v.compound == c).cloned())
            .collect()
    }
    pub fn next(&self, current: &Choice) -> Vec<(Choice, bool)> {
        if !self.enabled() {
            return vec![(Choice::default(), true)];
        }
        let mut next = vec![(current.clone(), false)];
        next.extend(
            self.choices
                .iter()
                .filter(|v| *v != current)
                .cloned()
                .map(|v| (v, true)),
        );
        next
    }
    pub fn resolve(
        &self,
        compound: &str,
        fitment: Option<&Fitment>,
        current: Option<&Choice>,
        change: bool,
    ) -> Option<Choice> {
        if !self.enabled() {
            return Some(Choice::default());
        }
        if !change && let Some(c) = current {
            return (c.compound == compound
                && fitment.is_none_or(|f| Some(f) == c.fitment.as_ref()))
            .then(|| c.clone());
        }
        self.choices
            .iter()
            .find(|v| {
                v.compound == compound
                    && fitment.is_none_or(|f| Some(f) == v.fitment.as_ref())
                    && current.is_none_or(|c| c != *v)
            })
            .cloned()
    }
}
fn assign(
    tyres: &[PhysicalTyre],
    compound: &str,
    corner: usize,
    chosen: &mut Vec<String>,
    excluded: &BTreeSet<String>,
) -> bool {
    if corner == 4 {
        return true;
    }
    let need = CORNERS[corner];
    let mut candidates: Vec<&PhysicalTyre> = tyres
        .iter()
        .filter(|t| {
            t.compound == compound
                && t.state != "discarded"
                && (t.locked_corner.is_empty() || t.locked_corner == need)
                && !excluded.contains(&t.id)
                && !chosen.contains(&t.id)
        })
        .collect();
    candidates.sort_by(|l, r| {
        (r.locked_corner == need)
            .cmp(&(l.locked_corner == need))
            .then(l.id.cmp(&r.id))
    });
    for t in candidates {
        chosen.push(t.id.clone());
        if assign(tyres, compound, corner + 1, chosen, excluded) {
            return true;
        }
        chosen.pop();
    }
    false
}
pub(super) fn age(choice: &Choice, usage: &BTreeMap<String, u32>, scalar_age: u32) -> u32 {
    choice.fitment.as_ref().map_or(scalar_age, |f| {
        f.ids()
            .iter()
            .map(|id| usage.get(*id).copied().unwrap_or(0))
            .max()
            .unwrap_or(0)
    })
}
pub(super) fn use_fitment(choice: &Choice, usage: &mut BTreeMap<String, u32>, laps: u32) {
    if let Some(f) = &choice.fitment {
        for id in f.ids() {
            *usage.entry(id.into()).or_default() += laps;
        }
    }
}
