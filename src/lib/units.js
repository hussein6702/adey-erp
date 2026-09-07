// Universal Unit Conversion & Equivalence Utility
// In this ERP:
// 1 kg = 1000 g
// 1 L = 1000 ml
// 1 g = 1 ml (density 1:1 for depletion and inventory equivalence)
// 1 kg = 1 L = 1000 base units

export const UNIT_TYPES = {
  WEIGHT: "weight",
  VOLUME: "volume",
  COUNT: "count",
};

export function getUnitType(unit = "") {
  const u = String(unit).toLowerCase().trim();
  if (["kg", "kilogram", "kilograms", "g", "gram", "grams", "mg"].includes(u)) {
    return UNIT_TYPES.WEIGHT;
  }
  if (["l", "liter", "liters", "litre", "litres", "ml", "milliliter", "milliliters", "millilitre"].includes(u)) {
    return UNIT_TYPES.VOLUME;
  }
  return UNIT_TYPES.COUNT;
}

/**
 * Converts any quantity + unit into normalized base units (grams / mls / pieces).
 * 1 kg = 1000 base units
 * 1 L  = 1000 base units
 * 1 g  = 1 base unit
 * 1 ml = 1 base unit
 */
export function toBaseUnits(quantity, unit = "gram") {
  const q = Number(quantity) || 0;
  const u = String(unit).toLowerCase().trim();

  switch (u) {
    case "kg":
    case "kilogram":
    case "kilograms":
    case "l":
    case "liter":
    case "liters":
    case "litre":
    case "litres":
      return q * 1000;
    case "mg":
      return q / 1000;
    case "g":
    case "gram":
    case "grams":
    case "ml":
    case "milliliter":
    case "milliliters":
    case "millilitre":
    default:
      return q;
  }
}

/**
 * Converts a base quantity (in grams/mls) into a target unit.
 */
export function fromBaseUnits(baseQuantity, targetUnit = "gram") {
  const bq = Number(baseQuantity) || 0;
  const u = String(targetUnit).toLowerCase().trim();

  switch (u) {
    case "kg":
    case "kilogram":
    case "kilograms":
    case "l":
    case "liter":
    case "liters":
    case "litre":
    case "litres":
      return bq / 1000;
    case "mg":
      return bq * 1000;
    case "g":
    case "gram":
    case "grams":
    case "ml":
    case "milliliter":
    case "milliliters":
    case "millilitre":
    default:
      return bq;
  }
}

/**
 * Converts directly between two units.
 */
export function convertUnit(quantity, fromUnit, toUnit) {
  const base = toBaseUnits(quantity, fromUnit);
  return fromBaseUnits(base, toUnit);
}

/**
 * Formats a number cleanly (omitting unnecessary trailing zeroes).
 */
export function formatQty(val, maxDecimals = 3) {
  const n = Number(val) || 0;
  return Number(n.toFixed(maxDecimals)).toLocaleString();
}

/**
 * Smart stock display formatter.
 * If 1 kg in kitchen and 250 g is used, 750 base units displays as "750 g".
 * If 1 L in kitchen and 250 ml is used, 750 base units displays as "750 ml".
 * If 1500 g, displays as "1.5 kg" (or "1,500 g").
 */
export function formatStock(quantity, unit = "gram") {
  const type = getUnitType(unit);
  const base = toBaseUnits(quantity, unit);
  const u = String(unit).toLowerCase().trim();

  if (type === UNIT_TYPES.WEIGHT) {
    if (base < 1000) {
      return `${formatQty(base)} g`;
    }
    const inKg = base / 1000;
    return `${formatQty(inKg, 3)} kg`;
  }

  if (type === UNIT_TYPES.VOLUME) {
    if (base < 1000) {
      return `${formatQty(base)} ml`;
    }
    const inL = base / 1000;
    return `${formatQty(inL, 3)} L`;
  }

  return `${formatQty(quantity)} ${unit}`;
}

/**
 * Calculates stock depletion in base units.
 */
export function depleteStock(availableQty, availableUnit, requiredQty, requiredUnit) {
  const availBase = toBaseUnits(availableQty, availableUnit);
  const reqBase = toBaseUnits(requiredQty, requiredUnit);
  const remainingBase = Math.max(0, availBase - reqBase);

  return {
    availBase,
    reqBase,
    remainingBase,
    remainingInAvailUnit: fromBaseUnits(remainingBase, availableUnit),
    isFulfilled: availBase >= reqBase,
    shortfallBase: Math.max(0, reqBase - availBase),
  };
}
