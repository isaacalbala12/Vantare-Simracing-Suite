// @vitest-environment jsdom
import { CSPProvider } from "@base-ui/react/csp-provider";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { privacyText } from "../src/renderer/i18n/privacy.es";
import { PrivacyDetails } from "../src/renderer/ui/PrivacyPresentation";

afterEach(cleanup);
it("does not claim missing reporting configuration when the host observes it configured", () => {
  const view = render(
    <CSPProvider disableStyleElements>
      <PrivacyDetails configured={false} pending={false} onPolicy={() => {}} />
    </CSPProvider>,
  );
  expect(screen.getByText(privacyText.notConfigured)).toBeTruthy();
  view.rerender(
    <CSPProvider disableStyleElements>
      <PrivacyDetails configured pending={false} onPolicy={() => {}} />
    </CSPProvider>,
  );
  expect(screen.queryByText(privacyText.notConfigured)).toBeNull();
});
it("keeps policy keyboard focus while pending without opening it twice", async () => {
  const onPolicy = vi.fn();
  const view = render(
    <CSPProvider disableStyleElements>
      <PrivacyDetails configured pending={false} onPolicy={onPolicy} />
    </CSPProvider>,
  );
  const button = screen.getByRole("button", { name: "Política de privacidad" });
  button.focus();
  await userEvent.setup().keyboard("{Enter}");
  expect(onPolicy).toHaveBeenCalledTimes(1);
  view.rerender(
    <CSPProvider disableStyleElements>
      <PrivacyDetails configured pending onPolicy={onPolicy} />
    </CSPProvider>,
  );
  expect(document.activeElement).toBe(button);
  await userEvent.setup().keyboard("{Enter}");
  expect(onPolicy).toHaveBeenCalledTimes(1);
});
