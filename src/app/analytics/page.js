"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area,
} from "recharts";
import {
  TrendingUp,
  DollarSign,
  Package,
  Boxes,
  Users,
  Clock,
  AlertTriangle,
  Award,
  Truck,
  Activity,
  Layers,
  CalendarDays,
  Flame,
  Coins,
} from "lucide-react";

// Modern shadcn-inspired color palette
const CHART_COLORS = [
  "#10b981", // Emerald
  "#6366f1", // Indigo
  "#0ea5e9", // Sky
  "#f59e0b", // Amber
  "#ec4899", // Pink
  "#8b5cf6", // Purple
  "#14b8a6", // Teal
  "#f97316", // Orange
];

const CURRENCY_CONFIG = {
  USD: { label: "US Dollar ($)", symbol: "$", code: "USD" },
  AED: { label: "UAE Dirham (AED)", symbol: "AED ", code: "AED" },
  ETB: { label: "Ethiopian Birr (ETB)", symbol: "Br ", code: "ETB" },
};

const TABS = [
  { key: "inventory", label: "Inventory & Supply Analytics", icon: Boxes },
  { key: "staff", label: "Staff & Attendance Analytics", icon: Users },
];

// Shadcn Card Component Helpers
function Card({ children, className = "" }) {
  return (
    <div className={`rounded-xl border border-zinc-200/80 bg-white shadow-sm dark:border-zinc-800/90 dark:bg-zinc-950/60 ${className}`}>
      {children}
    </div>
  );
}

