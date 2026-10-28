export const comparePlotNumbers = (left: any, right: any): number => {
  const leftNumber = Number.parseInt(String(left?.plotNumber ?? ''), 10);
  const rightNumber = Number.parseInt(String(right?.plotNumber ?? ''), 10);
  const leftIsNumber = Number.isFinite(leftNumber);
  const rightIsNumber = Number.isFinite(rightNumber);
  if (leftIsNumber && rightIsNumber && leftNumber !== rightNumber) return leftNumber - rightNumber;
  if (leftIsNumber !== rightIsNumber) return leftIsNumber ? -1 : 1;
  return String(left?.plotNumber ?? '').localeCompare(String(right?.plotNumber ?? ''), undefined, { numeric: true });
};
