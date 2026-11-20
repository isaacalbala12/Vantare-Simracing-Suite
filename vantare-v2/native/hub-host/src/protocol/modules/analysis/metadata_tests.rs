use super::valid_sectors;

const LAP: u32 = 138_000;

#[test]
fn three_positive_sectors_that_add_up_are_kept() {
    let sectors = [41_204, 62_188, 34_608];
    assert_eq!(
        valid_sectors(Some(LAP), Some(&sectors)),
        Some(sectors.to_vec())
    );
}

#[test]
fn any_other_number_of_sectors_means_no_sectors() {
    for sectors in [
        &[][..],
        &[LAP],
        &[69_000, 69_000],
        &[34_500, 34_500, 34_500, 34_500],
        &[1; 16],
    ] {
        assert_eq!(valid_sectors(Some(LAP), Some(sectors)), None, "{sectors:?}");
    }
}

#[test]
fn a_zero_sector_means_no_sectors_even_if_the_sum_matches() {
    for sectors in [[0, 62_188, 75_812], [41_204, 0, 96_796], [41_204, 62_188, 0]] {
        assert_eq!(valid_sectors(Some(LAP), Some(&sectors)), None);
    }
}

#[test]
fn the_sum_may_differ_from_the_lap_time_by_rounding_only() {
    // Tres redondeos de sector y el de la vuelta: como mucho 2 ms.
    for (sum, kept) in [
        (LAP - 3, false),
        (LAP - 2, true),
        (LAP, true),
        (LAP + 2, true),
        (LAP + 3, false),
        (LAP + 1_000, false),
    ] {
        let sectors = [40_000, 60_000, sum - 100_000];
        assert_eq!(
            valid_sectors(Some(LAP), Some(&sectors)).is_some(),
            kept,
            "{sum}"
        );
    }
}

#[test]
fn sectors_without_an_official_lap_time_are_not_shown() {
    assert_eq!(valid_sectors(None, Some(&[41_204, 62_188, 34_608])), None);
    assert_eq!(valid_sectors(Some(LAP), None), None);
}

#[test]
fn huge_values_cannot_overflow_the_sum() {
    // 3 × u32::MAX con aritmética de 32 bits daría justo este tiempo de vuelta.
    assert_eq!(
        valid_sectors(Some(u32::MAX - 2), Some(&[u32::MAX; 3])),
        None
    );
}
