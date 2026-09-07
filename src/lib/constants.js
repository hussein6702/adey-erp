export const CURRENCIES = ["AED", "ETB", "USD"];
export const CURRENCY_SYMBOL = { AED: "AED", ETB: "Br", USD: "$" };
export const CONTAINERS = ["carton", "box", "bottle", "bucket", "custom", "packet"];
export const UNIT_GROUPS = [
  {
    label: "Weight",
    options: [
      { value: "kg", label: "Kilograms" },
      { value: "gram", label: "Grams" },
    ],
  },
  {
    label: "Volume",
    options: [
      { value: "l", label: "Litres" },
      { value: "ml", label: "Millilitres" },
    ],
  },
  {
    label: "Count",
    options: [{ value: "piece", label: "Pieces" }],
  },
];
export const UNITS = UNIT_GROUPS.flatMap((g) => g.options);
export const VAT_RATE = 15;

// Smaller display unit for a given main unit (e.g. kg -> gram, l -> ml).
// Factor converts main-unit quantity to the sub unit quantity.
export const SUB_UNITS = {
  kg: { unit: "gram", factor: 1000 },
  l: { unit: "ml", factor: 1000 },
  gram: { unit: "mg", factor: 1000 },
};
