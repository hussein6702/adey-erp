// Adey ERP – Permission System
// Role-based access control for all modules

export const ROLES = {
  ADMIN: 'admin',
  GENERAL_MANAGER: 'general_manager',
  PRODUCTION_MANAGER: 'production_manager',
  SHOP_MANAGER: 'shop_manager',
  STORE_MANAGER: 'store_manager',
  SHOPKEEPER: 'shopkeeper',
  STOREKEEPER: 'storekeeper',
  KITCHEN_STAFF: 'kitchen_staff',
};

// Module permission definitions
const PERMISSIONS = {
  dashboard:        { view: ['*'] },
  product_list:     { view: ['*'], create: ['admin','general_manager','production_manager'], edit: ['admin','general_manager','production_manager'], delete: ['admin','general_manager'] },
  recipes:          { view: ['*'], create: ['admin','general_manager','production_manager'], edit: ['admin','general_manager','production_manager'], delete: ['admin','general_manager'] },
  molds:            { view: ['admin','general_manager','production_manager','kitchen_staff'], create: ['admin','general_manager','production_manager'], edit: ['admin','general_manager','production_manager'], delete: ['admin','general_manager'] },
  raw_materials:    { view: ['admin','general_manager','production_manager','store_manager','storekeeper','kitchen_staff'], create: ['admin','general_manager','store_manager'], edit: ['admin','general_manager','store_manager'], delete: ['admin','general_manager'] },
  packaging:        { view: ['admin','general_manager','store_manager','storekeeper','shop_manager'], create: ['admin','general_manager','store_manager'], edit: ['admin','general_manager','store_manager'], delete: ['admin','general_manager'] },
  request_materials:{ view: ['admin','general_manager','store_manager','kitchen_staff','production_manager'], create: ['admin','general_manager','store_manager','kitchen_staff'], approve: ['admin','general_manager','store_manager'] },
  request_packaging:{ view: ['admin','general_manager','store_manager','shop_manager'], create: ['admin','general_manager','store_manager','shop_manager'], approve: ['admin','general_manager','store_manager'] },
  grn:              { view: ['admin','general_manager','store_manager','storekeeper'], create: ['admin','general_manager','store_manager','storekeeper'], approve: ['admin','general_manager','store_manager'], delete: ['admin','general_manager'] },
  daily_production: { view: ['admin','general_manager','production_manager','kitchen_staff'], create: ['admin','general_manager','production_manager','kitchen_staff'], edit: ['admin','general_manager','production_manager'] },
  production_sheets:{ view: ['admin','general_manager','production_manager','kitchen_staff'], create: ['admin','general_manager','production_manager'], approve: ['admin','general_manager','production_manager'], edit: ['admin','general_manager','production_manager'] },
  delivery_notes:   { view: ['admin','general_manager','shop_manager','shopkeeper','production_manager'], create: ['admin','general_manager','shop_manager','production_manager'], approve: ['admin','general_manager','shop_manager'] },
  movements:        { view: ['admin','general_manager','store_manager','shop_manager','shopkeeper','storekeeper'], create: ['admin','general_manager','store_manager','shop_manager'], approve: ['admin','general_manager','store_manager','shop_manager'] },
  storefront:       { view: ['admin','general_manager','shop_manager','shopkeeper'], create: ['admin','general_manager','shop_manager'], edit: ['admin','general_manager','shop_manager'] },
  purchase_requests:{ view: ['admin','general_manager','store_manager','production_manager','shop_manager'], create: ['admin','general_manager','store_manager','production_manager','shop_manager'], approve: ['admin','general_manager'] },
  hr:               { view: ['admin','general_manager'], create: ['admin','general_manager'], edit: ['admin','general_manager'], delete: ['admin','general_manager'] },
  archive:          { view: ['admin','general_manager','production_manager','store_manager','shop_manager'], export: ['admin','general_manager','production_manager','store_manager','shop_manager'] },
};

/**
 * Check if a role has permission for a specific action on a module
 */
export function hasPermission(role, module, action = 'view') {
  const modulePerm = PERMISSIONS[module];
  if (!modulePerm) return false;
  const allowedRoles = modulePerm[action];
  if (!allowedRoles) return false;
  if (allowedRoles.includes('*')) return true;
  return allowedRoles.includes(role);
}

/**
 * Get all modules a role can access (view)
 */
export function getAccessibleModules(role) {
  return Object.keys(PERMISSIONS).filter(mod => hasPermission(role, mod, 'view'));
}

/**
 * Check if role can perform any action on a module
 */
export function canAccess(role, module) {
  return hasPermission(role, module, 'view');
}
