import type { LauncherAppEntry } from "./launcher-state";
import type { ChainState } from "./chain-store";

type Props = {
  chain: ChainState;
  apps: LauncherAppEntry[];
  onCancel: () => void;
};

/** @todo Full implementation in Task 5.3 — this is a stub so ProfileCard can import it. */
export function ProfileCardTimeline({ chain: _chain, apps: _apps, onCancel: _onCancel }: Props) {
  return (
    <div data-testid="profile-timeline" role="status" aria-live="polite">
      {/* Full timeline with Motion animation comes in cut 5.3 */}
    </div>
  );
}
