//! Oráculos de ui/src/standings/motion.rs:27–53,235–241,509–587,693–830.
use super::*;
use crate::widget::Widget;
use super::super::{control::Eficiencia, paint_tests};
use vantare_domain::{format::Preferences, widget_settings::standings::Settings};

fn plan() -> ContentPlan {
    let mut p = (*paint_tests::visual().content_plan).clone();
    p.status = Status::Ready;
    p.identity = "sesión:época".into();
    p.sequence = 10;
    p.rows.truncate(3);
    p
}
fn close(a: f32, b: f32) { assert!((a-b).abs() < 0.0001, "{a} != {b}"); }
fn gpui_bezier([x1,y1,x2,y2]: [f32;4], x: f32) -> f32 {
    if x <= 0.0 { return 0.0; }
    if x >= 1.0 { return 1.0; }
    let axis = |a,b,t:f32| { let u=1.0-t; 3.0*u*u*t*a+3.0*u*t*t*b+t*t*t };
    let (mut lo, mut hi)=(0.0,1.0);
    for _ in 0..30 {
        let mid=f32::midpoint(lo,hi);
        if axis(x1,x2,mid)<x {lo=mid;} else {hi=mid;}
    }
    axis(y1,y2,f32::midpoint(lo,hi))
}
#[test]
fn shared_tween_matches_gpui_bisection_and_retargets_without_a_jump() {
    for curve in [[0.25,0.1,0.25,1.0],[0.0,0.0,0.58,1.0],[0.22,0.9,0.3,1.0]] {
        let mut t=Tween::fixed(0.0).with_curve(curve);
        t.retarget(1.0,0.0,1.0);
        for x in [0.0,0.001,0.1,0.25,0.5,0.75,0.999,1.0] {
            assert!((t.value(f64::from(x))-gpui_bezier(curve,x)).abs()<0.000002);
        }
        let before=t.value(0.5);
        t.retarget(0.0,0.5,1.0);
        close(t.value(0.5),before);
    }
    // Inventario decía ≈0,93; la curva literal de GPUI da 0,94859246.
    close(gpui_bezier([0.22,0.9,0.3,1.0],0.5),0.94859246);
}
#[test]
fn seed_missing_stale_and_new_identity_do_not_arm_a_clock() {
    let mut p=plan(); let id=p.rows[0].id;
    let mut m=Motion::default();
    m.update(&p,3,0.0);
    assert!(m.seeded);
    assert_eq!(m.frame_shared(0.0).row(id),Pose::default());
    assert_eq!(m.wake(0.0),Wake::Idle);
    p.rows.swap(0,1); m.update(&p,3,0.1);
    assert_eq!(m.wake(0.1),Wake::Frame);
    p.identity="otra sesión".into(); m.update(&p,3,0.11);
    assert_eq!(m.frame_shared(0.11).row(id),Pose::default());
    assert_eq!(m.wake(0.11),Wake::Idle);
    for status in [Status::Missing,Status::Disconnected,Status::Stale] {
        p.status=status; m.update(&p,3,0.2);
        assert!(m.prev.is_none());
        assert_eq!(m.wake(0.2),Wake::Idle);
    }
}
#[test]
fn continuity_is_the_literal_gpui_contract_including_backwards_sequence() {
    let p=plan(); let mut q=p.clone();
    assert!(motion_continues(&p,&q));
    q.sequence+=1; assert!(motion_continues(&p,&q));
    q.sequence=9; assert!(!motion_continues(&p,&q));
    let mut m=Motion::default(); m.update(&p,3,0.0);
    q.rows.swap(0,1); m.update(&q,3,0.1);
    assert_eq!(m.wake(0.1),Wake::Idle,"foto atrasada resiembra sin animar");
    q=p.clone(); q.identity.push('x'); assert!(!motion_continues(&p,&q));
    q=p.clone(); q.status=Status::Missing; assert!(!motion_continues(&p,&q));
    q=p.clone(); Arc::make_mut(&mut q.board).session_label.push('x');
    assert!(!motion_continues(&p,&q));
}
#[test]
fn thirty_pixel_flip_is_313_ms_and_carries_the_live_offset() {
    let mut p=plan(); let id=p.rows[0].id;
    let mut m=Motion::default(); m.update(&p,3,0.0);
    p.rows.swap(0,1); p.sequence+=1; m.update(&p,3,1.0);
    close(m.flips[&id].end() as f32,1.313);
    close(m.frame_shared(1.0).row(id).offset,-30.0);
    close(m.frame_shared(1.1565).row(id).offset,-30.0*(1.0-0.94859246));
    let old_top=30.0+m.frame_shared(1.1).row(id).offset;
    p.rows.swap(0,1); p.sequence+=1; m.update(&p,3,1.1);
    close(m.frame_shared(1.1).row(id).offset,old_top);
    m.frame_shared(2.0);
    assert_eq!(m.wake(2.0),Wake::Idle);
    assert!(m.next_wake(2.0,60).is_none());
}
#[test]
fn flip_duration_caps_at_460_ms_and_ignores_sub_half_pixel_offsets() {
    let p=plan(); let id=p.rows[0].id;
    let mut m=Motion::default(); m.update(&p,3,0.0);
    m.tops.insert(id,400.0); m.update(&p,3,1.0);
    close(m.flips[&id].end() as f32,1.460);
    m.frame_shared(2.0); m.tops.insert(id,0.49); m.update(&p,3,2.0);
    assert!(!m.flips.contains_key(&id));
    m.tops.insert(id,0.5); m.update(&p,3,3.0);
    close(m.flips[&id].end() as f32,3.280); // GPUI trunca los ms a u64.
}
#[test]
fn presence_fades_in_and_out_in_200_ms_and_reuses_ghost_top_and_alpha() {
    let full=plan(); let id=full.rows[1].id;
    let mut p=full.clone(); p.rows.remove(1);
    let mut m=Motion::default(); m.update(&p,2,0.0);
    m.update(&full,3,1.0);
    close(m.frame_shared(1.0).row(id).alpha,0.0);
    close(m.frame_shared(1.2).row(id).alpha,1.0);
    m.update(&p,2,2.0);
    let f=m.frame_shared(2.0); assert_eq!(f.ghosts.len(),1);
    close(f.ghosts[0].top,30.0); close(f.ghosts[0].pose.alpha,1.0);
    let alpha=m.frame_shared(2.1).ghosts[0].pose.alpha;
    close(alpha,1.0-gpui_bezier([0.0,0.0,0.58,1.0],0.5));
    m.update(&full,3,2.1);
    let f=m.frame_shared(2.1); assert!(f.ghosts.is_empty()); close(f.row(id).alpha,alpha);
    close(m.frame_shared(2.3).row(id).alpha,1.0);
    m.update(&p,2,3.0);
    assert_eq!(m.wake(3.0),Wake::Frame);
    assert!(m.frame_shared(3.2).ghosts.is_empty());
    assert_eq!(m.wake(3.2),Wake::Idle);
    assert!(m.next_wake(3.2,60).is_none());
}
#[test]
fn ghost_keeps_the_in_flight_absolute_top_and_idle_frames_share_the_arc() {
    let mut p=plan(); let id=p.rows[0].id;
    let mut m=Motion::default(); m.update(&p,3,0.0);
    let a=m.frame_shared(0.0); let b=m.frame_shared(0.1); assert!(Arc::ptr_eq(&a,&b));
    p.rows.swap(0,1); m.update(&p,3,1.0);
    let top=30.0+m.frame_shared(1.1).row(id).offset;
    p.rows.remove(1); m.update(&p,2,1.1);
    close(m.frame_shared(1.1).ghosts[0].top,top);
    m.frame_shared(2.0);
    assert!(Arc::ptr_eq(&m.frame_shared(2.0),&m.frame_shared(3.0)));
}
#[test]
fn controller_reduced_motion_and_identical_photos_have_no_clock_or_rebuild() {
    let settings=Settings::eficiencia();
    let mut w=Eficiencia::new(&settings,Preferences::default());
    let photo=vantare_ipc::snapshot_from_json(include_str!("../../../../ui/fixtures/standings.snapshot.json")).unwrap();
    w.policy(true,60,0.0); w.update(&photo,0.0);
    assert!(!w.animate(0.1).build);
    assert!(w.motion.next_wake(0.1,60).is_none());
    assert!(!w.update(&photo,0.2).build);
    assert_eq!(*w.visual.frame,Frame::default());
}
#[test]
fn animated_rows_and_ghosts_stay_inside_the_window() {
    use vantare_domain::format::Language;
    for broadcast in [false,true] {
        let mut v=paint_tests::visual();
        Arc::make_mut(&mut v.config).broadcast=broadcast;
        let mut p=(*v.content_plan).clone(); p.status=Status::Ready;
        p.rows.truncate(3); v.ingest(Arc::new(p.clone()));
        let mut m=Motion::default(); m.update(&p,3,0.0);
        p.rows.swap(0,1); p.rows.remove(2); v.ingest(Arc::new(p.clone())); m.update(&p,2,1.0);
        for clock in [1.0,1.05,1.1,1.2,1.313] {
            v.frame=m.frame_shared(clock);
            let clone=v.clone_for_motion_test();
            let size=clone.size(); let mut rt=paint_tests::paint(clone,Language::Es);
            crate::testdata::assert_inside_window(&mut rt,size);
            let elements=rt.elements();
            assert!(elements.iter().any(|e| e.key.as_deref()==Some(&format!("efficiency-row-{}",p.rows[0].id.0))));
        }
    }
}
