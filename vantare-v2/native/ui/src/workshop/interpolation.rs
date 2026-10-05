use vantare_domain::{Gap, Pose, Quality, Snapshot};

fn blend<T: Copy>(from: &mut Quality<T>, to: Quality<T>, interpolate: impl FnOnce(T, T) -> T) {
    if let (Some(a), Some(b)) = (from.current().copied(), to.current().copied()) {
        let value = interpolate(a, b);
        *from = if matches!(from, Quality::Estimated(_)) || matches!(to, Quality::Estimated(_)) {
            Quality::Estimated(value)
        } else {
            Quality::Reliable(value)
        };
    }
}

/// Solo Workshop: interpolar cantidades continuas, nunca hechos ni ausencias.
pub(super) fn snapshot(from: &Snapshot, to: &Snapshot, progress: f64, radar: bool) -> Snapshot {
    if progress >= 1.0 {
        return to.clone();
    }
    let mut result = from.clone();
    if from.epoch != to.epoch || from.state.session.id != to.state.session.id {
        return result;
    }
    let p = progress.clamp(0.0, 1.0);
    let eased = if radar {
        p
    } else if p < 0.5 {
        2.0 * p * p
    } else {
        1.0 - (-2.0 * p + 2.0).powi(2) / 2.0
    };
    let lerp = |a: f64, b: f64| a + (b - a) * eased;
    blend(
        &mut result.state.session.remaining_s,
        to.state.session.remaining_s,
        lerp,
    );
    for car in &mut result.state.cars {
        let Some(next) = to.state.cars.iter().find(|next| next.id == car.id) else {
            continue;
        };
        blend(&mut car.relative_s, next.relative_s, lerp);
        for (gap, next) in [
            (&mut car.gap_leader, next.gap_leader),
            (&mut car.gap_ahead, next.gap_ahead),
            (&mut car.gap_class_leader, next.gap_class_leader),
            (&mut car.gap_class_ahead, next.gap_class_ahead),
        ] {
            if matches!(gap.current(), Some(Gap::Time { .. }))
                && matches!(next.current(), Some(Gap::Time { .. }))
            {
                blend(gap, next, |a, b| match (a, b) {
                    (Gap::Time { seconds: a }, Gap::Time { seconds: b }) => Gap::Time {
                        seconds: lerp(a, b),
                    },
                    _ => a,
                });
            }
        }
        if radar {
            blend(&mut car.pose, next.pose, |a, b| Pose {
                x_m: a.x_m + (b.x_m - a.x_m) * p,
                y_m: a.y_m + (b.y_m - a.y_m) * p,
                ..a
            });
        }
    }
    if let (Some(player), Some(next)) = (&mut result.state.player, &to.state.player)
        && player.car == next.car
    {
        blend(&mut player.delta_best_s, next.delta_best_s, lerp);
        blend(
            &mut player.telemetry.throttle,
            next.telemetry.throttle,
            lerp,
        );
        blend(&mut player.telemetry.brake, next.telemetry.brake, lerp);
        blend(&mut player.telemetry.clutch, next.telemetry.clutch, lerp);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use vantare_domain::{Car, CarId};
    #[test]
    fn continuous_values_approach_keyframes_while_events_and_absence_hold_until_arrival() {
        let mut from = Snapshot::default();
        from.state.cars.push(Car {
            id: CarId(1),
            relative_s: Quality::Reliable(4.0),
            position: Quality::Reliable(9),
            in_pits: Quality::Reliable(false),
            best_lap_s: Quality::Reliable(90.0),
            ..Default::default()
        });
        let mut to = from.clone();
        to.state.cars[0].relative_s = Quality::Reliable(0.0);
        to.state.cars[0].position = Quality::Reliable(8);
        to.state.cars[0].in_pits = Quality::Reliable(true);
        to.state.cars[0].best_lap_s = Quality::Reliable(89.0);
        let middle = snapshot(&from, &to, 0.5, false);
        assert_eq!(middle.state.cars[0].relative_s, Quality::Reliable(2.0));
        assert_eq!(middle.state.cars[0].position, Quality::Reliable(9));
        assert_eq!(middle.state.cars[0].in_pits, Quality::Reliable(false));
        assert_eq!(middle.state.cars[0].best_lap_s, Quality::Reliable(90.0));
        assert_eq!(
            snapshot(&from, &to, 1.0, false).state.cars[0].position,
            Quality::Reliable(8)
        );
        from.state.cars[0].relative_s = Quality::Unavailable;
        assert_eq!(
            snapshot(&from, &to, 0.5, false).state.cars[0].relative_s,
            Quality::Unavailable
        );
        from.state.cars[0].relative_s = Quality::Stale(4.0);
        assert_eq!(
            snapshot(&from, &to, 0.5, false).state.cars[0].relative_s,
            Quality::Stale(4.0)
        );
    }
}
