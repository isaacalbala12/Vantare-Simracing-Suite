//! Pure precedence rule for reduced motion, shared by overlay engines.
#[derive(Clone, Copy, Default, PartialEq, Eq)]
pub struct MotionPolicy(pub bool);
impl MotionPolicy {
    pub fn select(layout: Option<bool>, legacy: Self) -> Self {
        layout.map_or(legacy, Self)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn absent_layout_uses_appearance_and_explicit_values_always_win() {
        assert!(MotionPolicy::select(None, MotionPolicy(true)).0);
        assert!(!MotionPolicy::select(Some(false), MotionPolicy(true)).0);
        assert!(MotionPolicy::select(Some(true), MotionPolicy(false)).0);
    }
}
