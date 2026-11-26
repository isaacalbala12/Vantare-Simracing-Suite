// Un precio de Pro o Pro Plus nunca se escribe sin su periodo: toda cifra de
// suscripción pasa por aquí. Founders es un pago único y no lleva periodo.
export const perMonth = (amount: string) => `${amount}/mes`;
export const perYear = (amount: string) => `${amount}/año`;
