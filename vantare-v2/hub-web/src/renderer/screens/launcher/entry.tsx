import { SectionChrome, SectionPanel } from "../../app/SectionChrome";
import { launcherText as text } from "../../i18n/launcher";
import { ResidentControlNotice } from "../../ui/launcher/ResidentControlNotice";
import { ResidentInbox } from "../../ui/launcher/ResidentInbox";
import { Applications } from "./Applications";
import { ProfileEditorProvider, useProfileEditorState } from "./editor-state";
import { Launcher } from "./Launcher";
import { LauncherRail } from "./LauncherRail";
import { useResident } from "./resident";
import { useResidentAnswer } from "./resident-answer";
import { useResidentControl } from "./resident-control";
import { useResidentRemoval } from "./resident-removal";
export default function LauncherEntry() {
  return (
    <ProfileEditorProvider>
      <LauncherContent />
    </ProfileEditorProvider>
  );
}
function LauncherContent() {
  const editor = useProfileEditorState();
  const resident = useResident();
  const removal = useResidentRemoval(resident);
  const answer = useResidentAnswer(resident);
  const control = useResidentControl(resident);
  const activeTab = editor.value ? "profile" : editor.tab;
  return (
    <>
      <SectionChrome
        title={text.title}
        tabs={[
          { id: "profiles", etiqueta: text.profilesTab, visible: true },
          { id: "applications", etiqueta: text.applications, visible: true },
          {
            id: "profile",
            etiqueta: text.profileTab,
            visible: editor.value !== null,
          },
        ]}
        activeTab={activeTab}
        onTabChange={(id) => {
          if (id === "profiles" || id === "applications") editor.navigate(id);
        }}
        rail={<LauncherRail residentStatus={resident} />}
      />
      <SectionPanel activeTab={activeTab}>
        <ResidentControlNotice
          control={control}
          showCancel={
            !!editor.value ||
            editor.tab === "applications" ||
            !control.hasProfiles
          }
        />
        {editor.tab === "applications" && !editor.value ? (
          <Applications />
        ) : (
          <Launcher control={control} removal={removal} />
        )}
      </SectionPanel>
      <ResidentInbox view={resident} answer={answer} />
    </>
  );
}
