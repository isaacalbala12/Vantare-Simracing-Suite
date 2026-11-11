import { windowText } from "../i18n/window.es";
import { Callout } from "../ui/Data";
import { TitleBar } from "../ui/Frame";
import { SectionChromeProvider } from "./SectionChrome";
import { WindowControls } from "./WindowControls";
export function HostIssue({ issue }: { issue: string }) {
  return (
    <SectionChromeProvider>
      <div className="v-host-issue">
        <TitleBar
          title={windowText.title}
          status=""
          controls={<WindowControls restricted />}
        />
        <main>
          <Callout title={issue} tone="err" />
        </main>
      </div>
    </SectionChromeProvider>
  );
}
