// Polar separates net refunds and refunded sales tax. This projection uses
// what the customer paid (tax included), never the merchant's net revenue.
export function grossRefund(amount: unknown, tax: unknown): number | null {
  if (
    !Number.isSafeInteger(amount) || !Number.isSafeInteger(tax) ||
    Number(amount) < 0 || Number(tax) < 0
  ) return null;
  const total = Number(amount) + Number(tax);
  return Number.isSafeInteger(total) ? total : null;
}
