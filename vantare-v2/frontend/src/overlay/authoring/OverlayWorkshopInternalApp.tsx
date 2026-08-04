import { AppRuntime } from "../../AppShell";
import { OverlayWorkshopAccessRoute } from "./OverlayWorkshopDevRoute";

/**
 * This module is dynamically imported only by development and approved
 * internal builds. Keeping its route literal outside AppShell makes Stable
 * physically unable to contain or route to Workshop.
 */
export function OverlayWorkshopInternalApp(): React.ReactElement {
  if (window.location.pathname === "/workshop") {
    return (
      <AppRuntime>
        <OverlayWorkshopAccessRoute />
      </AppRuntime>
    );
  }
  return <AppRuntime />;
}
