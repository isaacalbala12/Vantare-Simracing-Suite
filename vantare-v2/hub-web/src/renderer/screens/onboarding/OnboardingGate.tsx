import { skipToken, useQuery } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import type { CoreStatus } from "../../../contract/generated/contract";
import { coreKey, offline, useHost } from "../../app/Host";
import { lock } from "../../app/navigation";
import { useUi } from "../../app/UiState";
import { WindowControls } from "../../app/WindowControls";
import { HostFailure } from "../../bridge/client";
import { onboardingText as text } from "../../i18n/onboarding";
import { Button } from "../../ui/Button";
import { Callout, Skeleton } from "../../ui/Data";
import { GateFrame } from "../../ui/GateFrame";
import { OnboardingIntroPreview } from "./IntroPreview";
export function OnboardingGate({
  children,
}: {
  children: (privateSession: boolean) => ReactNode;
}) {
  const { client } = useHost();
  const navigate = useUi((state) => state.navigate);
  const [passed, setPassed] = useState<{ privateSession: boolean }>();
  const { data: core = offline } = useQuery<CoreStatus>({
    queryKey: coreKey,
    queryFn: skipToken,
  });
  const query = useQuery({
    queryKey: ["onboarding"],
    enabled: !!client,
    retry: false,
    queryFn: async () => {
      const reply = await client?.request({ method: "onboarding.get" });
      if (reply?.method !== "onboarding.get")
        throw new HostFailure({ kind: "io" });
      return reply.value;
    },
  });
  // Once resolved, subsequent invalidations cannot unmount the user's Hub drafts.
  if (passed) return children(passed.privateSession);
  if (query.data && !query.data.pending) {
    setPassed({ privateSession: query.data.privateSession });
    return children(query.data.privateSession);
  }
  if (!query.data)
    return (
      <GateFrame controls={<WindowControls />}>
        {query.error ? (
          <Callout title={text.unavailable}>
            <Button onClick={() => void query.refetch()}>{text.retry}</Button>
          </Callout>
        ) : (
          <Skeleton label={text.loading} />
        )}
      </GateFrame>
    );
  return (
    <OnboardingIntroPreview
      full
      extended
      studioReason={lock("studio", core.access)}
      onLeave={() => {}}
      onComplete={(privateSession, show) => {
        // The same rights guard used by Inicio also applies after a successful save.
        navigate(show || lock("studio", core.access) ? "home" : "studio");
        setPassed({ privateSession });
      }}
    />
  );
}
