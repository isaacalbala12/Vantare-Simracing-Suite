import { expect } from "vitest";

export function expectDisabled(element: Element): void {
  expect((element as HTMLButtonElement).disabled).toBe(true);
}

export function expectEnabled(element: Element): void {
  expect((element as HTMLButtonElement).disabled).toBe(false);
}