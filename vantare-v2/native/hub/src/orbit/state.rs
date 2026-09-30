//! Estado independiente de GPUI: selección, teclado y límites numéricos.
#[derive(Clone, Debug)]
pub struct OptionItem {
    pub label: String,
    pub enabled: bool,
}
impl OptionItem {
    pub fn new(label: impl Into<String>) -> Self {
        Self {
            label: label.into(),
            enabled: true,
        }
    }
    pub fn disabled(label: impl Into<String>) -> Self {
        Self {
            label: label.into(),
            enabled: false,
        }
    }
}
#[derive(Clone, Debug)]
pub struct ChoiceState {
    pub options: Vec<OptionItem>,
    pub selected: Option<usize>,
    pub active: Option<usize>,
    pub open: bool,
    pub enabled: bool,
}
impl ChoiceState {
    pub fn new(options: Vec<OptionItem>, selected: Option<usize>) -> Self {
        let selected = selected.filter(|&i| options.get(i).is_some_and(|o| o.enabled));
        Self {
            options,
            selected,
            active: selected,
            open: false,
            enabled: true,
        }
    }
    pub fn open(&mut self) {
        if self.enabled {
            self.open = true;
            self.active = self
                .selected
                .or_else(|| self.options.iter().position(|o| o.enabled));
        }
    }
    pub fn toggle(&mut self) {
        if self.open {
            self.close();
        } else {
            self.open();
        }
    }
    pub fn close(&mut self) {
        self.open = false;
        self.active = self.selected;
    }
    pub fn choose(&mut self, index: usize) -> bool {
        if !self.enabled || !self.options.get(index).is_some_and(|o| o.enabled) {
            return false;
        }
        let changed = self.selected != Some(index);
        self.selected = Some(index);
        self.close();
        changed
    }
    pub fn key(&mut self, key: &str, immediate: bool) -> bool {
        if !self.enabled {
            return false;
        }
        match key {
            "escape" => self.close(),
            "enter" | "space" => {
                if self.open || immediate {
                    if let Some(index) = self.active {
                        return self.choose(index);
                    }
                } else {
                    self.open();
                }
            }
            "up" | "left" | "down" | "right" | "home" | "end" => {
                if !self.open && !immediate {
                    self.open();
                    return false;
                }
                let enabled: Vec<_> = self
                    .options
                    .iter()
                    .enumerate()
                    .filter_map(|(i, o)| o.enabled.then_some(i))
                    .collect();
                if enabled.is_empty() {
                    self.active = None;
                    return false;
                }
                let position = self
                    .active
                    .and_then(|i| enabled.iter().position(|&n| n == i));
                let next = match key {
                    "home" => 0,
                    "end" => enabled.len() - 1,
                    "left" | "up" => position.map_or(enabled.len() - 1, |p| {
                        (p + enabled.len() - 1) % enabled.len()
                    }),
                    _ => position.map_or(0, |p| (p + 1) % enabled.len()),
                };
                self.active = Some(enabled[next]);
                if immediate {
                    return self.choose(enabled[next]);
                }
            }
            _ => (),
        }
        false
    }
}
pub fn toggled(value: bool, enabled: bool, key: &str) -> bool {
    if enabled && matches!(key, "enter" | "space") {
        !value
    } else {
        value
    }
}
#[derive(Clone, Copy, Debug)]
pub struct NumberRange {
    pub min: f64,
    pub max: f64,
    pub step: f64,
    pub value: f64,
}
impl NumberRange {
    pub fn new(min: f64, max: f64, step: f64, value: f64) -> Result<Self, &'static str> {
        if ![min, max, step, value].iter().all(|v| v.is_finite())
            || max < min
            || step <= 0.0
            || !(max - min).is_finite()
        {
            return Err("rango numérico inválido");
        }
        let mut range = Self {
            min,
            max,
            step,
            value: min,
        };
        range.set(value);
        Ok(range)
    }
    pub fn set(&mut self, value: f64) -> bool {
        if !value.is_finite() {
            return false;
        }
        let next = (self.min
            + ((value.clamp(self.min, self.max) - self.min) / self.step).round() * self.step)
            .clamp(self.min, self.max);
        let changed = (next - self.value).abs() > f64::EPSILON;
        self.value = next;
        changed
    }
    pub fn key(&mut self, key: &str) -> bool {
        match key {
            "left" | "down" => self.set(self.value - self.step),
            "right" | "up" => self.set(self.value + self.step),
            "home" => self.set(self.min),
            "end" => self.set(self.max),
            "pageup" => self.set(self.value + self.step * 10.0),
            "pagedown" => self.set(self.value - self.step * 10.0),
            _ => false,
        }
    }
    pub fn fraction(self) -> f64 {
        if self.max <= self.min {
            0.0
        } else {
            (self.value - self.min) / (self.max - self.min)
        }
    }
}
pub fn focus_step(current: Option<usize>, count: usize, reverse: bool) -> Option<usize> {
    if count == 0 {
        return None;
    }
    Some(match current {
        None => {
            if reverse {
                count - 1
            } else {
                0
            }
        }
        Some(i) => {
            if reverse {
                (i + count - 1) % count
            } else {
                (i + 1) % count
            }
        }
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn dropdown_navigation_skips_disabled_commits_and_cancels() {
        let mut state = ChoiceState::new(
            vec![
                OptionItem::new("ES"),
                OptionItem::disabled("PT"),
                OptionItem::new("EN"),
            ],
            Some(0),
        );
        state.key("down", false);
        assert!(state.open);
        state.key("down", false);
        assert_eq!(state.active, Some(2));
        state.key("escape", false);
        assert_eq!(state.selected, Some(0));
        assert!(!state.open);
        state.key("enter", false);
        state.key("end", false);
        assert!(state.key("enter", false));
        assert_eq!(state.selected, Some(2));
        state.enabled = false;
        state.key("home", true);
        assert!(!state.choose(0));
        assert_eq!(state.selected, Some(2));
    }
    #[test]
    fn tabs_segments_and_lists_wrap_and_empty_options_are_safe() {
        let mut state = ChoiceState::new(vec![OptionItem::new("a"), OptionItem::new("b")], Some(0));
        assert!(state.key("left", true));
        assert_eq!(state.selected, Some(1));
        assert!(state.key("right", true));
        assert_eq!(state.selected, Some(0));
        let mut unselected =
            ChoiceState::new(vec![OptionItem::new("a"), OptionItem::new("b")], None);
        assert!(unselected.key("right", true));
        assert_eq!(unselected.selected, Some(0));
        let mut empty = ChoiceState::new(vec![], None);
        empty.key("down", false);
        empty.key("down", false);
        assert_eq!(empty.active, None);
    }
    #[test]
    fn dropdown_trigger_toggles_without_committing_and_disabled_stays_closed() {
        let mut state = ChoiceState::new(vec![OptionItem::new("A"), OptionItem::new("B")], Some(0));
        state.toggle();
        state.key("down", false);
        assert_eq!(state.active, Some(1));
        state.toggle();
        assert!(!state.open);
        assert_eq!(state.selected, Some(0));
        assert_eq!(state.active, Some(0));
        state.enabled = false;
        state.toggle();
        assert!(!state.open);
    }
    #[test]
    fn checkbox_only_responds_to_activation_when_enabled() {
        assert!(toggled(false, true, "space"));
        assert!(!toggled(true, true, "enter"));
        assert!(!toggled(false, false, "space"));
        assert!(toggled(true, true, "left"));
    }
    #[test]
    fn slider_and_stepper_clamp_snap_and_reject_nonfinite_values() {
        let mut range = NumberRange::new(0.0, 100.0, 5.0, 51.0).expect("rango");
        assert!((range.value - 50.0).abs() < f64::EPSILON);
        range.key("end");
        assert!((range.fraction() - 1.0).abs() < f64::EPSILON);
        assert!(!range.key("up"));
        range.key("home");
        range.key("pageup");
        assert!((range.value - 50.0).abs() < f64::EPSILON);
        assert!(!range.set(f64::NAN));
        assert!(NumberRange::new(1.0, 0.0, 1.0, 0.0).is_err());
        assert!(
            NumberRange::new(1.0, 1.0, 1.0, 1.0)
                .expect("fijo")
                .fraction()
                .abs()
                < f64::EPSILON
        );
    }
    #[test]
    fn modal_focus_wraps_both_directions_and_handles_empty_content() {
        assert_eq!(focus_step(Some(2), 3, false), Some(0));
        assert_eq!(focus_step(Some(0), 3, true), Some(2));
        assert_eq!(focus_step(None, 3, true), Some(2));
        assert_eq!(focus_step(None, 0, false), None);
    }
}
