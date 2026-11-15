//! Exported executable vectors: the Electron gesture tests consume this exact data.
use super::*;
use serde_json::{Value, json};

pub fn vectors() -> Value {
    let snap_cases = [
        (
            (50.0, 200.0),
            (100.0, 100.0),
            (1000.0, 800.0),
            vec![(-3.0, 500.0, 100.0, 100.0)],
            8.0,
        ),
        ((496.0, 398.0), (200.0, 100.0), (1000.0, 800.0), vec![], 8.0),
        ((492.0, 200.0), (200.0, 100.0), (1000.0, 800.0), vec![], 8.0),
        (
            (154.0, 160.0),
            (100.0, 100.0),
            (1000.0, 800.0),
            vec![(105.0, 500.0, 100.0, 100.0)],
            8.0,
        ),
        (
            (-20.0, 2000.0),
            (300.0, 200.0),
            (1920.0, 1080.0),
            vec![],
            0.0,
        ),
        ((40.0, 40.0), (300.0, 200.0), (64.0, 64.0), vec![], 8.0),
        (
            (963.0, 300.0),
            (200.0, 100.0),
            (1920.0, 1080.0),
            vec![],
            7.0,
        ),
        (
            (1104.0, 700.0),
            (200.0, 100.0),
            (1920.0, 1080.0),
            vec![(1000.0, 500.0, 300.0, 100.0)],
            7.0,
        ),
    ];
    let snaps:Vec<_>=snap_cases.into_iter().map(|(center,size,canvas,others,threshold)|{
        json!({"center":center,"size":size,"canvas":canvas,"others":others,"threshold":threshold,
               "expected":snap(center,size,canvas,&others,threshold)})
    }).collect();
    let mut resizes = vec![];
    for handle in [
        (-1, -1),
        (0, -1),
        (1, -1),
        (1, 0),
        (1, 1),
        (0, 1),
        (-1, 1),
        (-1, 0),
    ] {
        for locked in [false, true] {
            for delta in [
                (35.0, 22.0),
                (-100_000.0, -100_000.0),
                (100_000.0, 100_000.0),
            ] {
                let start = (48.0, 62.0);
                let size = (338.0, 364.0);
                resizes.push(
                    json!({"start":start,"size":size,"handle":handle,"delta":delta,"locked":locked,
                                   "expected":resize(start,size,handle,delta,locked)}),
                );
            }
        }
    }
    for size in [(100_000.0, 1.0), (1.0, 100_000.0)] {
        resizes.push(
            json!({"start":[0.0,0.0],"size":size,"handle":[1,1],"delta":[10.0,10.0],"locked":true,
            "expected":resize((0.0,0.0),size,(1,1),(10.0,10.0),true)}),
        );
    }
    let anchors: Vec<_> = (0..3)
        .flat_map(|column| {
            (0..3).map(move |row| {
                json!({"size":[300.0,200.0],"canvas":[1920.0,1080.0],"column":column,"row":row,
               "expected":anchor((300.0,200.0),(1920.0,1080.0),column,row)})
            })
        })
        .collect();
    let nudges:Vec<_>=[0,299,300,330,900,1800,1830,3_600_000].into_iter().flat_map(|elapsed_ms|[false,true].map(move |shift|{
        json!({"elapsedMs":elapsed_ms,"shift":shift,"expected":held_nudge_distance(elapsed_ms,shift)})
    })).collect();
    let nudge_cases:Vec<_>=[((0.0,0.0),(-1,1),false),((0.0,0.0),(1,-1),true),((100_000.0,-100_000.0),(1,-1),true)].into_iter().map(|(position,direction,shift)|json!({"position":position,"direction":direction,"shift":shift,"expected":nudge(position,direction,shift)})).collect();
    let free:Vec<_>=[((1920.0,1080.0),(300.0,200.0),vec![]),((1920.0,1080.0),(300.0,200.0),vec![(0.0,0.0,1920.0,1080.0)]),((64.0,64.0),(100.0,36.0),vec![])].into_iter().map(|(canvas,size,taken)|json!({"canvas":canvas,"size":size,"taken":taken,"expected":free_spot(canvas,size,&taken)})).collect();
    json!({"snap":snaps,"resize":resizes,"anchor":anchors,"heldNudge":nudges,"nudge":nudge_cases,
           "fit":[{"viewport":[960.0,540.0],"canvas":[1920.0,1080.0],"expected":fit((960.0,540.0),(1920.0,1080.0))}],
           "previewOrigin":[{"viewport":[1000.0,800.0],"canvas":[1920.0,1080.0],"scale":0.5,"expected":preview_origin((1000.0,800.0),(1920.0,1080.0),0.5)}],
           "freeSpot":free})
}
