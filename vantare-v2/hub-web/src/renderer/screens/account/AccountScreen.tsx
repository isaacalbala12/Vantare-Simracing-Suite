import { useQuery } from "@tanstack/react-query";
import type { SettingsView } from "../../../contract/generated/contract";
import { useAccount } from "../../app/AccountState";
import { coreKey, offline, settingsKey, useHost } from "../../app/Host";
import { strategyOpen } from "../../app/navigation";
import { SectionChrome } from "../../app/SectionChrome";
import { accountText as text } from "../../i18n/account.es";
import { AccountPanel } from "../../ui/AccountPanel";
import { AccountRail } from "../../ui/AccountRail";
import { Button } from "../../ui/Button";
import { Callout, Skeleton } from "../../ui/Data";
export function AccountScreen() {
  const state = useAccount();
  const { client, hello } = useHost();
  // the same shared reads the menu uses; nothing is requested from here
  const { data: core = offline } = useQuery({
    queryKey: coreKey,
    queryFn: async () => offline,
    enabled: false,
  });
  const { data: settings } = useQuery<SettingsView>({
    queryKey: settingsKey,
    enabled: false,
  });
  const news = useQuery({
    queryKey: ["account", "news"],
    enabled: !!client,
    retry: false,
    queryFn: async () => {
      const reply = await client?.request({ method: "updates.get" });
      if (reply?.method !== "updates.get")
        throw new Error("Updates unavailable");
      return reply.value.news;
    },
  });
  const props = state.value
    ? {
        value: state.value,
        pending: state.pending,
        pendingMethod: state.pendingMethod,
        demo: !!hello?.demo,
        act: state.act,
        error: state.error,
      }
    : undefined;
  return (
    <>
      <SectionChrome
        title={text.title}
        rail={props ? <AccountRail {...props} /> : undefined}
      />
      {props ? (
        <AccountPanel
          {...props}
          news={news.data}
          newsError={news.isError ? text.newsFailed : undefined}
          newsLoading={news.isFetching}
          tester={core.access.tester}
          strategyOpen={strategyOpen(
            core.access,
            settings?.general.analisisBeta,
          )}
          onNewsReload={() => void news.refetch()}
        />
      ) : state.error ? (
        <Callout title={state.error}>
          <Button onClick={state.reload}>{text.reload}</Button>
        </Callout>
      ) : (
        <Skeleton label={text.title} />
      )}
    </>
  );
}
