export const comparePlotNumbers = (left: any, right: any): number => {
  const leftNumber = Number.parseInt(String(left?.plotNumber ?? ''), 10);
  const rightNumber = Number.parseInt(String(right?.plotNumber ?? ''), 10);
  const leftIsNumber = Number.isFinite(leftNumber);
  const rightIsNumber = Number.isFinite(rightNumber);
  if (leftIsNumber && rightIsNumber && leftNumber !== rightNumber) return leftNumber - rightNumber;
  if (leftIsNumber !== rightIsNumber) return leftIsNumber ? -1 : 1;
  return String(left?.plotNumber ?? '').localeCompare(String(right?.plotNumber ?? ''), undefined, { numeric: true });
};

/**
 * Booking amount of a plot = its rate (per sq.ft) x its area. Falls back to the stored price when the rate
 * is not recorded, and derives the rate from price / area when only that is known.
 */
export const calculatePlotAmount = (plot: any): { rate: number; area: number; amount: number } => {
  const area = Number(plot?.areaSqFt ?? plot?.sizeSqft ?? 0) || 0;
  const price = Number(plot?.price ?? plot?.totalPrice ?? 0) || 0;
  const storedRate = Number(plot?.pricePerSqft ?? 0) || 0;
  const rate = storedRate > 0 ? storedRate : area > 0 && price > 0 ? price / area : 0;
  const amount = storedRate > 0 && area > 0 ? Math.round(storedRate * area * 100) / 100 : price;
  return { rate, area, amount };
};
