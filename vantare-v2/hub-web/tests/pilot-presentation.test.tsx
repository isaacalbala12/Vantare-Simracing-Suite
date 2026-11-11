// @vitest-environment jsdom
import { CSPProvider } from "@base-ui/react/csp-provider";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import fixture from "../fixtures/pilot-base.json";
import type { PilotFields } from "../src/contract/generated/contract";
import { pilotSimulatorOptions } from "../src/contract/generated/contract";
import { t } from "../src/renderer/i18n/es";
import { PilotDetails, PilotSimulators } from "../src/renderer/ui/PilotProfile";

afterEach(cleanup);
const fields = fixture.fields as PilotFields;
it("preserves an existing country absent from the short native editor catalogue", () => {
  const edit = vi.fn();
  render(
    <CSPProvider disableStyleElements>
      <PilotDetails
        fields={{ ...fields, country: "AQ" }}
        pending={false}
        edit={edit}
      />
    </CSPProvider>,
  );
  expect(
    screen.getByRole("combobox", { name: t("pilot.country") }).textContent,
  ).toContain("AQ");
  expect(edit).not.toHaveBeenCalled();
});
it("counts Unicode code points and preserves keyboard focus during persistence", () => {
  const edit = vi.fn();
  const view = render(
    <CSPProvider disableStyleElements>
      <PilotDetails
        fields={{ ...fields, publicName: "😀" }}
        pending={false}
        edit={edit}
      />
    </CSPProvider>,
  );
  expect(screen.getByText("1/32")).toBeTruthy();
  const name = screen.getByRole("textbox", { name: t("pilot.name") });
  name.focus();
  view.rerender(
    <CSPProvider disableStyleElements>
      <PilotDetails
        fields={{ ...fields, publicName: "😀" }}
        pending
        edit={edit}
      />
    </CSPProvider>,
  );
  expect(document.activeElement).toBe(name);
  expect(name.getAttribute("readonly")).not.toBeNull();
});
it("offers the generated simulator order and keeps unknown persisted simulators", async () => {
  const onChange = vi.fn();
  render(
    <CSPProvider disableStyleElements>
      <PilotSimulators
        fields={{ ...fields, simulators: ["future-sim", "iracing"] }}
        pending={false}
        onChange={onChange}
      />
    </CSPProvider>,
  );
  expect(
    screen.getAllByRole("checkbox").map((item) => item.textContent),
  ).toEqual(pilotSimulatorOptions.map(([, label]) => label));
  await userEvent
    .setup()
    .click(screen.getByRole("checkbox", { name: "Le Mans Ultimate" }));
  expect(onChange).toHaveBeenCalledWith(["lmu", "iracing", "future-sim"]);
});
it("does not toggle a pending simulator with keyboard or pointer", async () => {
  const onChange = vi.fn();
  render(
    <CSPProvider disableStyleElements>
      <PilotSimulators fields={fields} pending onChange={onChange} />
    </CSPProvider>,
  );
  const choice = screen.getByRole("checkbox", { name: "Le Mans Ultimate" });
  choice.focus();
  await userEvent.setup().keyboard(" ");
  fireEvent.click(choice);
  expect(onChange).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(choice);
});
