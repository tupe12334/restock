/*
 * split-plan: pure planner that splits an order across stores at the lowest total cost.
 * Plain ES module. No DOM, no imports. Tested in test/split-plan.test.mjs.
 */

export const DEFAULT_MAX_STORES = 2;
export const MAX_STORES_LIMIT = 3;
const EPSILON = 1e-9;
const DEFAULT_DELIVERY_FEE = 30;
const STORE_ID = /^[a-z][a-z0-9_-]*$/;

/** Default store settings. Config and saved browser values override these. */
export const STORE_DEFAULTS = {
  victory: { name: 'ויקטורי', deliveryFee: DEFAULT_DELIVERY_FEE, minOrder: 0, enabled: true },
  ramilevy: { name: 'רמי לוי', deliveryFee: DEFAULT_DELIVERY_FEE, minOrder: 0, enabled: true },
  shufersal: { name: 'שופרסל', deliveryFee: DEFAULT_DELIVERY_FEE, minOrder: 0, enabled: true },
  yochananof: { name: 'יוחננוף', deliveryFee: DEFAULT_DELIVERY_FEE, minOrder: 0, enabled: true },
  hazihinam: { name: 'חצי חינם', deliveryFee: DEFAULT_DELIVERY_FEE, minOrder: 0, enabled: true },
  tivtaam: { name: 'טיב טעם', deliveryFee: 29.9, minOrder: 0, enabled: true },
};

/** Return true for a finite amount of 0 or more. */
const isAmount = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** Return a money text such as ₪7.00. */
export const formatMoney = (amount) => `₪${Number(amount).toFixed(2)}`;

/**
 * Return the store settings: {id: {name, deliveryFee, minOrder, enabled}}.
 * Layers: STORE_DEFAULTS, then the config setting (the stores map), then saved, a {id: {deliveryFee, minOrder}} map from the browser.
 * Throws for an invalid config setting. Invalid saved values are ignored.
 */
export function storesOf(setting, saved = {}) {
  if (setting !== undefined && setting !== null && (typeof setting !== 'object' || Array.isArray(setting))) {
    throw new Error('restock-card: "stores" must be a map of store id to settings');
  }
  const config = setting ?? {};
  const ids = [...new Set([...Object.keys(STORE_DEFAULTS), ...Object.keys(config)])].sort();
  const out = {};
  for (const id of ids) {
    if (!STORE_ID.test(id)) throw new Error(`restock-card: store id must be one lowercase word, got "${id}"`);
    const base = {
      ...(STORE_DEFAULTS[id] ?? { name: id, deliveryFee: DEFAULT_DELIVERY_FEE, minOrder: 0, enabled: true }),
    };
    const given = config[id] ?? {};
    if (typeof given !== 'object' || Array.isArray(given)) {
      throw new Error(`restock-card: stores.${id} must be an object`);
    }
    if (given.name !== undefined) {
      const name = String(given.name).trim();
      if (!name) throw new Error(`restock-card: stores.${id}.name must not be empty`);
      base.name = name;
    }
    if (given.deliveryFee !== undefined) {
      if (!isAmount(given.deliveryFee)) throw new Error(`restock-card: stores.${id}.deliveryFee must be 0 or more`);
      base.deliveryFee = given.deliveryFee;
    }
    if (given.minOrder !== undefined) {
      if (!isAmount(given.minOrder)) throw new Error(`restock-card: stores.${id}.minOrder must be 0 or more`);
      base.minOrder = given.minOrder;
    }
    if (given.enabled !== undefined) {
      if (typeof given.enabled !== 'boolean') throw new Error(`restock-card: stores.${id}.enabled must be true or false`);
      base.enabled = given.enabled;
    }
    const kept = saved?.[id] ?? {};
    if (isAmount(kept.deliveryFee)) base.deliveryFee = kept.deliveryFee;
    if (isAmount(kept.minOrder)) base.minOrder = kept.minOrder;
    out[id] = base;
  }
  return out;
}

/** Return the split_max_stores setting: 2 for undefined, else an integer from 1 to 3. Anything else throws. */
export function splitMaxStoresOf(setting) {
  if (setting === undefined || setting === null) return DEFAULT_MAX_STORES;
  const n = Number(setting);
  if (!Number.isInteger(n) || n < 1 || n > MAX_STORES_LIMIT) {
    throw new Error(`restock-card: "split_max_stores" must be 1, 2 or 3, got "${setting}"`);
  }
  return n;
}

