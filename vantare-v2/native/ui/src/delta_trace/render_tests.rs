use super::*;
use crate::paint_tests::{observe, with_kit};
use vantare_domain::{Quality::Reliable, SourceState, format::Language};

fn photo(distance: f64, length: f64) -> Snapshot {
    let mut photo = crate::source::fixed();
    photo.state.source_state = SourceState::Live;
    photo.state.session.track_length_m = Reliable(length);
    let own = photo.state.player.expect("jugador").car;
    let car = photo
        .state
        .cars
        .iter_mut()
        .find(|c| c.id == own)
        .expect("coche");
    car.laps = Reliable(4);
    car.lap_distance_m = Reliable(distance);
    car.current_sectors_s = vec![Reliable(28.9); 3];
    car.best_sectors_s = vec![Reliable(29.0); 3];
    photo
}

#[test]
fn header_never_paints_nonfinite_or_out_of_range_progress() {
    with_kit(SIZE.0, Language::Es, |kit| {
        for (distance, length) in [
            (f64::NAN, 1000.0),
            (-30.0, 1000.0),
            (1010.0, 1000.0),
            (f64::INFINITY, 1000.0),
            (5.0, f64::INFINITY),
            (5.0, 0.0),
        ] {
            let photo = photo(distance, length);
            let details = Details::from(
                &photo,
                Preferences::default(),
                &vantare_domain::delta::project(&photo, Preferences::default()),
            );
            let painted = observe(|draw| paint_heading(&details, kit, draw));
            assert!(
                !painted.iter().any(|label| label.value.contains('%')),
                "no se inventa progreso: {painted:?}"
            );
            assert!(
                !painted
                    .iter()
                    .any(|label| label.value.contains("NaN") || label.value.contains("inf"))
            );
        }
        let photo = photo(500.0, 1000.0);
        let details = Details::from(
            &photo,
            Preferences::default(),
            &vantare_domain::delta::project(&photo, Preferences::default()),
        );
        let painted = observe(|draw| paint_heading(&details, kit, draw));
        assert!(
            painted
                .iter()
                .any(|label| label.value == "VUELTA 5 · 50 %" && label.right == Some(748.0))
        );
    });
}

#[test]
fn sector_footer_paints_a_placeholder_for_invalid_times() {
    with_kit(SIZE.0, Language::Es, |kit| {
        for (current, best) in [
            (f64::NAN, 29.0),
            (29.0, f64::INFINITY),
            (-1.0, 29.0),
            (0.0, 29.0),
        ] {
            let mut photo = photo(500.0, 1000.0);
            let own = photo.state.player.expect("jugador").car;
            let car = photo
                .state
                .cars
                .iter_mut()
                .find(|c| c.id == own)
                .expect("coche");
            car.current_sectors_s[0] = Reliable(current);
            car.best_sectors_s[0] = Reliable(best);
            let details = Details::from(
                &photo,
                Preferences::default(),
                &vantare_domain::delta::project(&photo, Preferences::default()),
            );
            let painted = observe(|draw| paint_sector_text(&details, 0, kit, draw));
            assert_eq!(
                painted
                    .iter()
                    .map(|label| label.value.as_str())
                    .collect::<Vec<_>>(),
                ["S1", "—"]
            );
        }
        let photo = photo(500.0, 1000.0);
        let details = Details::from(
            &photo,
            Preferences::default(),
            &vantare_domain::delta::project(&photo, Preferences::default()),
        );
        let painted = observe(|draw| paint_sector_text(&details, 0, kit, draw));
        assert_eq!(painted[1].value, "-0.100");
    });
}

#[test]
fn retained_frames_share_storage_and_a_new_photo_preserves_the_old_frame() {
    let prefs = Preferences::default();
    let mut photo = photo(500.0, 1000.0);
    let mut widget = Widget::new(&Settings::default(), prefs);
    widget.ingest(&photo, prefs);
    let history = Arc::clone(&widget.history);
    let details = Arc::clone(&widget.details);
    let first = widget.frame(prefs, false).0;
    let second = widget.frame(prefs, false).0;
    assert_eq!(
        Arc::strong_count(&history),
        4,
        "dos closures retienen la misma historia, sin copias profundas"
    );
    assert_eq!(
        Arc::strong_count(&details),
        4,
        "el texto tampoco se clona por repintado"
    );
    photo.sequence += 1;
    photo.state.session.track_length_m = Reliable(2000.0);
    widget.ingest(&photo, prefs);
    assert!(!Arc::ptr_eq(&history, &widget.history));
    assert!(!Arc::ptr_eq(&details, &widget.details));
    with_kit(SIZE.0, Language::Es, |kit| {
        let old = observe(|draw| paint_heading(&details, kit, draw));
        let next = observe(|draw| paint_heading(&widget.details, kit, draw));
        assert!(old.iter().any(|label| label.value.ends_with("50 %")));
        assert!(next.iter().any(|label| label.value.ends_with("25 %")));
    });
    drop((first, second));
}
