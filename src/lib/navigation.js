export const DEPARTMENTS = [
  { key: "kitchen", label: "Kitchen" },
  { key: "store", label: "Store" },
  { key: "shop", label: "Shop" },
  { key: "general", label: "General Staff" },
];

export const NAV_SECTIONS = [
  {
    group: "Overview",
    links: [{ key: "dashboard", label: "Dashboard", href: "/dashboard" }],
  },
  {
    group: "Inventory",
    links: [
      { key: "inventory-store-stock", label: "All Materials", href: "/inventory/store-stock" },
      { key: "inventory-packaging", label: "Packaging", href: "/inventory/packaging" },
      { key: "inventory-suppliers", label: "Suppliers", href: "/inventory/suppliers" },
    ],
  },
  {
    group: "Forms",
    links: [
      { key: "forms-grns", label: "GRNs", href: "/inventory/grns" },
      { key: "forms-delivery-note", label: "Delivery Note", href: "/inventory/delivery-note" },
      { key: "forms-purchase-requests", label: "Purchase Requests", href: "/inventory/purchase-requests" },
      { key: "forms-daily-production-log", label: "Daily Production Log", href: "/kitchen/daily-production-log" },
      { key: "forms-production-sheet", label: "Production Sheet", href: "/kitchen/production-sheet" },
    ],
  },
  {
    group: "Products",
    links: [
      { key: "products-list", label: "Products List", href: "/products/list" },
      { key: "products-recipes", label: "Recipes", href: "/products/recipes" },
      { key: "products-molds", label: "Molds", href: "/products/molds" },
    ],
  },
  {
    group: "Kitchen",
    links: [{ key: "kitchen-inventory", label: "Kitchen Inventory", href: "/kitchen/inventory" }],
  },
  {
    group: "Shop",
    links: [{ key: "shop-inventory", label: "Shop Inventory", href: "/shop/stock" }],
  },
  {
    group: "HR",
    links: [
      { key: "hr-staff", label: "Staff", href: "/hr/staff" },
      { key: "hr-checklists", label: "Checklists", href: "/hr/checklists" },
    ],
  },
  {
    group: "Settings",
    links: [
      { key: "settings-access-control", label: "Access Control", href: "/settings/access-control" },
      { key: "settings-archive", label: "Archive", href: "/settings/archive" },
    ],
  },
  {
    group: "Analytics",
    links: [
      { key: "analytics", label: "Analytics", href: "/analytics" },
    ],
  },
];

export const ALL_LINK_KEYS = NAV_SECTIONS.flatMap((s) => s.links.map((l) => l.key));