import type { MockLocationScenario, MockSessionScenario } from "../../../overlay/core/mock-scenarios";
import type { StudioPreviewState } from "../state/studio-store";

const MOCK_SESSIONS: readonly MockSessionScenario[] = ["practice", "qualifying", "race"];
const MOCK_LOCATIONS: readonly MockLocationScenario[] = ["track", "pits"];

export type PreviewSourceControlsProps = {
  preview: StudioPreviewState;
  liveAvailable: boolean;
  onPreviewChange(patch: Partial<StudioPreviewState>): void;
  onOpenBrowserView?(): void;
};

export function PreviewSourceControls(props: PreviewSourceControlsProps): React.ReactElement {
  const { preview, liveAvailable, onPreviewChange, onOpenBrowserView } = props;
  const liveDisabled = !liveAvailable;

  return (
    <div data-testid="studio-preview-source-controls" className="osv3-preview-source-controls">
      <div className="osv3-preview-source-controls__group" role="radiogroup" aria-label="Fuente de preview">
        <button
          type="button"
          data-testid="studio-preview-source-mock"
          className={preview.source === "mock" ? "is-active" : undefined}
          onClick={() => onPreviewChange({ source: "mock" })}
        >
          Mock
        </button>
        <button
          type="button"
          data-testid="studio-preview-source-live"
          className={preview.source === "live" ? "is-active" : undefined}
          disabled={liveDisabled}
          title={liveDisabled ? "LMU no disponible en este entorno" : undefined}
          onClick={() => onPreviewChange({ source: "live" })}
        >
          Live
        </button>
      </div>
      {liveDisabled ? (
        <p data-testid="studio-preview-live-unavailable" className="osv3-preview-source-controls__hint">
          LMU no disponible en este entorno
        </p>
      ) : null}
      {preview.source === "mock" ? (
        <>
          <select
            data-testid="studio-mock-session-select"
            value={preview.mockSession}
            onChange={(event) =>
              onPreviewChange({ mockSession: event.target.value as MockSessionScenario })
            }
          >
            {MOCK_SESSIONS.map((session) => (
              <option key={session} value={session}>
                {session}
              </option>
            ))}
          </select>
          <select
            data-testid="studio-mock-location-select"
            value={preview.mockLocation}
            onChange={(event) =>
              onPreviewChange({ mockLocation: event.target.value as MockLocationScenario })
            }
          >
            {MOCK_LOCATIONS.map((location) => (
              <option key={location} value={location}>
                {location}
              </option>
            ))}
          </select>
        </>
      ) : null}
      <button
        type="button"
        data-testid="studio-browser-view-button"
        className="osv3-preview-source-controls__browser"
        onClick={() => onOpenBrowserView?.()}
      >
        Browser View
      </button>
    </div>
  );
}