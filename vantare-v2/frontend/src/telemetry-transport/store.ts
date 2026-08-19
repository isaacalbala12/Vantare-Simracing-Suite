import {
  decodeTransportEvent,
  type FactEnvelope,
  type JSONObject,
  type ProductID,
  type ProjectionEnvelope,
  type StatusEnvelope,
  TransportContractError,
} from "./contracts";

export type DiagnosticCode =
  | "status-gap"
  | "status-advanced"
  | "snapshot-resync"
  | "snapshot-regression"
  | "fact-gap"
  | "fact-regression"
  | "reconnect"
  | "disposed";

export type TransportDiagnostic = {
  code: DiagnosticCode;
  product: ProductID;
  epoch?: number;
  sequence?: number;
  factSequence?: number;
  statusRevision?: number;
};

export type ProjectionState = {
  product: ProductID;
  status?: StatusEnvelope;
  snapshot?: ProjectionEnvelope & { payload: JSONObject };
  facts: readonly FactEnvelope[];
  needsFactResync: boolean;
  diagnostics: readonly TransportDiagnostic[];
};

export type ProjectionTransportStore = {
  getSnapshot(): ProjectionState;
  subscribe(listener: () => void): () => void;
  ingest(name: string, data: unknown): void;
  reconnect(): void;
  resetFacts(after?: number): void;
  dispose(): void;
};

const MAX_DIAGNOSTICS = 64;
const MAX_FACTS = 256;

export function createProjectionTransportStore(
  product: ProductID,
): ProjectionTransportStore {
  let state: ProjectionState = freezeState(initialState(product));
  let disposed = false;
  let factCursor = 0;
  let lastSnapshot: ProjectionState["snapshot"];
  const listeners = new Set<() => void>();

  function publish(next: ProjectionState): void {
    state = freezeState(next);
    for (const listener of listeners) {
      listener();
    }
  }

  function addDiagnostic(
    current: ProjectionState,
    diagnostic: TransportDiagnostic,
  ): ProjectionState {
    return {
      ...current,
      diagnostics: [...current.diagnostics, diagnostic].slice(-MAX_DIAGNOSTICS),
    };
  }

  function applyStatus(status: StatusEnvelope): void {
    const current = state.status;
    if (current && status.statusRevision < current.statusRevision) {
      throw contractFailure("status-gap");
    }
    if (current && status.statusRevision === current.statusRevision) {
      if (!semanticEqual(status, current)) {
        throw contractFailure("status-gap");
      }
      return;
    }
    if (current && status.statusRevision !== current.statusRevision + 1) {
      throw contractFailure("status-gap");
    }
    let next: ProjectionState = { ...state, status };
    if (
      state.snapshot &&
      state.snapshot.statusRevision !== status.statusRevision
    ) {
      next = addDiagnostic(
        { ...next, snapshot: undefined },
        {
          code: "status-advanced",
          product,
          statusRevision: status.statusRevision,
        },
      );
    }
    publish(next);
  }

  function applyProjection(frame: ProjectionEnvelope): void {
    if (!state.status || frame.statusRevision !== state.status.statusRevision) {
      throw contractFailure("status-gap");
    }
    const previous = lastSnapshot;
    if (!previous) {
      lastSnapshot = frame;
      publish({
        ...state,
        snapshot: lastSnapshot,
      });
      return;
    }
    if (frame.epoch < previous.epoch) {
      throw contractFailure("snapshot-regression");
    }
    if (
      frame.epoch === previous.epoch &&
      frame.sequence === previous.sequence
    ) {
      if (
        frame.projectionVersion !== previous.projectionVersion ||
        frame.capturedAt !== previous.capturedAt ||
        !semanticEqual(frame.payload, previous.payload)
      ) {
        throw contractFailure("snapshot-regression");
      }
      if (frame.statusRevision !== previous.statusRevision) {
        lastSnapshot = frame;
        publish({ ...state, snapshot: lastSnapshot });
      }
      return;
    }
    if (
      frame.epoch === previous.epoch &&
      frame.sequence < previous.sequence
    ) {
      throw contractFailure("snapshot-regression");
    }
    const epochChanged = frame.epoch > previous.epoch;
    if (epochChanged && frame.sequence !== 1) {
      throw contractFailure("snapshot-regression");
    }
    const contiguous =
      !epochChanged && frame.sequence === previous.sequence + 1;
    lastSnapshot = frame;
    let next: ProjectionState = { ...state, snapshot: lastSnapshot };
    if (!epochChanged && !contiguous) {
      next = addDiagnostic(next, {
        code: "snapshot-resync",
        product,
        epoch: frame.epoch,
        sequence: frame.sequence,
      });
    }
    publish(next);
  }

  function applyFact(fact: FactEnvelope): void {
    if (!state.status || fact.statusRevision !== state.status.statusRevision) {
      throw contractFailure("status-gap");
    }
    if (fact.factSequence <= factCursor) {
      throw contractFailure("fact-regression");
    }
    if (fact.factSequence !== factCursor + 1) {
      publish(
        addDiagnostic(
          { ...state, needsFactResync: true },
          {
            code: "fact-gap",
            product,
            factSequence: fact.factSequence,
          },
        ),
      );
      throw contractFailure("fact-gap");
    }
    factCursor = fact.factSequence;
    publish({
      ...state,
      facts: [...state.facts, fact].slice(-MAX_FACTS),
      needsFactResync: false,
    });
  }

  return {
    getSnapshot() {
      return state;
    },
    subscribe(listener) {
      if (disposed) {
        throw contractFailure("disposed");
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    ingest(name, data) {
      if (disposed) {
        throw contractFailure("disposed");
      }
      const event = decodeTransportEvent(name, data);
      if (event.value.product !== product) {
        throw new TransportContractError("event-name");
      }
      if (event.kind === "status") {
        applyStatus(event.value);
      } else if (event.kind === "projection") {
        applyProjection(event.value);
      } else {
        applyFact(event.value);
      }
    },
    reconnect() {
      if (disposed) {
        throw contractFailure("disposed");
      }
      publish(
        addDiagnostic(state, {
          code: "reconnect",
          product,
          statusRevision: state.status?.statusRevision,
        }),
      );
    },
    resetFacts(after = 0) {
      if (!Number.isSafeInteger(after) || after < 0) {
        throw contractFailure("fact-regression");
      }
      factCursor = after;
      publish({ ...state, facts: [], needsFactResync: false });
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      listeners.clear();
      state = freezeState(
        addDiagnostic(state, { code: "disposed", product }),
      );
    },
  };
}

function initialState(product: ProductID): ProjectionState {
  return {
    product,
    facts: [],
    needsFactResync: false,
    diagnostics: [],
  };
}

function freezeState(state: ProjectionState): ProjectionState {
  return deepFreeze(state);
}

function deepFreeze<T>(value: T): T {
  if (
    value === null ||
    typeof value !== "object" ||
    Object.isFrozen(value)
  ) {
    return value;
  }
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}

function semanticEqual(left: unknown, right: unknown): boolean {
  return stableJSON(left) === stableJSON(right);
}

function stableJSON(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJSON).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJSON(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function contractFailure(code: DiagnosticCode): Error {
  return new Error(`telemetry-transport:${code}`);
}
