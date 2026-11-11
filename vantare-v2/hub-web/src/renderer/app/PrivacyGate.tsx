import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { PrivacyView } from "../../contract/generated/contract";
import { HostFailure } from "../bridge/client";
import { privacyGateText as text } from "../i18n/privacy-gate.es";
import { Button } from "../ui/Button";
import { Callout, Skeleton } from "../ui/Data";
import { GateFrame } from "../ui/GateFrame";
import { PrivacyQuestion } from "../ui/PrivacyQuestion";
import { useHost } from "./Host";
import { WindowControls } from "./WindowControls";

const key = ["privacy"] as const;
export function PrivacyGate({ children }: { children: ReactNode }) {
  const { client } = useHost();
  const cache = useQueryClient();
  const [checked, setChecked] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const inFlight = useRef<Promise<void> | undefined>(undefined);
  const query = useQuery({
    queryKey: key,
    enabled: !!client,
    retry: false,
    queryFn: async () => {
      const reply = await client?.request({ method: "privacy.get" });
      if (reply?.method !== "privacy.get")
        throw new HostFailure({ kind: "io" });
      return reply.value;
    },
  });
  useEffect(
    () =>
      client?.addCloseGuard(async () => {
        await inFlight.current;
        return true;
      }),
    [client],
  );
  const value = query.data;
  // A protected document is denied by the host. Like GPUI's unreadable store,
  // it must not trap the user in a question that cannot be persisted.
  if (
    value &&
    (value.protected || (value.crashesDecided && value.usageDecided))
  )
    return children;
  const usage = value?.crashesDecided ?? false;
  function decide(accepted: boolean) {
    if (!value || !client || inFlight.current) return;
    setPending(true);
    setError(undefined);
    inFlight.current = (async () => {
      try {
        const reply = await client.request({
          method: "privacy.update",
          patch: { field: usage ? "usage" : "crashes", value: accepted },
          baseRevision: value.revision,
        });
        if (reply.method !== "privacy.update")
          throw new HostFailure({ kind: "io" });
        cache.setQueryData<PrivacyView>(key, reply.value);
      } catch (failure) {
        if (
          failure instanceof HostFailure &&
          (failure.detail.kind === "privacyConflict" ||
            failure.detail.kind === "privacyCleanup")
        ) {
          cache.setQueryData<PrivacyView>(key, failure.detail.current);
          if (failure.detail.kind === "privacyCleanup") return;
        }
        setError(text.failed);
      } finally {
        inFlight.current = undefined;
        setPending(false);
      }
    })();
  }
  async function policy() {
    try {
      const reply = await client?.request({ method: "privacy.policy" });
      if (reply?.method !== "privacy.policy" || !reply.accepted)
        setError(text.policyFailed);
    } catch {
      setError(text.policyFailed);
    }
  }
  return (
    <GateFrame controls={<WindowControls />}>
      {!value ? (
        query.isError ? (
          <Callout title={text.failed}>
            <Button onClick={() => void query.refetch()}>{text.retry}</Button>
          </Callout>
        ) : (
          <Skeleton label={text.loading} />
        )
      ) : (
        <PrivacyQuestion
          key={usage ? "usage" : "crashes"}
          usage={usage}
          checked={checked}
          onChecked={setChecked}
          pending={pending}
          error={error}
          onDecide={decide}
          onPolicy={() => void policy()}
        />
      )}
    </GateFrame>
  );
}
