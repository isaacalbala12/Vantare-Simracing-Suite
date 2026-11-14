import { Tabs } from "@base-ui/react/tabs";
import { useRef, useState } from "react";
import type { OverlayInstance } from "../../../contract/generated/studio";
import { Icon } from "../../assets/icons/Icon";
import { studioText as t } from "../../i18n/studio";
import { useStudio } from "../../screens/studio/state";
import { Button } from "../Button";
import { Spinner } from "../Data";
import { Tooltip } from "../Layers";
import { AppearanceStep } from "./AppearanceStep";
import { TrackStep } from "./TrackStep";
import "./studio-steps.css";
export function StudioSteps({
  item,
  readOnly = false,
}: {
  item: OverlayInstance;
  readOnly?: boolean;
}) {
  return <Steps key={item.id} item={item} readOnly={readOnly} />;
}
function Steps({
  item,
  readOnly,
}: {
  item: OverlayInstance;
  readOnly: boolean;
}) {
  const state = useStudio();
  const [step, setStep] = useState(item.settings ? "appearance" : "track");
  const track = useRef<HTMLButtonElement>(null);
  if (state.view?.state !== "ready" && !readOnly)
    return <p>{t.appearanceUnavailable}</p>;
  const disabled = readOnly || item.locked || state.view?.plan === "unverified";
  return (
    <Tabs.Root
      className="v-studio-steps"
      value={step}
      onValueChange={(value) => {
        if (
          !readOnly &&
          (value === "track" || (value === "appearance" && item.settings))
        )
          setStep(String(value));
      }}
    >
      <div className="v-studio-steps-header">
        <Tabs.List aria-label={t.inspectorTabs} activateOnFocus>
          <Tooltip label={item.settings ? t.appearance : t.soonTooltip}>
            <Tabs.Tab
              value="appearance"
              aria-disabled={readOnly || !item.settings || undefined}
            >
              <span className="v-step-number" aria-hidden="true">
                {t.stepNumbers[0]}
              </span>
              {t.appearance}
            </Tabs.Tab>
          </Tooltip>
          <Tabs.Tab
            value="track"
            ref={track}
            aria-disabled={readOnly || undefined}
          >
            <span className="v-step-number" aria-hidden="true">
              {t.stepNumbers[1]}
            </span>
            {t.track}
          </Tabs.Tab>
          <Tooltip label={t.contentSoonHelp}>
            <Tabs.Tab value="content" aria-disabled="true">
              <span className="v-step-number" aria-hidden="true">
                {t.stepNumbers[2]}
              </span>
              {t.content}
              <small aria-hidden="true">{t.contentSoonBadge}</small>
            </Tabs.Tab>
          </Tooltip>
        </Tabs.List>
        <div
          role="status"
          className="v-step-save"
          data-failed={!readOnly && !!state.failure}
        >
          {readOnly ? (
            t.readOnly
          ) : state.pending ? (
            <>
              <Spinner label={t.saving} />
              {t.saving}
            </>
          ) : state.failure ? (
            <>
              <Icon name="alert" />
              {t.notSaved}
            </>
          ) : disabled ? (
            state.view?.plan === "unverified" ? (
              t.verifyWidget
            ) : (
              t.lockedWidget
            )
          ) : (
            t.autoSaved
          )}
        </div>
        {!readOnly && step === "appearance" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setStep("track");
              track.current?.focus();
            }}
          >
            {t.next}
          </Button>
        )}
      </div>
      {readOnly ? (
        <p className="v-studio-readonly-note">{t.appearanceUnavailable}</p>
      ) : (
        <>
          <Tabs.Panel value="appearance">
            <AppearanceStep item={item} />
          </Tabs.Panel>
          <Tabs.Panel value="track">
            <TrackStep item={item} />
          </Tabs.Panel>
        </>
      )}
    </Tabs.Root>
  );
}
