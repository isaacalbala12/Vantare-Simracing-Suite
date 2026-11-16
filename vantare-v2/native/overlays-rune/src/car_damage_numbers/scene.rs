//! Car damage numbers scene: the visible rows, the notice lines and the intrinsic
//! height. The two-line split is `car_damage_numbers::status_lines`, shared with GPUI.
use vantare_domain::car_damage_numbers::{self, ViewModel};

/// Fixed width of `CarDamageNumbersFunctional`.
pub const WIDTH: f32 = 164.0;
const TOP: f32 = 8.0;
const BOTTOM: f32 = 8.0;
const ROW_H: f32 = 29.0;
const NOTICE_LINE_H: f32 = 24.0;
const NOTICE_GAP: f32 = 20.0;

#[derive(Clone, Debug, PartialEq)]
pub struct Row {
    pub label: &'static str,
    pub value: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Scene {
    /// Three without tyres, four with them.
    pub rows: Vec<Row>,
    /// Zero, one or two lines of source notice.
    pub notice: Vec<&'static str>,
    /// Height of the widget for these rows and notice.
    pub height: f32,
}

/// Pure sampling: the Eficiencia painter chooses pixels and colours, never these values.
#[must_use]
pub fn sample(vm: &ViewModel) -> Scene {
    let count = if vm.show_tyres { 4 } else { 3 };
    let rows = vm
        .labels
        .iter()
        .copied()
        .zip(vm.values.iter().cloned())
        .take(count)
        .map(|(label, value)| Row { label, value })
        .collect();
    let notice = car_damage_numbers::status_lines(vm.status_text);
    let notice_h = if notice.is_empty() {
        0.0
    } else {
        NOTICE_GAP + NOTICE_LINE_H * notice.len() as f32
    };
    let height = TOP + notice_h + count as f32 * ROW_H + BOTTOM;
    Scene {
        rows,
        notice,
        height,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vm(show_tyres: bool, status: Option<&'static str>) -> ViewModel {
        ViewModel {
            labels: ["AERO", "CARROC.", "SUSP", "NEUM."],
            values: ["0%".into(), "13%".into(), "50%".into(), "100%".into()],
            status_text: status,
            show_tyres,
        }
    }

    #[test]
    fn the_height_follows_rows_and_notice_lines() {
        for (tyres, status, height) in [
            (true, None, 132.0),
            (false, None, 103.0),
            (true, Some("SIN DATOS"), 176.0),
            (true, Some("DATOS ANTIGUOS"), 200.0),
            (false, Some("SIN DATOS"), 147.0),
            (false, Some("DATOS ANTIGUOS"), 171.0),
        ] {
            let scene = sample(&vm(tyres, status));
            assert_eq!(scene.height, height, "{tyres} {status:?}");
        }
    }

    #[test]
    fn rows_carry_the_domain_labels_and_values() {
        let scene = sample(&vm(true, None));
        assert_eq!(
            scene
                .rows
                .iter()
                .map(|row| (row.label, row.value.as_str()))
                .collect::<Vec<_>>(),
            [
                ("AERO", "0%"),
                ("CARROC.", "13%"),
                ("SUSP", "50%"),
                ("NEUM.", "100%")
            ]
        );
        let scene = sample(&vm(false, None));
        assert_eq!(scene.rows.len(), 3);
        assert!(!scene.rows.iter().any(|row| row.label == "NEUM."));
    }

    #[test]
    fn the_notice_is_the_domain_split() {
        for status in [
            None,
            Some("SIN DATOS"),
            Some("DATOS ANTIGUOS"),
            Some("DATA OUT OF DATE"),
            Some("DESCONECTADO"),
        ] {
            assert_eq!(
                sample(&vm(true, status)).notice,
                car_damage_numbers::status_lines(status),
                "{status:?}"
            );
        }
        assert_eq!(sample(&vm(true, None)).notice, Vec::<&str>::new());
        assert_eq!(
            sample(&vm(true, Some("DATOS ANTIGUOS"))).notice,
            ["DATOS", "ANTIGUOS"]
        );
    }
}
