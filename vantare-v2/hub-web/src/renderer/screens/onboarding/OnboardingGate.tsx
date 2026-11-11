import { skipToken, useQuery } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
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
import { OnboardingAccountIntro } from "./AccountIntro";
export function OnboardingGate({
  children,
}: {
  children: (privateSession: boolean) => ReactNode;
}) {
  const { client } = useHost();
  const navigate = useUi((state) => state.navigate);
  const [required, setRequired] = useState<boolean>();
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
  // Decide once. finish's fresh cache publication must not unmount the wizard
  // before its save/refresh and explicit completion callback have settled.
  useEffect(() => {
    if (required !== undefined || !query.data) return;
    setRequired(query.data.pending);
    if (!query.data.pending)
      setPassed({ privateSession: query.data.privateSession });
  }, [required, query.data]);
  if (passed) return children(passed.privateSession);
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
  if (required === undefined)
    return (
      <GateFrame controls={<WindowControls />}>
        <Skeleton label={text.loading} />
      </GateFrame>
    );
  return (
    <OnboardingAccountIntro
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
