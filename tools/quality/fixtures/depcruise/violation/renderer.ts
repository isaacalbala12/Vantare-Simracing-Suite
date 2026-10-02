// Fixture: VIOLATION — renderer imports the forbidden wails-mock layer.
import { Events } from "../wails-mock";

export function render(): string {
  return Events ? "wails" : "none";
}
