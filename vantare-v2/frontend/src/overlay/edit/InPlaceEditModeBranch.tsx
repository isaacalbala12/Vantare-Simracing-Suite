import type { ReactNode } from "react";
import type { ProfileDocumentV3 } from "../core/profile-document";
import { I18nProvider } from "../../i18n/I18nProvider";
import { LicenseProvider } from "../../lib/license";

export type InPlaceEditModeBranchProps = {
  document: ProfileDocumentV3 | null;
  revision: string;
  layoutOrigin?: { x: number; y: number };
  children: ReactNode;
};

/**
 * Rama de edicion in-place del overlay: monta los providers de idioma y
 * licencia que la ventana del overlay no tenia. El idioma se hereda de
 * localStorage["vantare.locale"] (mismo origin que el Hub); la licencia se
 * resuelve por los eventos Wails del puente existente.
 */
export function InPlaceEditModeBranch(_props: InPlaceEditModeBranchProps): React.ReactElement {
  const { children } = _props;
  return (
    <LicenseProvider>
      <I18nProvider>{children}</I18nProvider>
    </LicenseProvider>
  );
}
