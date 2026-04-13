// Adey ERP – Document & Product Coding System

/**
 * Generate a product code
 * @param {string} category - e.g. 'bonbon', 'truffle', 'bar'
 * @param {number} seq - sequential number
 */
export function generateProductCode(category, seq) {
  const catMap = {
    bonbon: 'BON',
    truffle: 'TRF',
    bar: 'BAR',
    praline: 'PRA',
    other: 'OTH',
  };
  const prefix = catMap[category?.toLowerCase()] || 'OTH';
  return `PRD-${prefix}-${String(seq).padStart(3, '0')}`;
}

/**
 * Generate a movement number
 * @param {string} code - 'KS', 'SK', 'SSH'
 * @param {number} seq - daily order number
 */
export function generateMovementNumber(code, seq) {
  const d = new Date();
  const dateStr = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
  const prefix = code === 'K-S' ? 'KS' : code;
  return `${prefix}-${dateStr}-${String(seq).padStart(3, '0')}`;
}

/**
 * Generate a production sheet number
 */
export function generatePSNumber(seq) {
  const d = new Date();
  const dateStr = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
  return `PS-${dateStr}-${String(seq).padStart(3, '0')}`;
}

/**
 * Generate a purchase request number
 */
export function generatePRNumber(seq) {
  const d = new Date();
  const dateStr = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
  return `PR-${dateStr}-${String(seq).padStart(3, '0')}`;
}

/**
 * Movement code labels
 */
export const MOVEMENT_CODES = {
  KS: { label: 'Kitchen → Shop', source: 'Kitchen', destination: 'Shop' },
  SK: { label: 'Store → Kitchen', source: 'Store', destination: 'Kitchen' },
  SSH: { label: 'Store → Shop', source: 'Store', destination: 'Shop' },
};

/**
 * Format a date for display
 */
export function formatDateCode(date) {
  const d = new Date(date);
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
}
