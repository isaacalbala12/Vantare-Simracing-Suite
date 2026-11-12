import { expect, it } from "vitest";
import { testingParticipationLabel } from "../src/mock/testing-participation";

it("uses the frozen bank status only for the two explicit participation scenes", () => {
  for (const scene of [
    "testing-tester-questionnaires-reference",
    "testing-tester-community-reference",
    "visual-dark:testing-tester-questionnaires-reference",
    "visual-light:testing-tester-community-reference",
  ])
    expect(
      testingParticipationLabel("Datos confirmados por el servicio", scene),
    ).toBe("QA · ejemplo de participación, sin backend ni envío");
  for (const scene of [
    "",
    "testing-tester-reports",
    "testing-tester-reference",
    "visual-light:testing-tester-reports",
    "visual-other:testing-tester-questionnaires-reference",
  ])
    expect(
      testingParticipationLabel("Datos confirmados por el servicio", scene),
    ).toBe("Datos confirmados por el servicio");
});
