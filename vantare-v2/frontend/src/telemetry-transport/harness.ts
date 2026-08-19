import {
  eventName,
  type FactEnvelope,
  type JSONObject,
  type ProductID,
  type ProjectionEnvelope,
  type StatusEnvelope,
} from "./contracts";
import {
  createProjectionTransportStore,
  type ProjectionState,
  type ProjectionTransportStore,
} from "./store";

export type TelemetryTransportHarness = {
  store: ProjectionTransportStore;
  status(state?: StatusEnvelope["payload"]["state"]): void;
  full(payload: JSONObject, sequence?: number): void;
  gap(payload: JSONObject): void;
  fact(payload: JSONObject, factSequence?: number): void;
  reconnect(): void;
  snapshot(): ProjectionState;
};

export function createTelemetryTransportHarness(
  product: ProductID,
): TelemetryTransportHarness {
  const store = createProjectionTransportStore(product);
  let statusRevision = 0;
  const epoch = 1;
  let sequence = 0;
  let factSequence = 0;
  const capturedAt = "2026-07-30T00:00:00Z";
  let retainedStatus: StatusEnvelope | undefined;
  let retainedFull: ProjectionEnvelope | undefined;

  return {
    store,
    status(state = "live") {
      statusRevision += 1;
      retainedStatus = {
        product,
        statusRevision,
        capturedAt,
        payload: { state, reconnectAttempt: 0 },
      };
      store.ingest(eventName(product, "status"), retainedStatus);
    },
    full(payload, requestedSequence) {
      sequence = requestedSequence ?? sequence + 1;
      retainedFull = projection(product, "full", epoch, sequence, statusRevision, payload);
      store.ingest(eventName(product, "projection"), retainedFull);
    },
    gap(payload) {
      sequence += 2;
      retainedFull = projection(product, "full", epoch, sequence, statusRevision, payload);
      store.ingest(eventName(product, "projection"), retainedFull);
    },
    fact(payload, requestedFactSequence) {
      factSequence = requestedFactSequence ?? factSequence + 1;
      const fact: FactEnvelope = {
        product,
        projectionVersion: 1,
        epoch,
        sequence: Math.max(sequence, 1),
        factSequence,
        capturedAt,
        statusRevision,
        payload,
      };
      store.ingest(eventName(product, "fact"), fact);
    },
    reconnect() {
      store.reconnect();
      if (retainedStatus) {
        store.ingest(eventName(product, "status"), retainedStatus);
      }
      if (retainedFull) {
        store.ingest(eventName(product, "projection"), retainedFull);
      }
    },
    snapshot() {
      return store.getSnapshot();
    },
  };
}

function projection(
  product: ProductID,
  kind: ProjectionEnvelope["kind"],
  epoch: number,
  sequence: number,
  statusRevision: number,
  payload: JSONObject,
): ProjectionEnvelope {
  return {
    product,
    projectionVersion: 1,
    epoch,
    sequence,
    kind,
    capturedAt: "2026-07-30T00:00:00Z",
    statusRevision,
    payload,
  };
}
