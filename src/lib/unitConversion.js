// ============================================================
// Adey ERP – Global Unit Conversion System
// ============================================================

/**
 * Unit families and their conversion factors.
 * Each family has a "base" unit and all conversions are relative to it.
 * Factor = how many base units one of this unit equals.
 */
const UNIT_DEFINITIONS = {
  // Mass family
  g:   { family: "mass", factor: 1,    label: "Grams (g)" },
  kg:  { family: "mass", factor: 1000, label: "Kilograms (kg)" },

  // Volume family
  mL:  { family: "volume", factor: 1,    label: "Millilitres (mL)" },
  ml:  { family: "volume", factor: 1,    label: "Millilitres (mL)" },   // alias
  L:   { family: "volume", factor: 1000, label: "Litres (L)" },

  // Count family
  pcs: { family: "count", factor: 1, label: "Pieces (pcs)" },

  // Packaging / Length (no cross-conversion, 1:1)
  box:    { family: "packaging", factor: 1, label: "Box" },
  rolls:  { family: "packaging", factor: 1, label: "Rolls" },
  meters: { family: "length",    factor: 1, label: "Meters" },
};

/**
 * Lookup a unit definition (case-insensitive).
 */
export function getUnitDef(unit) {
  if (!unit) return null;
  return UNIT_DEFINITIONS[unit] || UNIT_DEFINITIONS[unit.toLowerCase()] || null;
}

/**
 * Get the family name for a unit.
 */
export function getUnitFamily(unit) {
  return getUnitDef(unit)?.family || null;
}

/**
 * Check whether two units belong to the same family
 * and can therefore be converted between each other.
 */
export function areUnitsCompatible(unitA, unitB) {
  if (!unitA || !unitB) return false;
  const famA = getUnitFamily(unitA);
  const famB = getUnitFamily(unitB);
  if (!famA || !famB) return false;
  return famA === famB;
}

/**
 * Convert a quantity from one unit to another.
 * Returns the converted quantity, or null if incompatible.
 *
 * Example: convertUnit(5, 'kg', 'g') => 5000
 *          convertUnit(500, 'g', 'kg') => 0.5
 */
export function convertUnit(quantity, fromUnit, toUnit) {
  if (fromUnit === toUnit) return quantity;

  const from = getUnitDef(fromUnit);
  const to   = getUnitDef(toUnit);

  if (!from || !to) return null;
  if (from.family !== to.family) return null;

  // Convert: fromUnit → base → toUnit
  const inBase = quantity * from.factor;
  return inBase / to.factor;
}

/**
 * Return all units that belong to the same family as `unit`.
 * Used to filter the GRN unit dropdown.
 *
 * Returns an array of { value, label } objects.
 */
export function getCompatibleUnits(unit) {
  const family = getUnitFamily(unit);
  if (!family) return [];

  const seen = new Set();
  const result = [];

  for (const [key, def] of Object.entries(UNIT_DEFINITIONS)) {
    if (def.family === family && !seen.has(key)) {
      seen.add(key);
      result.push({ value: key, label: def.label });
    }
  }

  return result;
}

/**
 * Format a quantity with smart unit display.
 * E.g. 1500 g → "1.500 kg", 0.3 L → "300 mL"
 * Always converts to the most readable larger unit when appropriate.
 */
export function formatQtyWithUnit(qty, unit) {
  const def = getUnitDef(unit);
  if (!def) return `${qty} ${unit}`;

  const numQty = parseFloat(qty);
  if (isNaN(numQty)) return `${qty} ${unit}`;

  // For mass, auto-upgrade grams to kg
  if (def.family === "mass") {
    // Convert everything to grams first (base unit)
    const inGrams = numQty * def.factor;
    if (inGrams >= 1000) {
      const kgs = inGrams / 1000;
      return `${kgs.toFixed(3)} kg`;
    }
    return `${inGrams.toFixed(inGrams < 10 ? 2 : 1)} g`;
  }

  // For volume, auto-upgrade mL to L
  if (def.family === "volume") {
    const inMl = numQty * def.factor;
    if (inMl >= 1000) {
      const litres = inMl / 1000;
      return `${litres.toFixed(3)} L`;
    }
    return `${inMl.toFixed(inMl < 10 ? 2 : 1)} mL`;
  }

  return `${parseFloat(qty).toFixed(qty < 1 ? 3 : 1)} ${unit}`;
}

/**
 * Format a raw quantity in base unit into a dynamic display string.
 * E.g. formatDynamicQty(1567, 'g') → "1.567 kg"
 *      formatDynamicQty(250, 'g')  → "250 g"
 *      formatDynamicQty(2.5, 'kg') → "2.500 kg"
 */
export function formatDynamicQty(qty, unit) {
  return formatQtyWithUnit(qty, unit);
}
