use std::alloc::{GlobalAlloc, Layout, System};
use std::cell::Cell;
use vantare_domain::{Car, CarId, Player, Quality, Snapshot};
use vantare_runtime::flows::SessionTracker;

thread_local! {
    static TRACK: Cell<bool> = const { Cell::new(false) };
    static ALLOCATIONS: Cell<usize> = const { Cell::new(0) };
}
struct Measured;
fn record() {
    if TRACK.try_with(Cell::get).unwrap_or(false) {
        ALLOCATIONS.with(|count| count.set(count.get() + 1));
    }
}
// Delegates allocation and deallocation to the same system allocator.
unsafe impl GlobalAlloc for Measured {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        record();
        unsafe { System.alloc(layout) }
    }
    unsafe fn alloc_zeroed(&self, layout: Layout) -> *mut u8 {
        record();
        unsafe { System.alloc_zeroed(layout) }
    }
    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
        unsafe { System.dealloc(ptr, layout) }
    }
    unsafe fn realloc(&self, ptr: *mut u8, layout: Layout, size: usize) -> *mut u8 {
        record();
        unsafe { System.realloc(ptr, layout, size) }
    }
}
#[global_allocator]
static ALLOCATOR: Measured = Measured;

#[test]
fn unchanged_session_photos_allocate_nothing_after_open() {
    let mut frame = Snapshot::default();
    frame.state.player = Some(Player {
        car: CarId(7),
        ..Player::default()
    });
    frame.state.cars.push(Car {
        id: CarId(7),
        laps: Quality::Reliable(0),
        ..Car::default()
    });
    let mut tracker = SessionTracker::default();
    drop(tracker.observe(&frame, 100));
    ALLOCATIONS.with(|count| count.set(0));
    TRACK.with(|enabled| enabled.set(true));
    for wall in 101..10_000 {
        drop(tracker.observe(&frame, wall));
    }
    TRACK.with(|enabled| enabled.set(false));
    assert_eq!(ALLOCATIONS.with(Cell::get), 0);
}
