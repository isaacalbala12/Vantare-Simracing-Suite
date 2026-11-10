//! Transparent root wrapper, diagnostic builds only. The gap between the
//! root's `request_layout` and prepaint includes GPUI's `compute_layout` call.
//! It also includes the small framework work around that call; it is not a
//! function-level CPU profile of Taffy. No layout nodes or identities are added.
use crate::profiling::{self, Stage};
use gpui::{
    App, Bounds, Element, ElementId, GlobalElementId, InspectorElementId, IntoElement, LayoutId,
    Pixels, Window,
};

pub(crate) struct Timed<E>(pub E);

impl<E: Element> IntoElement for Timed<E> {
    type Element = Self;
    fn into_element(self) -> Self {
        self
    }
}

impl<E: Element> Element for Timed<E> {
    type RequestLayoutState = (E::RequestLayoutState, Option<profiling::Span>);
    type PrepaintState = E::PrepaintState;

    fn id(&self) -> Option<ElementId> {
        self.0.id()
    }
    fn source_location(&self) -> Option<&'static std::panic::Location<'static>> {
        self.0.source_location()
    }
    fn request_layout(
        &mut self,
        id: Option<&GlobalElementId>,
        inspector: Option<&InspectorElementId>,
        window: &mut Window,
        cx: &mut App,
    ) -> (LayoutId, Self::RequestLayoutState) {
        let span = profiling::begin(Stage::GpuiLayoutRequest);
        let (layout, state) = self.0.request_layout(id, inspector, window, cx);
        drop(span);
        (layout, (state, profiling::begin(Stage::GpuiLayoutCompute)))
    }
    fn prepaint(
        &mut self,
        id: Option<&GlobalElementId>,
        inspector: Option<&InspectorElementId>,
        bounds: Bounds<Pixels>,
        state: &mut Self::RequestLayoutState,
        window: &mut Window,
        cx: &mut App,
    ) -> Self::PrepaintState {
        drop(state.1.take());
        let _span = profiling::begin(Stage::GpuiPrepaint);
        self.0
            .prepaint(id, inspector, bounds, &mut state.0, window, cx)
    }
    fn paint(
        &mut self,
        id: Option<&GlobalElementId>,
        inspector: Option<&InspectorElementId>,
        bounds: Bounds<Pixels>,
        state: &mut Self::RequestLayoutState,
        prepaint: &mut Self::PrepaintState,
        window: &mut Window,
        cx: &mut App,
    ) {
        let _span = profiling::begin(Stage::GpuiPaint);
        self.0
            .paint(id, inspector, bounds, &mut state.0, prepaint, window, cx);
    }
}
