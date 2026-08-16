import type { ProfileDocumentV3 } from "../core/profile-document";
import type { TelemetryRateCoordinator } from "../core/telemetry-rate-coordinator";
import { I18nProvider } from "../../i18n/I18nProvider";
import { LicenseProvider, useLicense } from "../../lib/license";
import { useAccess } from "../../lib/access";
import { InPlaceEditOverlay } from "./InPlaceEditOverlay";

export type InPlaceEditModeBranchProps = {
  document: ProfileDocumentV3;
  revision: string;
  layoutOrigin?: { x: number; y: number };
  telemetry: TelemetryRateCoordinator;
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
  const { document, revision, layoutOrigin, telemetry } = props;
  return (
    <LicenseProvider>
      <I18nProvider>
        <AccessEditor document={document} revision={revision} layoutOrigin={layoutOrigin} telemetry={telemetry} />
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
      access={access}
      licenseLoading={loading}
    />
  );
}
