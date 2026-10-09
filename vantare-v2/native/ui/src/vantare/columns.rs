//! Edición del orden de columnas Vantare, compartida por Workshop y Studio:
//! geometría de las columnas colocadas y movimientos sobre `columns`.

use crate::standings::options::ColumnSetting;

/// Columnas colocadas para editarlas: `(métrica, x, ancho)`, franja vertical
/// de la cabecera a la última fila y separación entre columnas (px del widget).
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct ColumnBoxes {
    pub columns: Vec<(&'static str, f32, f32)>,
    pub top: f32,
    pub bottom: f32,
    pub gap: f32,
}

impl ColumnBoxes {
    /// Columna bajo el punto, contando media separación a cada lado.
    pub(crate) fn at(&self, x: f32, y: f32) -> Option<(&'static str, f32, f32)> {
        if y < self.top || y > self.bottom {
            return None;
        }
        let half = self.gap / 2.0;
        self.columns
            .iter()
            .copied()
            .find(|(_, left, width)| x >= left - half && x <= left + width + half)
    }
}

/// Columna que ocupa un hueco propio y se ve (el piloto se ve siempre).
fn movable(column: &ColumnSetting, metrics: &[&str]) -> bool {
    metrics.contains(&column.metric_id.as_str())
        && (column.enabled || column.metric_id == "driverName")
}

/// Mueve `metric` justo delante de `before`, o tras la última columna visible
/// si `before` es `None`. Las columnas ocultas conservan su sitio relativo.
/// Devuelve si cambió el orden. Compartido por Workshop y Studio.
pub(crate) fn move_column(
    columns: &mut Vec<ColumnSetting>,
    metric: &str,
    before: Option<&str>,
    metrics: &[&str],
) -> bool {
    if before == Some(metric) {
        return false;
    }
    let Some(from) = columns
        .iter()
        .position(|c| c.metric_id == metric && movable(c, metrics))
    else {
        return false;
    };
    let previous = columns.clone();
    let column = columns.remove(from);
    let at = if let Some(target) = before {
        let Some(index) = columns.iter().position(|c| c.metric_id == target) else {
            *columns = previous;
            return false;
        };
        index
    } else {
        columns
            .iter()
            .rposition(|c| movable(c, metrics))
            .map_or(columns.len(), |i| i + 1)
    };
    columns.insert(at, column);
    *columns != previous
}

/// Desplaza `metric` un puesto (`step` −1 izquierda, +1 derecha) entre las
/// columnas visibles. Devuelve si cambió el orden.
pub(crate) fn shift_column(
    columns: &mut Vec<ColumnSetting>,
    metric: &str,
    step: i32,
    metrics: &[&str],
) -> bool {
    let visible: Vec<String> = columns
        .iter()
        .filter(|c| movable(c, metrics))
        .map(|c| c.metric_id.clone())
        .collect();
    let Some(index) = visible.iter().position(|m| m == metric) else {
        return false;
    };
    match step {
        -1 if index > 0 => move_column(columns, metric, Some(&visible[index - 1]), metrics),
        1 if index + 2 < visible.len() => {
            move_column(columns, metric, Some(&visible[index + 2]), metrics)
        }
        1 if index + 1 < visible.len() => move_column(columns, metric, None, metrics),
        _ => false,
    }
}
