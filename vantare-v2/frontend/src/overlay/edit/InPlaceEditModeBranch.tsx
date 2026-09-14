import type { ProfileDocumentV3 } from "../core/profile-document";
import type { TelemetryRateCoordinator } from "../core/telemetry-rate-coordinator";
import { I18nProvider } from "../../i18n/I18nProvider";
import { LicenseProvider, useLicense } from "../../lib/license";
import type { StudioPolicy } from "../../hub/overlay-studio/access/studio-access";
import { InPlaceEditOverlay } from "./InPlaceEditOverlay";
import type { RaceScheduleStore } from "../core/race-schedule-store";

export type InPlaceEditModeBranchProps = {
  document: ProfileDocumentV3;
  revision: string;
  layoutOrigin?: { x: number; y: number };
  telemetry: TelemetryRateCoordinator;
  policy: StudioPolicy;
  raceSchedule?: RaceScheduleStore;
};

/**
 * Rama de edicion in-place del overlay: monta los providers de idioma y
 * licencia que la ventana del overlay no tenia e inyecta la política nativa
 * de widgets que resuelve la raíz Desktop. El idioma se hereda de
 * localStorage["vantare.locale"] (mismo origin que el Hub). Mientras la
 * licencia carga, el editor recibe licenseLoading para deshabilitar las
 * secciones de propiedades sin bloquear el drag de layout.
 */
export function InPlaceEditModeBranch(props: InPlaceEditModeBranchProps): React.ReactElement {
  const { document, revision, layoutOrigin, telemetry, policy, raceSchedule } = props;
  return (
    <LicenseProvider>
      <I18nProvider>
        <PolicyEditor
          document={document}
          revision={revision}
          layoutOrigin={layoutOrigin}
          telemetry={telemetry}
          policy={policy}
          raceSchedule={raceSchedule}
        />
      </I18nProvider>
    </LicenseProvider>
  );
}

function PolicyEditor(props: InPlaceEditModeBranchProps): React.ReactElement {
  const { loading } = useLicense();
  return (
    <InPlaceEditOverlay
      document={props.document}
      revision={props.revision}
      layoutOrigin={props.layoutOrigin}
      telemetry={props.telemetry}
      raceSchedule={props.raceSchedule}
      policy={props.policy}
      licenseLoading={loading}
    />
  );
}
