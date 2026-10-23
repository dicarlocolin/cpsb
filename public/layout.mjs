export function detailsFraction(value) {
  const fraction=value==null||value===''?0.5:Number(value);
  return Number.isFinite(fraction)?Math.max(0.15,Math.min(0.85,fraction)):0.5;
}
