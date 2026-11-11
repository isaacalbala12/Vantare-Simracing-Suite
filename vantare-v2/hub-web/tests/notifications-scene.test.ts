import { expect, it } from "vitest";
import { notificationScene } from "../src/renderer/qa/notifications-scene";
import {
  type Center,
  dateGroup,
  filtered,
  publish,
} from "../src/renderer/screens/notifications/center";

it("seeds only the explicit scene with the five native visible notices and three unread", () => {
  const now = new Date(2026, 10, 12, 12);
  expect(notificationScene("notificaciones-base", now)).toEqual([]);
  expect(notificationScene("", now)).toEqual([]);
  let center: Center = { records: [], sequence: 0 };
  for (const row of notificationScene("notificaciones-cinco", now))
    center = publish(center, row.input, row.at, row.muted);
  const records = filtered(center.records, "all", true);
  expect(records).toHaveLength(5);
  expect(records.filter((record) => record.unread)).toHaveLength(3);
  expect(records.map((record) => record.title)).toEqual([
    "Actualización de prueba lista",
    "Respuesta al informe de prueba",
    "Perfil de prueba listo",
    "Aviso del Launcher",
    "El perfil de prueba falló",
  ]);
  expect(records.map((record) => dateGroup(record.occurredAt, now))).toEqual([
    "today",
    "today",
    "today",
    "today",
    "yesterday",
  ]);
  expect(
    records.map((record) => {
      const date = new Date(record.occurredAt);
      return [date.getHours(), date.getMinutes()];
    }),
  ).toEqual([
    [18, 20],
    [18, 5],
    [18, 2],
    [18, 1],
    [21, 40],
  ]);
});
