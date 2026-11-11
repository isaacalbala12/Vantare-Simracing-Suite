import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type {
  OnboardingView,
  PerformanceLevel,
  PrivacyView,
  SettingsView,
  WidgetKind,
} from "../../../contract/generated/contract";
import { settingsKey, useHost } from "../../app/Host";
import { HostFailure } from "../../bridge/client";
import { onboardingSummaryText as text } from "../../i18n/onboarding-summary";
import { canEnterPrivate, saveConsents } from "./consent";
export function useCompletion(
  active: boolean,
  onComplete?: (privateSession: boolean, show: boolean) => void,
) {
  const { client } = useHost();
  const cache = useQueryClient();
  const [intent, setIntent] = useState({ crashes: true, usage: false });
  const adopted = useRef(false);
  const edited = useRef(false);
  const inFlight = useRef<Promise<void> | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const [saveFailure, setSaveFailure] = useState<unknown>();
  const [failure, setFailure] = useState<unknown>();
  const privacy = useQuery({
    queryKey: ["privacy"],
    enabled: active && !!client,
    retry: false,
    queryFn: async () => {
      const reply = await client?.request({ method: "privacy.get" });
      if (reply?.method !== "privacy.get")
        throw new HostFailure({ kind: "io" });
      return reply.value;
    },
  });
  useEffect(() => {
    if (!active || adopted.current || !privacy.data) return;
    adopted.current = true;
    if (!edited.current)
      setIntent({
        crashes: privacy.data.crashesDecided ? privacy.data.crashes : true,
        usage: privacy.data.usageDecided ? privacy.data.usage : false,
      });
  }, [active, privacy.data]);
  useEffect(
    () =>
      active
        ? client?.addCloseGuard(async () => {
            await inFlight.current;
            return true;
          })
        : undefined,
    [client, active],
  );
  function run(task: () => Promise<void>) {
    if (!client || inFlight.current) return;
    setPending(true);
    setFailure(undefined);
    setSaveFailure(undefined);
    inFlight.current = task()
      .catch((error) => setFailure(error))
      .finally(() => {
        inFlight.current = undefined;
        setPending(false);
      });
  }
  const publish = (value: PrivacyView) =>
    cache.setQueryData(["privacy"], value);
  function consent(done: () => void) {
    run(async () => {
      if (!client) return;
      await saveConsents(client, intent, publish, setSaveFailure);
      done();
    });
  }
  function finish(input: {
    kit: WidgetKind[];
    level: PerformanceLevel;
    show: boolean;
    layoutRevision: string | null;
  }) {
    run(async () => {
      if (!client) return;
      // Read again after all earlier asynchronous settings writes have settled.
      const settings = cache.getQueryData<SettingsView>(settingsKey);
      if (!settings || settings.protected)
        throw new HostFailure({ kind: "protected" });
      try {
        const reply = await client.request({
          method: "onboarding.finish",
          ...input,
          baseRevision: settings.revision,
        });
        if (reply.method !== "onboarding.finish")
          throw new HostFailure({ kind: "io" });
        cache.setQueryData(["onboarding"], reply.value);
        await cache.invalidateQueries({ queryKey: settingsKey });
        onComplete?.(false, input.show);
      } catch (error) {
        if (
          error instanceof HostFailure &&
          error.detail.kind === "onboardingConflict"
        )
          cache.setQueryData(["onboarding"], error.detail.current);
        else {
          const current = await client
            .request({ method: "onboarding.get" })
            .catch(() => undefined);
          if (current?.method === "onboarding.get")
            cache.setQueryData<OnboardingView>(["onboarding"], current.value);
        }
        await cache.invalidateQueries({ queryKey: settingsKey });
        throw error;
      }
    });
  }
  function enterPrivate() {
    run(async () => {
      if (!client || !canEnterPrivate(saveFailure, privacy.data))
        throw new HostFailure({ kind: "denied" });
      const reply = await client.request({ method: "onboarding.skipPrivate" });
      if (reply.method !== "onboarding.skipPrivate" || !reply.accepted)
        throw new HostFailure({ kind: "denied" });
      onComplete?.(true, true);
    });
  }
  function continueProtected() {
    run(async () => {
      const reply = await client?.request({ method: "privacy.get" });
      if (reply?.method !== "privacy.get")
        throw new HostFailure({ kind: "io" });
      publish(reply.value);
      if (!reply.value.protected) throw new HostFailure({ kind: "denied" });
      // Match PrivacyGate: leave this renderer's gate without changing the
      // protected file or claiming a host private session or persisted completion.
      onComplete?.(false, true);
    });
  }
  function policy() {
    run(async () => {
      const reply = await client?.request({ method: "privacy.policy" });
      if (reply?.method !== "privacy.policy" || !reply.accepted)
        throw new HostFailure({ kind: "io" });
    });
  }
  return {
    intent,
    pending,
    privacy,
    consent,
    finish,
    policy,
    enterPrivate,
    continueProtected,
    privateAllowed: canEnterPrivate(saveFailure, privacy.data),
    error: failure
      ? failure instanceof HostFailure &&
        failure.detail.kind === "onboardingConflict"
        ? text.conflict
        : text.failed
      : privacy.error
        ? text.failed
        : undefined,
    choose(field: "crashes" | "usage", value: boolean) {
      edited.current = true;
      setIntent((current) => ({ ...current, [field]: value }));
    },
  };
}
