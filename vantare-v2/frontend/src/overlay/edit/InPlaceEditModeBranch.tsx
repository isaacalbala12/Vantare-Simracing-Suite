import type { ProfileDocumentV3 } from "../core/profile-document";
import type { TelemetryRateCoordinator } from "../core/telemetry-rate-coordinator";
import { I18nProvider } from "../../i18n/I18nProvider";
import { LicenseProvider, useLicense } from "../../lib/license";
import { useAccess } from "../../lib/access";
import { InPlaceEditOverlay } from "./InPlaceEditOverlay";
import type { OverlayV2Feature } from "../telemetry-shadow/overlay-v2-features";
import type { RaceScheduleStore } from "../core/race-schedule-store";

export type InPlaceEditModeBranchProps = {
  document: ProfileDocumentV3;
  revision: string;
  layoutOrigin?: { x: number; y: number };
  telemetry: TelemetryRateCoordinator;
  overlayV2Features?: readonly OverlayV2Feature[];
  raceSchedule?: RaceScheduleStore;
};

/**
 * Rama de edicion in-place del overlay: monta los providers de idioma y
 * licencia que la ventana del overlay no tenia, resuelve el acceso real por
 * plan y lo inyecta en el editor. El idioma se hereda de
 * localStorage["vantare.locale"] (mismo origin que el Hub). Mientras la
 * licencia carga, el editor recibe licenseLoading para deshabilitar las
 * secciones de propiedades sin bloquear el drag de layout.
 */
export function InPlaceEditModeBranch(props: InPlaceEditModeBranchProps): React.ReactElement {
  const { document, revision, layoutOrigin, telemetry, overlayV2Features, raceSchedule } = props;
  return (
    <LicenseProvider>
      <I18nProvider>
        <AccessEditor
          document={document}
          revision={revision}
          layoutOrigin={layoutOrigin}
          telemetry={telemetry}
          overlayV2Features={overlayV2Features}
          raceSchedule={raceSchedule}
        />
      </I18nProvider>
    </LicenseProvider>
  );
}

function AccessEditor(props: InPlaceEditModeBranchProps): React.ReactElement {
  const { loading } = useLicense();
  const access = useAccess();
  return (
    <InPlaceEditOverlay
      document={props.document}
      revision={props.revision}
      layoutOrigin={props.layoutOrigin}
      telemetry={props.telemetry}
      overlayV2Features={props.overlayV2Features}
      raceSchedule={props.raceSchedule}
      access={access}
      licenseLoading={loading}
    />
  );
}
