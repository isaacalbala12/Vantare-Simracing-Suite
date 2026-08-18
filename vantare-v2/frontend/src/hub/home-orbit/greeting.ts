export type GreetingSlot = "morning" | "afternoon" | "evening";

/**
 * Franja horaria del saludo de Inicio (`14-i18n.md`, `home.greeting.*`).
 * Mañana hasta las 12, tarde hasta las 20, noche a partir de ahí; hora local
 * del usuario, que es la que el hero muestra en todo lo demás.
 */
export function greetingSlot(now: Date): GreetingSlot {
  const hour = now.getHours();
  if (hour < 12) return "morning";
  if (hour < 20) return "afternoon";
  return "evening";
}