function CardHeader({ title, description, action, icon: Icon }) {
  return (
    <div className="flex flex-col gap-2 p-5 pb-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />}
          <h3 className="font-semibold text-sm tracking-tight text-zinc-900 dark:text-zinc-100">{title}</h3>
        </div>
        {description && <p className="text-xs text-zinc-500 dark:text-zinc-400">{description}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

function CardContent({ children, className = "" }) {
  return <div className={`p-5 pt-0 ${className}`}>{children}</div>;
}

function StatCard({ title, value, description, icon: Icon, badge }) {
  return (
    <Card>
      <div className="p-5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{title}</span>
          {Icon && (
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300">
              <Icon className="h-4 w-4" />
            </div>
          )}
        </div>
        <div className="mt-2 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">{value}</div>
        {(description || badge) && (
          <div className="mt-1.5 flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            {badge && (
              <span className="inline-flex items-center rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-300">
                {badge}
              </span>
            )}
            <span className="truncate">{description}</span>
          </div>
        )}
      </div>
    </Card>
  );
}

// Shadcn Style Custom Tooltip
function CustomTooltip({ active, payload, label, prefix = "", suffix = "" }) {
  if (active && payload && payload.length) {
    const itemCurrency = payload[0].payload?.currencySymbol || prefix;
    return (
      <div className="rounded-lg border border-zinc-200 bg-white/95 px-3 py-2 text-xs shadow-md backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/95">
        <div className="font-semibold text-zinc-900 dark:text-zinc-100">{label}</div>
        <div className="mt-1 flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: payload[0].fill || payload[0].stroke || "#10b981" }} />
          <span>{payload[0].name || "Value"}:</span>
          <span className="font-mono font-bold text-zinc-900 dark:text-zinc-50">
            {itemCurrency}{Number(payload[0].value).toLocaleString(undefined, { maximumFractionDigits: 2 })}{suffix}
          </span>
        </div>
      </div>
    );
  }
  return null;
}

// ────────────────────────────────────────────────────────────
// INVENTORY ANALYTICS TAB
// ────────────────────────────────────────────────────────────
function InventoryAnalytics() {
  const [loading, setLoading] = useState(true);
  const [priceTrend, setPriceTrend] = useState([]);
  const [topUsed, setTopUsed] = useState([]);
  const [topExpensive, setTopExpensive] = useState([]);
  const [topProduced, setTopProduced] = useState([]);
  const [supplierSpendData, setSupplierSpendData] = useState({ USD: [], AED: [], ETB: [] });
  const [currencyTotals, setCurrencyTotals] = useState({ USD: 0, AED: 0, ETB: 0 });
  const [selectedCurrency, setSelectedCurrency] = useState("USD"); // USD | AED | ETB
  const [selectedItem, setSelectedItem] = useState(null);
  const [allItems, setAllItems] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [
      { data: grnItems },
      { data: psIngredients },
      { data: productionSheets },
      { data: items },
      { data: grns },
      { data: sups },
    ] = await Promise.all([
      supabase.from("grn_items").select("*, items(name,unit), supplier:suppliers(name), grns(doc_number,grn_date,currency,is_voided)").order("id"),
      supabase.from("production_sheet_ingredients").select("*, item:items(name,unit)"),
      supabase.from("production_sheets").select("*, recipe:recipes(name,product:products(name))").order("created_at"),
      supabase.from("items").select("id,name,unit,supplier:suppliers(name)").order("name"),
      supabase.from("grns").select("id,doc_number,grn_date,currency,total,supplier:suppliers(name),is_voided,grn_items(*,supplier:suppliers(name),items(name,supplier:suppliers(name)))").eq("is_voided", false).order("grn_date"),
      supabase.from("suppliers").select("id,name"),
    ]);

    const supMap = {};
    for (const s of sups || []) supMap[s.id] = s.name;

    setAllItems(items || []);

    // 1. Top used items from production sheet ingredients
    const usageMap = {};
    for (const pi of psIngredients || []) {
      if (!pi.item_id) continue;
      const itName = pi.item?.name || pi.item_id;
      if (!usageMap[pi.item_id]) usageMap[pi.item_id] = { name: itName, total: 0, unit: pi.item?.unit || "g" };
      usageMap[pi.item_id].total += Number(pi.quantity) || 0;
    }
    const topUsedArr = Object.values(usageMap).sort((a, b) => b.total - a.total).slice(0, 8);
    setTopUsed(topUsedArr);
    if (topUsedArr[0] && !selectedItem) {
      setSelectedItem(items?.find((i) => i.name === topUsedArr[0].name)?.id || items?.[0]?.id || null);
    } else if (!selectedItem && items?.[0]?.id) {
      setSelectedItem(items[0].id);
    }

    // 2. Most expensive items (latest price per unit)
    const latestPrice = {};
    for (const gi of grnItems || []) {
      if (gi.grns?.is_voided) continue;
      const id = gi.item_id;
      if (!latestPrice[id] || (gi.grns?.grn_date || "") >= (latestPrice[id].date || "")) {
        latestPrice[id] = {
          name: gi.items?.name || id,
          price: Number(gi.price_per_unit) || 0,
          unit: gi.unit,
          currency: gi.grns?.currency || "USD",
          date: gi.grns?.grn_date,
        };
      }
    }
    const topExpArr = Object.values(latestPrice).sort((a, b) => b.price - a.price).slice(0, 8);
    setTopExpensive(topExpArr);

    // 3. Most produced products
    const producedMap = {};
    for (const ps of productionSheets || []) {
      const name = ps.recipe?.product?.name || ps.recipe?.name || "Product";
      if (!producedMap[name]) producedMap[name] = 0;
      producedMap[name] += Number(ps.actual_yield) || 0;
    }
    setTopProduced(Object.entries(producedMap).map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty).slice(0, 6));

    // 4. Supplier spend breakdown grouped strictly by currency (USD, AED, ETB - NO conversion)
    const spendByCurr = { USD: {}, AED: {}, ETB: {} };
    const totalsByCurr = { USD: 0, AED: 0, ETB: 0 };

    for (const g of grns || []) {
      const curr = (g.currency || "USD").toUpperCase();
      const targetCurr = spendByCurr[curr] ? curr : "USD";

      for (const li of g.grn_items || []) {
        const supName =
          li.supplier?.name ||
          (li.supplier_id && supMap[li.supplier_id]) ||
          g.supplier?.name ||
          li.items?.supplier?.name ||
          "Direct Supplier";

        const lineCost = Number(li.line_total) || 0;
        spendByCurr[targetCurr][supName] = (spendByCurr[targetCurr][supName] || 0) + lineCost;
        totalsByCurr[targetCurr] += lineCost;
      }
    }

    const formattedSpend = {
      USD: Object.entries(spendByCurr.USD).map(([name, spend]) => ({ name, spend })).sort((a, b) => b.spend - a.spend),
      AED: Object.entries(spendByCurr.AED).map(([name, spend]) => ({ name, spend })).sort((a, b) => b.spend - a.spend),
      ETB: Object.entries(spendByCurr.ETB).map(([name, spend]) => ({ name, spend })).sort((a, b) => b.spend - a.spend),
    };

    setSupplierSpendData(formattedSpend);
    setCurrencyTotals(totalsByCurr);

    setLoading(false);
  }, []);

  // Price trend for selected item
  const loadPriceTrend = useCallback(async (itemId) => {
    if (!itemId) return;
    const { data } = await supabase
      .from("grn_items")
      .select("price_per_unit, unit, grns(grn_date, doc_number, currency, is_voided)")
      .eq("item_id", itemId)
      .order("grns(grn_date)");
    const filtered = (data || []).filter((d) => !d.grns?.is_voided && d.grns?.grn_date);
    setPriceTrend(
      filtered.map((d) => {
        const curr = d.grns?.currency || "USD";
        const symbol = CURRENCY_CONFIG[curr]?.symbol || "$";
        return {
          date: new Date(d.grns.grn_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          price: Number(d.price_per_unit) || 0,
          currency: curr,
          currencySymbol: symbol,
          grn: `#${d.grns?.doc_number}`,
        };
      })
    );
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (selectedItem) loadPriceTrend(selectedItem); }, [selectedItem, loadPriceTrend]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-zinc-400">
        <Activity className="mr-2 h-4 w-4 animate-spin text-zinc-500" />
        Loading analytics metrics…
      </div>
    );
  }

  const activeCurrencyConfig = CURRENCY_CONFIG[selectedCurrency] || CURRENCY_CONFIG.USD;
  const currentCurrencySuppliers = supplierSpendData[selectedCurrency] || [];
  const totalProductionYield = topProduced.reduce((s, x) => s + x.qty, 0);

  return (
    <div className="space-y-6">
      {/* 4 Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Most Consumed Material"
          value={topUsed[0]?.name || "—"}
          description={topUsed[0] ? `${topUsed[0].total.toLocaleString()} g total consumption` : "No production logs"}
          icon={Flame}
          badge="Top Volume"
        />
        <StatCard
          title="Top Value Material"
          value={topExpensive[0] ? `${CURRENCY_CONFIG[topExpensive[0].currency]?.symbol || "$"}${topExpensive[0].price}` : "—"}
          description={topExpensive[0] ? `${topExpensive[0].name} per ${topExpensive[0].unit}` : "No price logs"}
          icon={DollarSign}
        />
        <StatCard
          title="Total Finished Output"
          value={totalProductionYield.toLocaleString()}
          description={topProduced[0] ? `Top: ${topProduced[0].name} (${topProduced[0].qty} pcs)` : "Output yield"}
          icon={Package}
          badge="Good Yield"
        />
        <StatCard
          title="Total Supplier Spend (USD)"
          value={`$${currencyTotals.USD.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          description={`AED ${currencyTotals.AED.toLocaleString(undefined, { maximumFractionDigits: 0 })} · Br ${currencyTotals.ETB.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          icon={Coins}
          badge="3 Currencies"
        />
      </div>

      {/* Interactive Price Trend Area Chart */}
      <Card>
        <CardHeader
          title="Price Fluctuations & Trends"
          description="Track cost per unit of materials purchased through verified Goods Received Notes"
          icon={TrendingUp}
          action={
            <select
              className="h-8 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 text-xs font-medium text-zinc-800 transition-colors focus:border-zinc-400 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
              value={selectedItem || ""}
              onChange={(e) => setSelectedItem(e.target.value)}
            >
              {allItems.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.unit})
                </option>
              ))}
            </select>
          }
        />
        <CardContent>
          {priceTrend.length > 0 ? (
            <div className="h-64 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={priceTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="stroke-zinc-200/70 dark:stroke-zinc-800/70" />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#71717a" }} dy={8} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#71717a" }} />
                  <Tooltip content={<CustomTooltip suffix=" / unit" />} />
                  <Area type="monotone" dataKey="price" stroke="#10b981" strokeWidth={2} fill="url(#priceGradient)" dot={{ r: 3, fill: "#10b981" }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-48 flex-col items-center justify-center text-xs text-zinc-400">
              <Package className="mb-2 h-8 w-8 text-zinc-300 dark:text-zinc-700" />
              No historical GRN purchase data recorded for this item yet
            </div>
          )}
        </CardContent>
      </Card>

      {/* Grid: Most Used Raw Materials + Most Expensive */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Top Consumed Materials"
            description="Total quantity (in grams) used in finished production sheets"
            icon={Layers}
          />
          <CardContent>
            {topUsed.length > 0 ? (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topUsed} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="currentColor" className="stroke-zinc-200/70 dark:stroke-zinc-800/70" />
                    <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#71717a" }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#71717a" }} width={100} />
                    <Tooltip content={<CustomTooltip suffix=" g consumed" />} />
                    <Bar dataKey="total" radius={[0, 4, 4, 0]}>
                      {topUsed.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-48 items-center justify-center text-xs text-zinc-400">No production logs available</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title="Highest Unit Cost Items"
            description="Latest recorded purchase price per unit from incoming GRNs"
            icon={Award}
          />
          <CardContent>
            {topExpensive.length > 0 ? (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topExpensive} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="currentColor" className="stroke-zinc-200/70 dark:stroke-zinc-800/70" />
                    <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#71717a" }} />
                    <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#71717a" }} width={100} />
                    <Tooltip content={<CustomTooltip suffix=" / unit" />} />
                    <Bar dataKey="price" radius={[0, 4, 4, 0]}>
                      {topExpensive.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[(i + 2) % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-48 items-center justify-center text-xs text-zinc-400">No price records available</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Grid: Most Produced Products + Filterable Currency Supplier Spend */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Production Share by Product"
            description="Cumulative good units produced across all completed production runs"
            icon={Package}
          />
          <CardContent>
            {topProduced.length > 0 ? (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={topProduced}
                      dataKey="qty"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      innerRadius={45}
                      paddingAngle={4}
                      label={({ name, percent }) => `${name.slice(0, 10)} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {topProduced.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip suffix=" units" />} />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-48 items-center justify-center text-xs text-zinc-400">No production sheets found</div>
            )}
          </CardContent>
        </Card>

        {/* Currency Filterable Supplier Spend Card */}
        <Card>
          <CardHeader
            title="Supplier Spend by Currency"
            description={`Procurement value filtered by original currency (No conversions)`}
            icon={Truck}
            action={
              <div className="inline-flex h-8 items-center rounded-lg bg-zinc-100 p-0.5 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                {Object.keys(CURRENCY_CONFIG).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setSelectedCurrency(c)}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
                      selectedCurrency === c
                        ? "bg-white text-zinc-950 shadow-sm dark:bg-zinc-950 dark:text-zinc-50"
                        : "hover:text-zinc-900 dark:hover:text-zinc-100"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            }
          />
          <CardContent>
            {/* Quick Currency Summary Pills */}
            <div className="mb-4 grid grid-cols-3 gap-2 border-b border-zinc-100 pb-3 text-center dark:border-zinc-800">
              <div className={`rounded-lg p-2 transition-colors ${selectedCurrency === "USD" ? "bg-emerald-50 dark:bg-emerald-950/40" : "bg-zinc-50 dark:bg-zinc-900/50"}`}>
                <div className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">US Dollars</div>
                <div className="mt-0.5 font-mono text-xs font-bold text-zinc-900 dark:text-zinc-100">
                  ${currencyTotals.USD.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
              </div>
              <div className={`rounded-lg p-2 transition-colors ${selectedCurrency === "AED" ? "bg-emerald-50 dark:bg-emerald-950/40" : "bg-zinc-50 dark:bg-zinc-900/50"}`}>
                <div className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Dirham</div>
                <div className="mt-0.5 font-mono text-xs font-bold text-zinc-900 dark:text-zinc-100">
                  AED {currencyTotals.AED.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
              </div>
              <div className={`rounded-lg p-2 transition-colors ${selectedCurrency === "ETB" ? "bg-emerald-50 dark:bg-emerald-950/40" : "bg-zinc-50 dark:bg-zinc-900/50"}`}>
                <div className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Birr (ETB)</div>
                <div className="mt-0.5 font-mono text-xs font-bold text-zinc-900 dark:text-zinc-100">
                  Br {currencyTotals.ETB.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
              </div>
            </div>

            {currentCurrencySuppliers.length > 0 ? (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={currentCurrencySuppliers.slice(0, 5)} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="currentColor" className="stroke-zinc-200/70 dark:stroke-zinc-800/70" />
                    <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#71717a" }} tickFormatter={(v) => `${activeCurrencyConfig.symbol}${v.toLocaleString()}`} />
                    <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#71717a" }} width={110} />
                    <Tooltip content={<CustomTooltip prefix={activeCurrencyConfig.symbol} />} />
                    <Bar dataKey="spend" radius={[0, 4, 4, 0]}>
                      {currentCurrencySuppliers.slice(0, 5).map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[(i + 4) % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-52 flex-col items-center justify-center text-xs text-zinc-400">
                <Truck className="mb-2 h-7 w-7 text-zinc-300 dark:text-zinc-700" />
                No procurement spend recorded in {activeCurrencyConfig.label} yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// STAFF ANALYTICS TAB
// ────────────────────────────────────────────────────────────
function StaffAnalytics() {
  const [loading, setLoading] = useState(true);
  const [absenceRanking, setAbsenceRanking] = useState([]);
  const [latenessTrend, setLatenessTrend] = useState([]);
  const [sickData, setSickData] = useState([]);
  const [vacationData, setVacationData] = useState([]);
  const [statusBreakdown, setStatusBreakdown] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [staffTrend, setStaffTrend] = useState([]);

  const SICK_ALLOWANCE = 10;
  const VACATION_ALLOWANCE = 15;

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: users }, { data: logs }] = await Promise.all([
      supabase.from("users").select("id,full_name,username,department,is_active").order("full_name"),
      supabase.from("attendance_logs").select("user_id,date,status,late_minutes").order("date"),
    ]);

    const staff = (users || []).filter((u) => u.is_active !== false);
    setStaffList(staff);
    if (staff[0] && !selectedStaff) setSelectedStaff(staff[0].id);

    const logsArr = logs || [];

    // Absence ranking
    const absMap = {};
    const lateMap = {};
    const sickMap = {};
    const vacMap = {};
    for (const s of staff) {
      absMap[s.id] = { name: s.full_name || s.username, count: 0 };
      lateMap[s.id] = { name: s.full_name || s.username, count: 0, totalMins: 0 };
      sickMap[s.id] = { name: s.full_name || s.username, count: 0 };
      vacMap[s.id] = { name: s.full_name || s.username, count: 0 };
    }
    for (const log of logsArr) {
      if (log.status === "absent" && absMap[log.user_id]) absMap[log.user_id].count++;
      if (log.status === "late" && lateMap[log.user_id]) {
        lateMap[log.user_id].count++;
        lateMap[log.user_id].totalMins += Number(log.late_minutes) || 0;
      }
      if (log.status === "sick" && sickMap[log.user_id]) sickMap[log.user_id].count++;
      if (log.status === "vacation" && vacMap[log.user_id]) vacMap[log.user_id].count++;
    }

    setAbsenceRanking(Object.values(absMap).sort((a, b) => b.count - a.count).slice(0, 8));
    setSickData(Object.values(sickMap).map((s) => ({ ...s, remaining: Math.max(0, SICK_ALLOWANCE - s.count) })).sort((a, b) => b.count - a.count));
    setVacationData(Object.values(vacMap).map((s) => ({ ...s, remaining: Math.max(0, VACATION_ALLOWANCE - s.count) })).sort((a, b) => b.count - a.count));

    // Overall status breakdown
    const statusCount = { present: 0, late: 0, absent: 0, sick: 0, vacation: 0 };
    for (const log of logsArr) if (statusCount[log.status] !== undefined) statusCount[log.status]++;
    setStatusBreakdown(
      Object.entries(statusCount)
        .filter(([, v]) => v > 0)
        .map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value }))
    );

    // 12-week Lateness Trend
    const weekMap = {};
    const now = new Date();
    for (let w = 11; w >= 0; w--) {
      const d = new Date(now);
      d.setDate(d.getDate() - w * 7);
      const key = `${d.getMonth() + 1}/${d.getDate()}`;
      weekMap[key] = { week: key, lateCount: 0, lateMinutes: 0 };
    }
    for (const log of logsArr) {
      if (log.status !== "late") continue;
      const d = new Date(log.date);
      const diff = Math.floor((now - d) / (7 * 24 * 60 * 60 * 1000));
      if (diff <= 11) {
        const key = Object.keys(weekMap)[11 - diff];
        if (key && weekMap[key]) {
          weekMap[key].lateCount++;
          weekMap[key].lateMinutes += Number(log.late_minutes) || 0;
        }
      }
    }
    setLatenessTrend(Object.values(weekMap));

    setLoading(false);
  }, []);

  const loadStaffTrend = useCallback(async (staffId) => {
    if (!staffId) return;
    const { data } = await supabase
      .from("attendance_logs")
      .select("date,status,late_minutes")
      .eq("user_id", staffId)
      .order("date", { ascending: false })
      .limit(30);

    const byDay = (data || [])
      .map((d) => ({
        date: new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        late_minutes: d.status === "late" ? Number(d.late_minutes) || 0 : 0,
        status: d.status,
      }))
      .reverse();
    setStaffTrend(byDay);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (selectedStaff) loadStaffTrend(selectedStaff); }, [selectedStaff, loadStaffTrend]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-zinc-400">
        <Activity className="mr-2 h-4 w-4 animate-spin text-zinc-500" />
        Loading HR & attendance metrics…
      </div>
    );
  }

  const STATUS_COLORS = { Present: "#10b981", Late: "#0ea5e9", Absent: "#f97316", Sick: "#eab308", Vacation: "#8b5cf6" };
  const totalLogs = statusBreakdown.reduce((s, x) => s + x.value, 0);
  const absentTotal = absenceRanking.reduce((s, x) => s + x.count, 0);
  const lateTotal = latenessTrend.reduce((s, x) => s + x.lateCount, 0);

  return (
    <div className="space-y-6">
      {/* 4 Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Absence Logs"
          value={absentTotal}
          description="Cumulative across all staff"
          icon={AlertTriangle}
          badge="Absence"
        />
        <StatCard
          title="Late Events (12 Wks)"
          value={lateTotal}
          description="Recorded late arrival incidents"
          icon={Clock}
        />
        <StatCard
          title="Active Staff Team"
          value={staffList.length}
          description="Staff across all departments"
          icon={Users}
          badge="Headcount"
        />
        <StatCard
          title="Total Attendance Checks"
          value={totalLogs.toLocaleString()}
          description="All recorded attendance days"
          icon={CalendarDays}
        />
      </div>

      {/* Grid: Overall Breakdown & Most Absent Staff */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Attendance Distribution"
            description="Overall proportion of present, late, absent, sick, and vacation days"
            icon={Activity}
          />
          <CardContent>
            {statusBreakdown.length > 0 ? (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusBreakdown}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      innerRadius={45}
                      paddingAngle={4}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {statusBreakdown.map((entry) => (
                        <Cell key={entry.name} fill={STATUS_COLORS[entry.name] || "#71717a"} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip suffix=" days" />} />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-48 items-center justify-center text-xs text-zinc-400">No attendance data found</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title="Most Absent Team Members"
            description="Ranked by total recorded unexcused absence days"
            icon={AlertTriangle}
          />
          <CardContent>
            {absenceRanking.filter((x) => x.count > 0).length > 0 ? (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={absenceRanking.filter((x) => x.count > 0)} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="currentColor" className="stroke-zinc-200/70 dark:stroke-zinc-800/70" />
                    <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#71717a" }} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#71717a" }} width={100} />
                    <Tooltip content={<CustomTooltip suffix=" days absent" />} />
                    <Bar dataKey="count" fill="#f97316" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-48 items-center justify-center text-xs text-zinc-400">No absences recorded</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Lateness Trend Area Chart */}
      <Card>
        <CardHeader
          title="Team Lateness Trend (Last 12 Weeks)"
          description="Frequency of late check-ins over the previous 12-week window"
          icon={Clock}
        />
        <CardContent>
          {latenessTrend.some((w) => w.lateCount > 0) ? (
            <div className="h-56 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={latenessTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="lateGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="stroke-zinc-200/70 dark:stroke-zinc-800/70" />
                  <XAxis dataKey="week" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#71717a" }} dy={8} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#71717a" }} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip suffix=" late incidents" />} />
                  <Area type="monotone" dataKey="lateCount" stroke="#0ea5e9" strokeWidth={2} fill="url(#lateGrad)" dot={{ r: 3, fill: "#0ea5e9" }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-40 items-center justify-center text-xs text-zinc-400">No late incidents in the last 12 weeks</div>
          )}
        </CardContent>
      </Card>

      {/* Per-Staff Daily Drilldown */}
      <Card>
        <CardHeader
          title="Individual Staff Lateness History"
          description="View daily lateness duration in minutes over the past 30 logged work days"
          icon={Users}
          action={
            <select
              className="h-8 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 text-xs font-medium text-zinc-800 transition-colors focus:border-zinc-400 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
              value={selectedStaff || ""}
              onChange={(e) => setSelectedStaff(e.target.value)}
            >
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name || s.username} ({s.department || "General"})
                </option>
              ))}
            </select>
          }
        />
        <CardContent>
          {staffTrend.length > 0 ? (
            <div className="h-52 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={staffTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="stroke-zinc-200/70 dark:stroke-zinc-800/70" />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#71717a" }} dy={8} interval={2} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#71717a" }} />
                  <Tooltip content={<CustomTooltip suffix=" minutes late" />} />
                  <Bar dataKey="late_minutes" fill="#0ea5e9" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-36 items-center justify-center text-xs text-zinc-400">No attendance data for this staff member</div>
          )}
        </CardContent>
      </Card>

      {/* Sick & Vacation Allowance Cards */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {[
          { title: "Sick Day Allowance", data: sickData, allowance: SICK_ALLOWANCE, color: "bg-amber-400" },
          { title: "Vacation Allowance", data: vacationData, allowance: VACATION_ALLOWANCE, color: "bg-purple-500" },
        ].map(({ title, data, allowance, color }) => (
          <Card key={title}>
            <CardHeader title={title} description={`Standard annual entitlement: ${allowance} days`} icon={CalendarDays} />
            <CardContent>
              <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                {data.filter((d) => d.count > 0).length === 0 ? (
                  <div className="py-8 text-center text-xs text-zinc-400">No days utilized across team</div>
                ) : (
                  data
                    .filter((d) => d.count > 0)
                    .map((d, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-28 shrink-0 truncate text-xs font-medium text-zinc-800 dark:text-zinc-200">{d.name}</div>
                        <div className="flex-1">
                          <div className="flex h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                            <div className={`${color} h-full rounded-full transition-all`} style={{ width: `${Math.min(100, (d.count / allowance) * 100)}%` }} />
                          </div>
                        </div>
                        <div className="w-24 text-right font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                          {d.count}/{allowance} ({d.remaining} left)
                        </div>
                      </div>
                    ))
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// MAIN PAGE
// ────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState("inventory");

  return (
    <div className="p-4 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Analytics</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Real-time procurement trends, production yield statistics, and workforce attendance analytics.
          </p>
        </div>

        {/* Segmented Switcher (Shadcn Tabs style) */}
        <div className="inline-flex h-9 items-center justify-center rounded-lg bg-zinc-100 p-1 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
          {TABS.map((tab) => {
            const TabIcon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-all ${
                  isActive
                    ? "bg-white text-zinc-950 shadow-sm dark:bg-zinc-950 dark:text-zinc-50"
                    : "hover:text-zinc-900 dark:hover:text-zinc-100"
                }`}
              >
                <TabIcon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === "inventory" && <InventoryAnalytics />}
      {activeTab === "staff" && <StaffAnalytics />}
    </div>
  );
}