/**
 * Return the one-line plan text, such as
 * 'Best plan: Rami Levy ₪X (N items) + Shufersal ₪Y (M items) = ₪Z incl. delivery — saves ₪S vs. best single store (Rami Levy ₪T)'.
 * names maps a store id to its display name. Unknown ids show as the id.
 */
export function formatPlanSummary(plan, names = {}) {
  const nameOf = (id) => names?.[id] ?? id;
  const ids = Object.keys(plan.baskets).sort();
  if (ids.length === 0) {
    return plan.feasible ? 'No store has a price for these items.' : 'No plan. Each store misses its minimum order.';
  }
  const parts = ids.map((id) => {
    const basket = plan.baskets[id];
    return `${nameOf(id)} ${formatMoney(basket.subtotal)} (${basket.items.length} items)`;
  });
  let text = `Best plan: ${parts.join(' + ')} = ${formatMoney(plan.total)} incl. delivery`;
  if (plan.bestSingle && plan.savingsVsBestSingle !== null) {
    const single = `${nameOf(plan.bestSingle.store)} ${formatMoney(plan.bestSingle.total)}`;
    text += plan.savingsVsBestSingle > EPSILON
      ? ` — saves ${formatMoney(plan.savingsVsBestSingle)} vs. best single store (${single})`
      : ` — no split is cheaper than the best single store (${single})`;
  }
  return text;
}

/** Return true for a finite price of 0 or more. */
const isPrice = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** Round to cents, so sums of prices do not show float noise. */
const cents = (value) => Math.round(value * 100) / 100;

/** Return the price of one item at one store, or null when the store does not sell it. */
const offerOf = (item, store) => {
  if (Array.isArray(item.none) && item.none.includes(store)) return null;
  const price = item.prices?.[store];
  return isPrice(price) ? price : null;
};

/** Return the quantity of an item: a number of 1 or more. Anything else is 1. */
const quantityOf = (item) => {
  const n = Number(item.quantity);
  return Number.isInteger(n) && n >= 1 ? n : 1;
};

