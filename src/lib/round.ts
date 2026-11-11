/**
 * C# `Math.Round(double)` 默认使用 MidpointRounding.ToEven（银行家舍入），
 * 移植时行号 key 与分位数取值都依赖它，统一收敛到这里。
 */
export function roundHalfEven(value: number): number {
  const floor = Math.floor(value);
  const diff = value - floor;

  if (diff > 0.5) return floor + 1;
  if (diff < 0.5) return floor;

  return floor % 2 === 0 ? floor : floor + 1;
}
