import { updatesText as text } from "../i18n/updates.es";
import { RailBlock } from "./Frame";
import "./updates.css";
export function UpdatesRailContent() {
  return (
    <div className="v-update-rail">
      <RailBlock title={text.installation} icon="v-download">
        <p>{text.installationHelp}</p>
      </RailBlock>
      <RailBlock title={text.channels} icon="v-download">
        <p>{text.channelsHelp}</p>
      </RailBlock>
      <RailBlock title={text.problems} icon="v-shield">
        <p>{text.problemsHelp}</p>
      </RailBlock>
    </div>
  );
}
