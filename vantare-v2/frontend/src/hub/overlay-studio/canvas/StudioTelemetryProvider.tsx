import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { buildMockTelemetry } from "../../../overlay/core/mock-scenarios";
import { createTelemetryStore, type TelemetryStore } from "../../../overlay/core/telemetry-store";
import type { TelemetrySnapshot } from "../../../overlay/core/telemetry-snapshot";
import { useStudioPreview } from "../state/studio-store";

type StudioTelemetryContextValue = {
  store: TelemetryStore;
};

const StudioTelemetryContext = createContext<StudioTelemetryContextValue | null>(null);

export type StudioTelemetryProviderProps = {
  mockStore: TelemetryStore;
  liveStore: TelemetryStore;
  liveAvailable: boolean;
  children: ReactNode;
};

export function StudioTelemetryProvider(props: StudioTelemetryProviderProps): React.ReactElement {
  const { preview } = useStudioPreview();
  const store = useMemo(() => {
    if (preview.source === "live" && props.liveAvailable) {
      return props.liveStore;
    }
    return props.mockStore;
  }, [preview.source, props.liveAvailable, props.liveStore, props.mockStore]);

  const value = useMemo<StudioTelemetryContextValue>(() => ({ store }), [store]);

  return (
    <StudioTelemetryContext.Provider value={value}>{props.children}</StudioTelemetryContext.Provider>
  );
}

export function useStudioTelemetrySnapshot(): TelemetrySnapshot {
  const context = useContext(StudioTelemetryContext);
  if (!context) {
    throw new Error("useStudioTelemetrySnapshot must be used inside StudioTelemetryProvider");
  }

  const { store } = context;
  const [snapshot, setSnapshot] = useState(() => store.getSnapshot());

  useEffect(() => {
    setSnapshot(store.getSnapshot());
    return store.subscribe(() => {
      setSnapshot(store.getSnapshot());
    });
  }, [store]);

  return snapshot;
}

export function ConnectedStudioTelemetryProvider(props: {
  liveStore?: TelemetryStore;
  liveAvailable?: boolean;
  children: ReactNode;
}): React.ReactElement {
  const { preview } = useStudioPreview();
  const mockStoreRef = useRef(
    createTelemetryStore(
      buildMockTelemetry({
        session: preview.mockSession,
        location: preview.mockLocation,
        state: "ready",
      }),
    ),
  );
  const fallbackLiveStoreRef = useRef(mockStoreRef.current);

  useEffect(() => {
    mockStoreRef.current.publish(
      buildMockTelemetry({
        session: preview.mockSession,
        location: preview.mockLocation,
        state: "ready",
      }),
    );
  }, [preview.mockLocation, preview.mockSession]);

  return (
    <StudioTelemetryProvider
      mockStore={mockStoreRef.current}
      liveStore={props.liveStore ?? fallbackLiveStoreRef.current}
      liveAvailable={props.liveAvailable ?? false}
    >
      {props.children}
    </StudioTelemetryProvider>
  );
}