/** Return the delivery fee of a store, or 0 when unset or invalid. */
const feeOf = (store) => {
  const n = Number(store?.deliveryFee);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Return the minimum order of a store, or 0 when unset or invalid. */
const minOf = (store) => {
  const n = Number(store?.minOrder);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Return the store count limit: an integer of 1 or more, at most the number of enabled stores. Invalid input uses the default. */
const capOf = (maxStores, storeCount) => {
  const n = Number.isInteger(Number(maxStores)) ? Number(maxStores) : DEFAULT_MAX_STORES;
  return Math.max(1, Math.min(n, storeCount));
};

/** Return every combination of sorted ids with size 1 to cap, in a fixed order. */
const subsetsUpTo = (ids, cap) => {
  const out = [];
  const walk = (start, picked) => {
    if (picked.length > 0) out.push(picked.slice());
    if (picked.length === cap) return;
    for (let i = start; i < ids.length; i += 1) {
      picked.push(ids[i]);
      walk(i + 1, picked);
      picked.pop();
    }
  };
  walk(0, []);
  return out;
};

/**
 * Compare two plans. Lower is better. Plans that leave more sellable items unassigned lose first.
 * Then the lower total wins, then fewer stores, then the store names in order.
 */
const comparePlans = (a, b) => {
  if (a.sellableUnassigned !== b.sellableUnassigned) return a.sellableUnassigned - b.sellableUnassigned;
  if (Math.abs(a.total - b.total) > EPSILON) return a.total - b.total;
  if (a.storeIds.length !== b.storeIds.length) return a.storeIds.length - b.storeIds.length;
  const keyA = a.storeIds.join(',');
  const keyB = b.storeIds.join(',');
  if (keyA === keyB) return 0;
  return keyA < keyB ? -1 : 1;
};

/**
 * Plan the split of an order across stores.
 *
 * items: [{name, quantity, prices: {store: price|null}, none: [store]}]
 * stores: {id: {name, deliveryFee, minOrder, enabled}}. enabled false skips the store.
 * maxStores: how many stores one order may use. Default 2.
 *
 * Returns {baskets, total, unassigned, singleStoreTotals, bestSingle, savingsVsBestSingle, feasible}.
 * baskets: {store: {items: [{name, quantity, price}], subtotal, deliveryFee, total}}, only for used stores.
 * price is the unit price. total is the grand total with delivery fees.
 * singleStoreTotals: {store: total or null}. null when the store lacks an item or misses its minimum order.
 * savingsVsBestSingle: bestSingle.total - total, or null when no single store can fill the order.
 */
export function planSplit({ items = [], stores = {}, maxStores = DEFAULT_MAX_STORES } = {}) {
  const list = Array.isArray(items) ? items : [];
  const names = list.map((item) => String(item.name));
  const allIds = Object.keys(stores).sort();
  const enabled = allIds.filter((id) => stores[id]?.enabled !== false);
  const sellable = list.map((item) => enabled.some((id) => offerOf(item, id) !== null));

  /** Build the best plan that uses only the stores in subset. Returns null when the subset breaks a minimum order. */
  const buildPlan = (subset) => {
    const assign = list.map((item) => {
      let pick = null;
      for (const id of subset) {
        const price = offerOf(item, id);
        if (price !== null && (pick === null || price < pick.price)) pick = { store: id, price };
      }
      return pick ? pick.store : null;
    });

    const subtotalOf = (store) => assign.reduce(
      (sum, to, i) => (to === store ? sum + offerOf(list[i], store) * quantityOf(list[i]) : sum), 0,
    );

    // Move the cheapest-to-move items out of a store that is under its minimum order.
    for (const store of subset) {
      const min = minOf(stores[store]);
      while (min > 0) {
        const current = subtotalOf(store);
        if (current <= 0 || current >= min) break;
        let move = null;
        assign.forEach((to, i) => {
          if (to !== store) return;
          const item = list[i];
          const here = offerOf(item, store);
          for (const alt of subset) {
            if (alt === store) continue;
            const there = offerOf(item, alt);
            if (there === null) continue;
            const extra = (there - here) * quantityOf(item);
            if (move === null || extra < move.extra - EPSILON) move = { i, to: alt, extra };
          }
        });
        if (move === null) break;
        assign[move.i] = move.to;
      }
    }
    // A later move can refill a store that an earlier pass already cleared. Check every store at the end.
    for (const store of subset) {
      const left = subtotalOf(store);
      if (left > 0 && left < minOf(stores[store])) return null;
    }

    const baskets = {};
    let total = 0;
    for (const store of subset) {
      const lines = [];
      list.forEach((item, i) => {
        if (assign[i] !== store) return;
        lines.push({ name: names[i], quantity: quantityOf(item), price: offerOf(item, store) });
      });
      if (lines.length === 0) continue;
      const subtotal = cents(lines.reduce((sum, line) => sum + line.price * line.quantity, 0));
      const deliveryFee = feeOf(stores[store]);
      baskets[store] = {
        items: lines, subtotal, deliveryFee, total: cents(subtotal + deliveryFee),
      };
      total += subtotal + deliveryFee;
    }
    const used = Object.keys(baskets).sort();
    const unassigned = names.filter((_, i) => assign[i] === null);
    return {
      baskets,
      total: cents(total),
      unassigned,
      sellableUnassigned: assign.filter((to, i) => to === null && sellable[i]).length,
      storeIds: used,
    };
  };

  let best = null;
  if (list.length > 0 && enabled.length > 0) {
    for (const subset of subsetsUpTo(enabled, capOf(maxStores, enabled.length))) {
      const plan = buildPlan(subset);
      if (plan && (best === null || comparePlans(plan, best) < 0)) best = plan;
    }
  }

  const singleStoreTotals = {};
  for (const id of allIds) {
    const single = enabled.includes(id) && list.length > 0 ? buildPlan([id]) : null;
    singleStoreTotals[id] = single && single.unassigned.length === 0 ? single.total : null;
  }
  const priced = Object.entries(singleStoreTotals).filter(([, total]) => total !== null);
  const bestSingleEntry = priced.length
    ? priced.reduce((a, b) => (b[1] < a[1] - EPSILON ? b : a))
    : null;
  const bestSingle = bestSingleEntry ? { store: bestSingleEntry[0], total: bestSingleEntry[1] } : null;

  if (!best) {
    return {
      baskets: {},
      total: 0,
      unassigned: names,
      singleStoreTotals,
      bestSingle,
      savingsVsBestSingle: null,
      feasible: list.length === 0,
    };
  }

  return {
    baskets: best.baskets,
    total: best.total,
    unassigned: best.unassigned,
    singleStoreTotals,
    bestSingle,
    savingsVsBestSingle: bestSingle && best.storeIds.length > 0
      ? cents(bestSingle.total - best.total)
      : null,
    feasible: true,
  };
}

/** Return a whole-shekel text such as ₪1,411. Used by the per-store table. */
export const formatWhole = (amount) => `₪${Math.round(Number(amount)).toLocaleString('en-US')}`;

/**
 * Return one row per enabled store, cheapest total first. Each row shows what the whole order costs at that store.
 *
 * items and stores use the same shape as planSplit. A row has: store, name, itemsHave, itemsTotal, subtotal,
 * deliveryFee, total, missing, missingElsewhereTotal, belowMinimum, complete.
 * missing lists the items the store lacks: {name, quantity, cheapestStore, price, cost}. cheapestStore, price and cost
 * are null when no other enabled store sells the item. missingElsewhereTotal is the cost of the missing items at their
 * cheapest other store. complete is true when the store has every item and meets its minimum order.
 */
export function perStoreTotals(items = [], stores = {}) {
  const list = Array.isArray(items) ? items : [];
  const enabled = Object.keys(stores ?? {}).filter((id) => stores[id]?.enabled !== false).sort();
  const rows = enabled.map((id) => {
    let subtotal = 0;
    let have = 0;
    const missing = [];
    for (const item of list) {
      const price = offerOf(item, id);
      const quantity = quantityOf(item);
      if (price !== null) {
        subtotal += price * quantity;
        have += 1;
        continue;
      }
      let best = null;
      for (const alt of enabled) {
        if (alt === id) continue;
        const other = offerOf(item, alt);
        if (other !== null && (best === null || other < best.price - EPSILON)) best = { store: alt, price: other };
      }
      missing.push({
        name: String(item.name),
        quantity,
        cheapestStore: best ? best.store : null,
        price: best ? best.price : null,
        cost: best ? cents(best.price * quantity) : null,
      });
    }
    const sub = cents(subtotal);
    const fee = have > 0 ? feeOf(stores[id]) : 0;
    const belowMinimum = have > 0 && sub < minOf(stores[id]);
    const missingElsewhereTotal = cents(missing.reduce((sum, line) => sum + (line.cost ?? 0), 0));
    return {
      store: id,
      name: stores[id]?.name ?? id,
      itemsHave: have,
      itemsTotal: list.length,
      subtotal: sub,
      deliveryFee: fee,
      total: cents(sub + fee),
      missing,
      missingElsewhereTotal,
      belowMinimum,
      complete: missing.length === 0 && have > 0 && !belowMinimum,
    };
  });
  return rows.sort((a, b) => (a.total - b.total) || (a.store < b.store ? -1 : a.store > b.store ? 1 : 0));
}

/**
 * Return the inputs of the recommendation lines in the Plan order panel.
 *
 * plan is the planSplit result. rows is the perStoreTotals output. Returns {split, single, savings, offerSingle, extra}.
 * split is the plan total, or null when there is no plan. single is the cheapest complete store row, or null.
 * savings is the plan saving against the best single store. extra is single.total minus split.
 * offerSingle is true when the single store costs at most tolerance (₪) or percent of the split more.
 * The panel then asks whether to order everything at that store, so the user pays one delivery fee.
 */
export function recommendation(plan, rows = [], { tolerance = 20, percent = 0.02 } = {}) {
  const hasPlan = Boolean(plan) && Object.keys(plan.baskets ?? {}).length > 0;
  const split = hasPlan ? plan.total : null;
  const single = rows.find((row) => row.complete) ?? null;
  const savings = hasPlan && plan.savingsVsBestSingle !== null && plan.savingsVsBestSingle !== undefined
    ? plan.savingsVsBestSingle
    : null;
  let extra = null;
  let offerSingle = false;
  if (split !== null && single) {
    extra = cents(single.total - split);
    offerSingle = extra >= 0 && (extra <= tolerance + EPSILON || extra <= split * percent + EPSILON);
  }
  return { split, single, savings, offerSingle, extra };
}
