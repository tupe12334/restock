/*
 * restock-card: Lovelace card that adds household items to a shopping list.
 * Plain ES module. No build step. One local import: the order split planner.
 */
import {
  planSplit, storesOf, splitMaxStoresOf, formatPlanSummary, MAX_STORES_LIMIT,
  perStoreTotals, recommendation, formatWhole, formatMoney,
} from './split-plan.js?v=18';

const FALLBACK_ICON = '🛒';
const OTHER = 'Other';
const CATALOG_DEFAULT = 'todo.home_items';
const SHOPPING_DEFAULT = 'todo.to_order';
const CARD_TYPE = 'restock-card';
const LONG_PRESS_MS = 500;
const PENDING_MS = 5000;
const ERROR_MS = 8000;
const SET_DESCRIPTION_ON_ITEM = 64;
const CAPABILITY_WARNING = "This list can't store quantity or details. Use a Local To-do list (Settings → Devices & services → Add integration → Local To-do).";
const STORE_SUGGESTIONS = ['victory', 'shufersal', 'ramilevy', 'yochananof', 'carrefour'];
const DEALS_DEFAULT = '/local/restock-deals.json';
const PRICES_DEFAULT = '/local/restock-prices.json';
const SPLIT_KEY = 'restock-card.split'; // localStorage key of the Plan order settings
const DEALS_REFRESH_MS = 6 * 60 * 60 * 1000;

// Keyword -> emoji. Keys are lowercase. Longest key wins (see sort below).
const ICON_ENTRIES = [
  ['milk', '🥛'], ['חלב', '🥛'],
  ['yogurt', '🥛'], ['יוגורט', '🥛'],
  ['egg', '🥚'], ['ביצ', '🥚'],
  ['bread', '🍞'], ['לחם', '🍞'],
  ['cheese', '🧀'], ['גבינ', '🧀'],
  ['butter', '🧈'], ['חמאה', '🧈'],
  ['coffee', '☕'], ['קפה', '☕'],
  ['tea', '🍵'], ['תה', '🍵'],
  ['sugar', '🍬'], ['סוכר', '🍬'],
  ['salt', '🧂'], ['מלח', '🧂'],
  ['oil', '🫒'], ['שמן', '🫒'],
  ['rice', '🍚'], ['אורז', '🍚'],
  ['pasta', '🍝'], ['פסטה', '🍝'],
  ['spaghetti', '🍝'],
  ['tomato', '🍅'], ['עגבני', '🍅'],
  ['cucumber', '🥒'], ['מלפפון', '🥒'],
  ['potato', '🥔'], ['תפוח אדמה', '🥔'],
  ['onion', '🧅'], ['בצל', '🧅'],
  ['garlic', '🧄'], ['שום', '🧄'],
  ['apple', '🍎'], ['תפוח', '🍎'],
  ['banana', '🍌'], ['בננ', '🍌'],
  ['lemon', '🍋'], ['לימון', '🍋'],
  ['orange', '🍊'], ['תפוז', '🍊'],
  ['strawberr', '🍓'], ['תות', '🍓'],
  ['chicken', '🍗'], ['עוף', '🍗'],
  ['meat', '🥩'], ['בשר', '🥩'],
  ['steak', '🥩'],
  ['fish', '🐟'], ['salmon', '🐟'], ['דג', '🐟'],
  ['water', '💧'], ['מים', '💧'],
  ['juice', '🧃'], ['מיץ', '🧃'],
  ['wine', '🍷'], ['יין', '🍷'],
  ['beer', '🍺'], ['בירה', '🍺'],
  ['toilet paper', '🧻'], ['נייר טואלט', '🧻'],
  ['paper towel', '🧻'], ['מגבות נייר', '🧻'],
  ['tissue', '🧻'], ['טישו', '🧻'],
  ['toilet', '🚽'],
  ['soap', '🧼'], ['סבון', '🧼'],
  ['shampoo', '🧴'], ['שמפו', '🧴'],
  ['toothpaste', '🪥'], ['משחת שיניים', '🪥'],
  ['detergent', '🧺'], ['כביסה', '🧺'],
  ['dish soap', '🧽'], ['סבון כלים', '🧽'],
  ['sponge', '🧽'], ['ספוג', '🧽'],
  ['trash bag', '🗑️'], ['garbage', '🗑️'], ['שקיות זבל', '🗑️'], ['זבל', '🗑️'],
  ['battery', '🔋'], ['batteries', '🔋'], ['סוללות', '🔋'], ['סוללה', '🔋'],
  ['light bulb', '💡'], ['bulb', '💡'], ['נורה', '💡'],
  ['diaper', '👶'], ['חיתולים', '👶'],
  ['cereal', '🥣'], ['דגני', '🥣'],
  ['honey', '🍯'], ['דבש', '🍯'],
  ['chocolate', '🍫'], ['שוקולד', '🍫'],
  ['cookie', '🍪'], ['עוגיות', '🍪'],
  ['ice cream', '🍦'], ['גלידה', '🍦'],
  ['flour', '🌾'], ['קמח', '🌾'],
  ['avocado', '🥑'], ['אבוקדו', '🥑'],
  ['carrot', '🥕'], ['גזר', '🥕'],
  ['eggplant', '🍆'], ['חציל', '🍆'],
  ['pepper', '🫑'], ['פלפל', '🫑'],
  ['lettuce', '🥬'], ['חסה', '🥬'],
  ['hummus', '🫘'], ['חומוס', '🫘'],
  ['tahini', '🥜'], ['טחינה', '🥜'],
  ['pita', '🫓'], ['פיתה', '🫓'],
  ['broccoli', '🥦'], ['ברוקולי', '🥦'],
  ['mushroom', '🍄'], ['פטריות', '🍄'],
  ['corn', '🌽'], ['תירס', '🌽'],
  ['cola', '🥤'], ['coke', '🥤'], ['pepsi', '🥤'], ['soda', '🥤'],
  ['קולה', '🥤'], ['פפסי', '🥤'], ['סודה', '🥤'],
].sort((a, b) => b[0].length - a[0].length);

const norm = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

const isTodoId = (id) => typeof id === 'string' && /^todo\.[a-z0-9_]+$/.test(id);

const oneLine = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

const lines = (text) => String(text ?? '').split(/\r?\n/);

/** Return an integer quantity of at least 1. Anything else returns 1. */
const toQuantity = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? n : 1;
};

const QUANTITY_LINE = /^\s*quantity\s*:\s*(.*?)\s*$/i;
const DETAILS_LINE = /^\s*details\s*:\s*(.*?)\s*$/i;
const PREFER_LINE = /^\s*prefer\s*:\s*(.*?)\s*$/i;
const PREFER_SEPARATOR = '>';

/** Trim brands, drop empty ones, dedupe case-insensitively. The first spelling and order are kept. */
const cleanBrands = (list) => {
  const out = [];
  const seen = new Set();
  for (const raw of list) {
    const brand = oneLine(raw);
    const key = brand.toLowerCase();
    if (!brand || seen.has(key)) continue;
    seen.add(key);
    out.push(brand);
  }
  return out;
};

/** Parse a Prefer value such as "A > B > C" into ['A', 'B', 'C']. */
export function parsePrefer(text) {
  return cleanBrands(String(text ?? '').split(PREFER_SEPARATOR));
}

/** Format brands as a Prefer value, such as 'A > B'. An empty list gives ''. */
export function formatPrefer(brands) {
  return cleanBrands(Array.isArray(brands) ? brands : []).join(` ${PREFER_SEPARATOR} `);
}

const BUY_AT_LINE = /^\s*buy\s+at\s*:\s*(.*?)\s*$/i;

/** Return the store a shopping-list entry is set to buy at, in lowercase, or '' when not set. */
export function buyAtOf(description) {
  for (const line of lines(description)) {
    const match = BUY_AT_LINE.exec(line);
    if (match) return oneLine(match[1]).toLowerCase();
  }
  return '';
}

/** Return a shopping-list description with its Buy at line set to store. An empty store removes the line. Other lines are kept. */
export function withBuyAt(description, store) {
  const name = oneLine(store).toLowerCase();
  return withLinesOf(description, BUY_AT_LINE, name ? [`Buy at: ${name}`] : []);
}

const LINK_LINE = /^\s*link\s+([a-z][a-z0-9_-]*(?:\s*\([^()]*\))?)\s*:\s*(\S.*?)\s*$/i;
const LINK_KEY = /^([a-z][a-z0-9_-]*)(?:\s*\(([^()]*)\))?$/i;
const PROVIDER_ID = /^[a-z][a-z0-9_-]*$/;

/** Return the link key of a store and an optional brand: 'victory' or 'victory (ניקול)'. The store is lowercased. An empty brand gives the plain key. */
export function linkKey(store, brand) {
  const name = oneLine(store).toLowerCase();
  const label = oneLine(brand);
  return label ? `${name} (${label})` : name;
}

/** Split a link key into {store, brand}. brand is null for a plain store key. */
export function splitLinkKey(key) {
  const text = String(key ?? '');
  const at = text.indexOf(' (');
  if (at === -1) return { store: text, brand: null };
  return { store: text.slice(0, at), brand: text.slice(at + 2, -1) };
}

/** Return the canonical link key for a raw key from a Link line, or null when it is not valid. */
const canonicalLinkKey = (raw) => {
  const match = LINK_KEY.exec(oneLine(raw));
  return match ? linkKey(match[1], match[2]) : null;
};

/** Build {key: url} from [key, url] pairs. Keys are store or store (brand). The first URL per key wins. Invalid keys and empty values are dropped. */
const linkEntries = (pairs) => {
  const out = {};
  for (const [rawKey, rawUrl] of pairs) {
    const key = canonicalLinkKey(rawKey);
    const url = oneLine(rawUrl);
    if (!key || !url || Object.hasOwn(out, key)) continue;
    out[key] = url;
  }
  return out;
};

const linkPairsOf = (text) => lines(text)
  .map((line) => LINK_LINE.exec(line))
  .filter(Boolean)
  .map((match) => [match[1], match[2]]);

/** Format a links object as Link lines, in key order. */
const formatLinks = (links) => {
  const pairs = links && typeof links === 'object' ? Object.entries(links) : [];
  return Object.entries(linkEntries(pairs)).map(([key, url]) => `Link ${key}: ${url}`);
};

/** Return the store links of a description as {key: url}, in line order. A key is store or store (brand). Works for catalog and shopping-list text. */
export function linksOf(description) {
  return linkEntries(linkPairsOf(description));
}

/** Return the store links of a description as [{store, brand, url}], in line order. brand is null for a plain store link. */
export function brandLinksOf(description) {
  return Object.entries(linksOf(description)).map(([key, url]) => ({ ...splitLinkKey(key), url }));
}

/** Return the links of one brand from a links object, as [{key, store, url}]. Brand names match case-insensitively. */
const linksOfBrand = (links, brand) => Object.entries(links)
  .filter(([key]) => {
    const { brand: keyBrand } = splitLinkKey(key);
    return keyBrand !== null && norm(keyBrand) === norm(brand);
  })
  .map(([key, url]) => ({ key, store: splitLinkKey(key).store, url }));

/** Return a links object without the links of one brand. Plain store links are kept. */
const withoutBrandLinks = (links, brand) => Object.fromEntries(
  Object.entries(links).filter(([key]) => {
    const { brand: keyBrand } = splitLinkKey(key);
    return keyBrand === null || norm(keyBrand) !== norm(brand);
  }),
);

/** Return true for an absolute https URL. */
export function isHttpsUrl(text) {
  try {
    return new URL(String(text)).protocol === 'https:';
  } catch {
    return false;
  }
}

/** Return the emoji for an item name. Longest keyword match wins. */
export function iconFor(name) {
  const key = norm(name);
  if (!key) return FALLBACK_ICON;
  for (const [keyword, icon] of ICON_ENTRIES) {
    if (key.includes(keyword)) return icon;
  }
  return FALLBACK_ICON;
}

/** Return true when a todo entity state can store item descriptions. False for a missing state. */
export function supportsDescription(stateObj) {
  if (!stateObj) return false;
  const features = Number(stateObj.attributes?.supported_features) || 0;
  return (features & SET_DESCRIPTION_ON_ITEM) !== 0;
}

/** Return the category of a catalog item. Uses the first line of its description. */
export function categoryOf(item) {
  const text = typeof item === 'string' ? item : item?.description;
  const firstLine = String(text ?? '').split(/\r?\n/)[0].trim();
  return firstLine || OTHER;
}

/** Parse a shopping-list description into {quantity, details, prefer, links, products}. buyAt is set only when the Buy at line is set. */
export function parseEntry(description) {
  let quantity;
  let details;
  let prefer;
  for (const line of lines(description)) {
    const q = QUANTITY_LINE.exec(line);
    if (q && quantity === undefined) {
      quantity = /^\d+$/.test(q[1]) ? toQuantity(Number(q[1])) : 1;
    }
    const d = DETAILS_LINE.exec(line);
    if (d && details === undefined) details = oneLine(d[1]);
    const p = PREFER_LINE.exec(line);
    if (p && prefer === undefined) prefer = parsePrefer(p[1]);
  }
  const buyAt = buyAtOf(description);
  return {
    quantity: quantity ?? 1,
    details: details ?? '',
    prefer: prefer ?? [],
    ...(buyAt ? { buyAt } : {}),
    links: linkEntries(linkPairsOf(description)),
    products: productEntries(productPairsOf(description)),
  };
}

/** Format a shopping-list description. The Details, Prefer, Buy at, Link and Product lines are omitted when empty. */
export function formatEntry({ quantity, details, prefer, buyAt, links, products } = {}) {
  const out = [`Quantity: ${toQuantity(quantity)}`];
  const text = oneLine(details);
  if (text) out.push(`Details: ${text}`);
  const brands = formatPrefer(prefer);
  if (brands) out.push(`Prefer: ${brands}`);
  const store = oneLine(buyAt).toLowerCase();
  if (store) out.push(`Buy at: ${store}`);
  out.push(...formatLinks(links));
  out.push(...formatProducts(products));
  return out.join('\n');
}

/** Return a description with the lines that match replaced by added. New lines go before an Image line, or at the end. All other lines are kept. */
const withLinesOf = (description, match, added) => {
  const rest = lines(description).filter((line) => !match.test(line));
  if (added.length === 0) return rest.join('\n');
  const image = rest.findIndex((line) => IMAGE_LINE.test(line));
  const at = image === -1 ? rest.length : image;
  return [...rest.slice(0, at), ...added, ...rest.slice(at)].join('\n');
};

/** Return a description with its Link lines replaced by links. All other lines are kept. New Link lines go before an Image line, or at the end. */
export function withLinks(description, links) {
  return withLinesOf(description, LINK_LINE, formatLinks(links));
}

const PRODUCT_LINE = /^\s*product\s+([a-z][a-z0-9_-]*)\s*:\s*(.*?)\s*$/i;
const NONE_PRODUCT = 'none';

/** Return {store: value} from Product lines, in line order. A value is a product name or 'none'. Keys are lowercase. Invalid stores and empty values are dropped. The first line per store wins. */
const productEntries = (pairs) => {
  const out = {};
  for (const [rawStore, rawValue] of pairs) {
    const store = oneLine(rawStore).toLowerCase();
    const value = oneLine(rawValue);
    if (!PROVIDER_ID.test(store) || !value || Object.hasOwn(out, store)) continue;
    out[store] = value;
  }
  return out;
};

const productPairsOf = (text) => lines(text)
  .map((line) => PRODUCT_LINE.exec(line))
  .filter(Boolean)
  .map((match) => [match[1], match[2]]);

/** Format a products object as Product lines, in key order. */
const formatProducts = (products) => {
  const pairs = products && typeof products === 'object' ? Object.entries(products) : [];
  return Object.entries(productEntries(pairs)).map(([store, value]) => `Product ${store}: ${value}`);
};

/** Return a description with its Product lines replaced by products. All other lines are kept. */
const withProducts = (description, products) => withLinesOf(description, PRODUCT_LINE, formatProducts(products));

/** Merge link and product maps into one row per store, then one row per brand link. product is null for 'none' or no product. */
const storeRows = (links, products) => {
  const plain = Object.keys(links).filter((key) => splitLinkKey(key).brand === null);
  const stores = [...new Set([...plain, ...Object.keys(products)])];
  const rows = stores.map((store) => {
    const value = products[store] ?? null;
    const none = value !== null && norm(value) === NONE_PRODUCT;
    return {
      store, brand: null, url: links[store] ?? null, product: value && !none ? value : null, none,
    };
  });
  for (const [key, url] of Object.entries(links)) {
    const { store, brand } = splitLinkKey(key);
    if (brand !== null) rows.push({ store, brand, url, product: null, none: false });
  }
  return rows;
};

/** Return the product rows of a catalog or shopping-list description: {store, brand, url, product, none}. One row per store, from Link and Product lines. Brand links get their own rows with brand set. */
export function storeProductsOf(description) {
  return storeRows(linksOf(description), productEntries(productPairsOf(description)));
}

/** Return a description with one store's plain link and product set. url is the https link. product is the product name. none marks 'no product here'. An empty url or product removes that line. Other lines and brand links are kept. */
export function withStoreProduct(description, store, { url = null, product = null, none = false } = {}) {
  const name = oneLine(store).toLowerCase();
  if (!PROVIDER_ID.test(name)) {
    throw new Error(`restock-card: store must be one lowercase word, got "${store}"`);
  }
  const links = linksOf(description);
  const products = productEntries(productPairsOf(description));
  const link = oneLine(url);
  if (link) links[name] = link;
  else delete links[name];
  const value = none ? NONE_PRODUCT : oneLine(product);
  if (value) products[name] = value;
  else delete products[name];
  return withProducts(withLinks(description, links), products);
}

const EVERY_LINE = /^\s*every\s+order\s*:\s*(.*?)\s*$/i;

/** Return the Every order amount of a catalog item: an integer of 0 or more. 0 means off. */
export function everyOrderOf(catalogDescription) {
  return parseCatalog(catalogDescription).everyOrder ?? 0;
}

/** Return a catalog description with its Every order line set to n. 0, null or an invalid value removes the line. Other lines are kept. */
export function withEveryOrder(catalogDescription, n) {
  return rebuildCatalog(catalogDescription, { everyOrder: n });
}

const IMAGE_LINE = /^\s*image\s*:\s*(.*?)\s*$/i;
const IMAGE_SEARCH_DEFAULT = 'script.restock_find_image';
const SERVICE_ID = /^([a-z_][a-z0-9_]*)\.([a-z0-9_]+)$/;
const PHOTO_LIMIT = 8;
const PHOTO_IN_FLIGHT = 2;

const WANT_LINE = /^\s*want\s*:\s*(.*?)\s*$/i;
const HAVE_LINE = /^\s*have\s*:\s*(.*?)\s*$/i;

/** Return an integer of 0 or more, or null for an empty, negative, fractional or unreadable value. */
const stockValue = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
};

/** Split a catalog description. image is the raw text after "Image:", or null. prefer is the brand list. links is {provider: url}. products is {store: name or 'none'}. want, have and everyOrder are integers or null. */
function parseCatalog(catalogDescription) {
  const [first, ...rest] = lines(catalogDescription);
  let details;
  let image = null;
  let prefer = [];
  let want;
  let have;
  let everyOrder;
  const linkPairs = [];
  const productPairs = [];
  for (const line of rest) {
    const img = IMAGE_LINE.exec(line);
    const pref = PREFER_LINE.exec(line);
    const link = LINK_LINE.exec(line);
    const product = PRODUCT_LINE.exec(line);
    const every = EVERY_LINE.exec(line);
    const wantLine = WANT_LINE.exec(line);
    const haveLine = HAVE_LINE.exec(line);
    if (img) {
      if (image === null) image = img[1];
    } else if (pref) {
      if (prefer.length === 0) prefer = parsePrefer(pref[1]);
    } else if (link) {
      linkPairs.push([link[1], link[2]]);
    } else if (product) {
      productPairs.push([product[1], product[2]]);
    } else if (every) {
      if (everyOrder === undefined) everyOrder = stockValue(every[1]);
    } else if (wantLine) {
      if (want === undefined) want = stockValue(wantLine[1]);
    } else if (haveLine) {
      if (have === undefined) have = stockValue(haveLine[1]);
    } else if (details === undefined && oneLine(line)) {
      details = oneLine(line);
    }
  }
  return {
    category: first.trim(),
    details: details ?? '',
    image,
    prefer,
    want: want ?? null,
    have: have ?? null,
    everyOrder: everyOrder ?? null,
    links: linkEntries(linkPairs),
    products: productEntries(productPairs),
  };
}

/** Join catalog parts in line order: category, details, Prefer, Want, Have, Every order, Link lines, Product lines, Image. Empty or zero values are left out. */
function joinCatalog({
  category, details, image, prefer = [], want, have, everyOrder, links = {}, products = {},
}) {
  const out = [category];
  if (details) out.push(details);
  const brands = formatPrefer(prefer);
  if (brands) out.push(`Prefer: ${brands}`);
  const wantValue = stockValue(want);
  const haveValue = stockValue(have);
  if (wantValue !== null) out.push(`Want: ${wantValue}`);
  if (haveValue !== null) out.push(`Have: ${haveValue}`);
  const every = stockValue(everyOrder);
  if (every) out.push(`Every order: ${every}`);
  out.push(...formatLinks(links));
  out.push(...formatProducts(products));
  if (image) out.push(`Image: ${image}`);
  return out.join('\n');
}

/** Return the catalog description with some parts changed. Parts not in changes are kept as they are. */
const rebuildCatalog = (catalogDescription, changes) => joinCatalog({
  ...parseCatalog(catalogDescription), ...changes,
});

/** Return the Product lines of a catalog description as {store: name or 'none'}. */
const catalogProductsOf = (catalogDescription) => parseCatalog(catalogDescription).products;

const hasImageLine = (catalogDescription) => parseCatalog(catalogDescription).image !== null;

/** Return the default details of a catalog item: first non-empty line after line 1 that is not an Image, Prefer, Link, Want or Have line. */
export function defaultDetailsOf(catalogDescription) {
  return parseCatalog(catalogDescription).details;
}

/** Return a catalog description with line 1 (category) kept and details set. The other lines are kept. */
export function withDefaultDetails(catalogDescription, details) {
  return rebuildCatalog(catalogDescription, { details: oneLine(details) });
}

/** Return the brand preference of a catalog item, in order. Empty when there is no Prefer line. */
export function preferOf(catalogDescription) {
  return parseCatalog(catalogDescription).prefer;
}

/** Return a catalog description with its Prefer line set to brands, in order. An empty list removes the line. */
export function withPrefer(catalogDescription, brands) {
  return rebuildCatalog(catalogDescription, { prefer: brands ?? [] });
}

/** Return the wanted and home amounts of a catalog item: {want, have}. Each is an integer, or null when its line is absent or unreadable. */
export function stockOf(catalogDescription) {
  const { want, have } = parseCatalog(catalogDescription);
  return { want, have };
}

/** Return a catalog description with its Want and Have lines set. A null or undefined value removes that line. Other lines are kept. */
export function withStock(catalogDescription, { want, have } = {}) {
  return rebuildCatalog(catalogDescription, { want, have });
}

/** Return the units still to order: max(0, want - have - onOrderQty). want null gives 0. have null counts as 0. */
export function missingOf({ want, have } = {}, onOrderQty = 0) {
  if (want === null || want === undefined) return 0;
  return Math.max(0, want - (have ?? 0) - (onOrderQty ?? 0));
}

/** Return the Have amount after a history action. Bought adds quantity. Used up takes one. Thrown takes quantity. Never below 0. */
export function haveAfter(have, action, quantity) {
  const current = stockValue(have) ?? 0;
  if (action === 'bought') return current + toQuantity(quantity);
  if (action === 'used') return Math.max(0, current - 1);
  if (action === 'thrown') return Math.max(0, current - toQuantity(quantity));
  return current;
}

/** Return the photo of a catalog item: {url, none}. url is '' when there is no usable Image line. */
export function imageOf(catalogDescription) {
  const { image } = parseCatalog(catalogDescription);
  if (image === null) return { url: '', none: false };
  if (image.toLowerCase() === 'none') return { url: '', none: true };
  return { url: image, none: false };
}

/** Return a catalog description with its Image line set. 'none' writes Image: none. '' removes the line. */
export function withImage(catalogDescription, urlOrNone) {
  return rebuildCatalog(catalogDescription, { image: oneLine(urlOrNone) });
}

/** Return the photo search text: "name details", trimmed, with single spaces. */
export function imageQuery(name, details) {
  return oneLine(`${oneLine(name)} ${oneLine(details)}`);
}

const QUESTION_ABOUT_LINE = /^\s*about\s*:\s*(.*?)\s*$/i;
const QUESTION_ANSWER_LINE = /^\s*answer\s*:\s*(.*?)\s*$/i;

/** Read a shopping question description. Returns {about, answer}. A missing line gives ''. */
export function parseQuestion(description) {
  let about;
  let answer;
  for (const line of lines(description)) {
    const a = QUESTION_ABOUT_LINE.exec(line);
    if (a && about === undefined) about = oneLine(a[1]);
    const r = QUESTION_ANSWER_LINE.exec(line);
    if (r && answer === undefined) answer = oneLine(r[1]);
  }
  return { about: about ?? '', answer: answer ?? '' };
}

/** Format a shopping question description. The About and Answer lines are omitted when empty. */
export function formatQuestion({ about, answer } = {}) {
  const out = [];
  const topic = oneLine(about);
  const reply = oneLine(answer);
  if (topic) out.push(`About: ${topic}`);
  if (reply) out.push(`Answer: ${reply}`);
  return out.join('\n');
}

/** Return the question items whose About line names the item. Case and spacing do not matter. Empty name gives []. */
export function questionsAbout(questions, name) {
  const key = norm(name);
  if (!key) return [];
  return (questions ?? []).filter((item) => norm(parseQuestion(item.description).about) === key);
}

const EVENT_ACTIONS = ['bought', 'used', 'thrown'];
const EVENT_ACTION_LINE = /^\s*action\s*:\s*(.*?)\s*$/i;
const EVENT_AT_LINE = /^\s*at\s*:\s*(.*?)\s*$/i;
const DAY_MS = 86400000;
const HISTORY_SHOWN = 5;
const RELATIVE = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const RELATIVE_UNITS = [
  ['year', 31536000], ['month', 2592000], ['week', 604800],
  ['day', 86400], ['hour', 3600], ['minute', 60],
];

/** Return the epoch milliseconds of an ISO time, or null when it does not parse. */
const timeOf = (iso) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};

/** Format a history event description: Action, Quantity and At lines. */
export function formatEvent({ action, quantity, at } = {}) {
  return [`Action: ${oneLine(action)}`, `Quantity: ${toQuantity(quantity)}`, `At: ${oneLine(at)}`].join('\n');
}

/** Read a history event description. Returns {action, quantity, at}, or null for an unknown action. */
export function parseEvent(description) {
  let action;
  let quantity;
  let at;
  for (const line of lines(description)) {
    const a = EVENT_ACTION_LINE.exec(line);
    if (a && action === undefined) action = oneLine(a[1]).toLowerCase();
    const q = QUANTITY_LINE.exec(line);
    if (q && quantity === undefined) quantity = /^\d+$/.test(q[1]) ? toQuantity(Number(q[1])) : 1;
    const t = EVENT_AT_LINE.exec(line);
    if (t && at === undefined) at = oneLine(t[1]);
  }
  if (!EVENT_ACTIONS.includes(action)) return null;
  return { action, quantity: quantity ?? 1, at: at ?? '' };
}

/**
 * Return the stats of one item's events: {lastBought, lastUsed, boughtCount, thrownCount, thrownUnits, avgDaysBetweenBuys}.
 * Events with an unreadable time, or a time after now, are ignored. Dates are ISO strings or null.
 * avgDaysBetweenBuys is null with fewer than two bought events.
 */
export function historyStats(events, now = Date.now()) {
  const valid = (events ?? [])
    .map((event) => ({ event, t: timeOf(event?.at) }))
    .filter(({ t }) => t !== null && t <= now);
  const withAction = (action) => valid.filter(({ event }) => event.action === action);
  const bought = withAction('bought').sort((a, b) => a.t - b.t);
  const used = withAction('used');
  const thrown = withAction('thrown');
  const latest = (list) => (list.length
    ? list.reduce((best, entry) => (entry.t > best.t ? entry : best)).event.at
    : null);
  const avgDaysBetweenBuys = bought.length < 2
    ? null
    : (bought[bought.length - 1].t - bought[0].t) / (bought.length - 1) / DAY_MS;
  return {
    lastBought: latest(bought),
    lastUsed: latest(used),
    boughtCount: bought.length,
    thrownCount: thrown.length,
    thrownUnits: thrown.reduce((sum, { event }) => sum + toQuantity(event.quantity), 0),
    avgDaysBetweenBuys,
  };
}

/** Return the events of one item name from the history list, parsed, newest first. Case and spacing do not matter. */
export function eventsFor(name, items) {
  const key = norm(name);
  if (!key) return [];
  const events = [];
  for (const item of items ?? []) {
    if (norm(item.summary) !== key) continue;
    const event = parseEvent(item.description);
    if (event) events.push(event);
  }
  return events.sort((a, b) => (timeOf(b.at) ?? 0) - (timeOf(a.at) ?? 0));
}

/** Return a short relative time such as "3 days ago", or '' for an unreadable time. */
function relativeTime(iso, now) {
  const t = timeOf(iso);
  if (t === null) return '';
  const seconds = Math.round((t - now) / 1000);
  for (const [unit, size] of RELATIVE_UNITS) {
    if (Math.abs(seconds) >= size) return RELATIVE.format(Math.round(seconds / size), unit);
  }
  return RELATIVE.format(seconds, 'second');
}

/** Return the one-line summary of stats, such as "Last bought 3 days ago · every ~9 days · thrown 1×". */
function statsLine(stats, now) {
  const parts = [];
  if (stats.lastBought) parts.push(`Last bought ${relativeTime(stats.lastBought, now)}`);
  if (stats.lastUsed) parts.push(`Last used ${relativeTime(stats.lastUsed, now)}`);
  if (stats.avgDaysBetweenBuys !== null) {
    parts.push(`every ~${Math.max(1, Math.round(stats.avgDaysBetweenBuys))} days`);
  }
  if (stats.thrownCount) parts.push(`thrown ${stats.thrownCount}×`);
  return parts.join(' · ');
}

/** Return {domain, service} for an image_search setting. false returns null (photos off). */
function photoServiceOf(setting) {
  if (setting === false) return null;
  const id = setting == null || setting === true ? IMAGE_SEARCH_DEFAULT : String(setting).trim();
  const match = SERVICE_ID.exec(id);
  if (!match) throw new Error(`restock-card: "image_search" must be a script or service id, got "${id}"`);
  return { domain: match[1], service: match[2] };
}

const START_ORDER_DEFAULT = 'script.restock_start_order';
const START_ORDER_KEY = 'start_order_script';

/** Return {id, domain, service} for a script entity id. Anything else throws. */
function scriptOf(setting) {
  const id = String(setting).trim();
  const match = SERVICE_ID.exec(id);
  if (!match || match[1] !== 'script') {
    throw new Error(`restock-card: "${START_ORDER_KEY}" must be a script id or false, got "${setting}"`);
  }
  return { id, domain: match[1], service: match[2] };
}

/** Return the script that starts a new order: {id, domain, service}, or null for no button. false hides it. Undefined uses the default only when shopping is todo.to_order. */
export function startOrderOf(setting, shopping) {
  if (setting === false) return null;
  if (setting === undefined || setting === null) {
    return shopping === SHOPPING_DEFAULT ? scriptOf(START_ORDER_DEFAULT) : null;
  }
  if (setting === true) return scriptOf(START_ORDER_DEFAULT);
  return scriptOf(setting);
}

/** Return the item label setting: 'item' for undefined. Anything else must be a non-empty word. */
export function itemLabelOf(setting) {
  if (setting === undefined || setting === null) return 'item';
  const label = typeof setting === 'string' ? oneLine(setting) : '';
  if (!label) throw new Error(`restock-card: "item_label" must be a word, got "${setting}"`);
  return label;
}

/** Return the English article for a label: 'an' before a vowel, else 'a'. */
export function articleFor(label) {
  return /^[aeiou]/i.test(label) ? 'an' : 'a';
}

/** Return true when a service call failed because the service does not exist. */
const isServiceMissing = (err) => err?.code === 'service_not_found'
  || /not found/i.test(String(err?.message ?? ''));

/** Group catalog items by category. Categories A to Z, Other last. Items A to Z. */
export function groupByCategory(items) {
  const groups = new Map();
  for (const item of items ?? []) {
    const category = categoryOf(item);
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(item);
  }
  const compare = (a, b) => String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
  const categories = [...groups.keys()].sort((a, b) => {
    if (a === OTHER && b !== OTHER) return 1;
    if (b === OTHER && a !== OTHER) return -1;
    return compare(a, b);
  });
  return categories.map((category) => [
    category,
    groups.get(category).slice().sort((x, y) => compare(x.summary ?? '', y.summary ?? '')),
  ]);
}

/** Return the needs_action shopping item whose summary matches name, or undefined. */
export function findOnList(name, shoppingItems) {
  const key = norm(name);
  if (!key) return undefined;
  return (shoppingItems ?? []).find(
    (item) => item.status === 'needs_action' && norm(item.summary) === key,
  );
}

/** Return a new array with the item at index moved by delta (-1 up, +1 down). The target stays inside the array. */
export function moveItem(list, index, delta) {
  const out = Array.isArray(list) ? list.slice() : [];
  if (!Number.isInteger(index) || index < 0 || index >= out.length) return out;
  const to = Math.min(out.length - 1, Math.max(0, index + delta));
  if (to === index) return out;
  const [moved] = out.splice(index, 1);
  out.splice(to, 0, moved);
  return out;
}

/** Return the deals of one item name. dealsJson is the file object {updated, deals}, or a plain {name: [deal]} map. Case and spacing do not matter. */
export function dealsFor(name, dealsJson) {
  const key = norm(name);
  if (!key || !dealsJson || typeof dealsJson !== 'object') return [];
  const map = dealsJson.deals && typeof dealsJson.deals === 'object' ? dealsJson.deals : dealsJson;
  const match = Object.keys(map).find((entry) => norm(entry) === key);
  return match && Array.isArray(map[match]) ? map[match] : [];
}

/** Return the price of one unit in a deal. A quantity deal gives dealPrice / dealQuantity. Otherwise the regular price. null when unknown. */
const unitPriceOf = (deal) => {
  const quantity = Number(deal?.dealQuantity);
  const total = Number(deal?.dealPrice);
  if (Number.isInteger(quantity) && quantity >= 1 && deal?.dealPrice != null && Number.isFinite(total)) {
    return total / quantity;
  }
  if (deal?.price == null) return null;
  const price = Number(deal.price);
  return Number.isFinite(price) ? price : null;
};

/** Return the deal with the lowest unit price. Deals without a price are skipped. Null for an empty list. */
export function bestDeal(list) {
  const deals = Array.isArray(list) ? list : [];
  let best = null;
  let bestUnit = Infinity;
  for (const deal of deals) {
    const unit = unitPriceOf(deal);
    if (unit !== null && unit < bestUnit) {
      best = deal;
      bestUnit = unit;
    }
  }
  return best ?? deals[0] ?? null;
}

/** Return the short deal text, such as "2 ב-12.9 ₪". A quantity deal without text gets one built from its numbers. '' for no deal. */
export function formatDeal(deal) {
  const text = oneLine(deal?.deal);
  if (text) return text;
  if (deal?.dealQuantity && deal?.dealPrice != null) return `${deal.dealQuantity} ב-${deal.dealPrice} ₪`;
  return '';
}

/** Return the deals that need more units than the order quantity. The card shows these as a hint. It never changes the quantity. */
export function dealBuyHints(list, quantity) {
  return (Array.isArray(list) ? list : []).filter(
    (deal) => Number.isInteger(deal?.dealQuantity) && deal.dealQuantity > Number(quantity ?? 0),
  );
}

/** Return a data file URL setting: the default path for undefined, null for false, or the given path or https URL. Anything else throws. */
const fileUrlOf = (setting, key, fallback) => {
  if (setting === undefined || setting === null) return fallback;
  if (setting === false) return null;
  if (typeof setting === 'string' && (setting.startsWith('/') || setting.startsWith('https://'))) return setting;
  throw new Error(`restock-card: "${key}" must be false, a path that starts with /, or an https URL, got "${setting}"`);
};

/** Return the deals URL setting: the default path for undefined, null for false, or the given path or https URL. Anything else throws. */
export function dealsUrlOf(setting) {
  return fileUrlOf(setting, 'deals_url', DEALS_DEFAULT);
}

/** Return the prices URL setting. Same rules as deals_url. */
export function pricesUrlOf(setting) {
  return fileUrlOf(setting, 'prices_url', PRICES_DEFAULT);
}

/** Return the stored prices of one item name: {store: {price, checked, url}} or {store: {none: true}}. Searches every list in the file. Case and spacing do not matter. {} when unknown. */
export function pricesFor(name, pricesJson) {
  const key = norm(name);
  const lists = pricesJson && typeof pricesJson === 'object' && pricesJson.items && typeof pricesJson.items === 'object'
    ? Object.values(pricesJson.items)
    : [];
  if (!key) return {};
  for (const list of lists) {
    if (!list || typeof list !== 'object') continue;
    const match = Object.keys(list).find((entry) => norm(entry) === key);
    if (match && list[match] && typeof list[match] === 'object') return list[match];
  }
  return {};
}

/** Return the store with the lowest stored price: {store, price, checked, url}. Stores marked none and brand keys such as 'victory (Riztz)' are skipped. With excludeNone false, a none store is returned (price null) when no store has a price. Null when nothing is known. */
export function cheapestStore(prices, excludeNone = true) {
  const entries = prices && typeof prices === 'object' ? Object.entries(prices) : [];
  let best = null;
  for (const [store, entry] of entries) {
    if (store.includes(' (') || !entry || entry.none) continue;
    const price = Number(entry.price);
    if (!Number.isFinite(price)) continue;
    if (best === null || price < best.price) {
      best = { store, price, checked: entry.checked ?? null, url: entry.url ?? null };
    }
  }
  if (best === null && excludeNone === false) {
    const none = entries.find(([store, entry]) => !store.includes(' (') && entry?.none);
    if (none) return { store: none[0], price: null, checked: none[1].checked ?? null, url: null, none: true };
  }
  return best;
}

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/** Return the age of a price check in calendar days: 'today', '1 day ago', '2 days ago'. '' for a missing or bad date. */
export function formatAge(checked, now = new Date()) {
  if (!checked) return '';
  const when = new Date(checked);
  const today = new Date(now);
  if (Number.isNaN(when.getTime()) || Number.isNaN(today.getTime())) return '';
  const days = Math.max(0, Math.round((startOfDay(today) - startOfDay(when)) / DAY_MS));
  if (days === 0) return 'today';
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

/** Return a price as ₪ and two decimals, such as ₪7.00. */
export const formatPrice = (price) => `₪${Number(price).toFixed(2)}`;

/** Return the label of one stored price row: '₪7.00 · today', or 'none' for a store marked none. '' when unknown. */
export function priceLabel(entry, now = new Date()) {
  if (!entry || typeof entry !== 'object') return '';
  if (entry.none) return 'none';
  const price = Number(entry.price);
  if (!Number.isFinite(price)) return '';
  const age = formatAge(entry.checked, now);
  return age ? `${formatPrice(price)} · ${age}` : formatPrice(price);
}

const STORE_NAMES = { victory: 'Victory', ramilevy: 'Rami Levy', shufersal: 'Shufersal', yochananof: 'Yochananof', hazihinam: 'חצי חינם', tivtaam: 'טיב טעם' };
const storeNameOf = (store) => STORE_NAMES[store] ?? store;

/** Estimate the order at each store. items: [{name, quantity}] of the order list. A store gets the total of the items it prices, and a count of the items it has no price for. cheapest is the lowest total among stores that price every item, or null. oldest is the oldest check of the prices behind the cheapest total, or of all prices when there is no cheapest. */
export function orderEstimate(items, pricesJson) {
  const priced = (Array.isArray(items) ? items : []).map((item) => ({
    quantity: Math.max(0, Number(item?.quantity) || 0),
    prices: pricesFor(item?.name, pricesJson),
  }));
  const stores = new Set();
  for (const { prices } of priced) {
    for (const store of Object.keys(prices)) if (!store.includes(' (')) stores.add(store);
  }
  const totals = {};
  for (const store of stores) {
    let total = 0;
    let missing = 0;
    const checks = [];
    for (const { quantity, prices } of priced) {
      const entry = prices[store];
      const price = Number(entry?.price);
      if (entry?.none || !Number.isFinite(price)) {
        missing += 1;
      } else {
        total += quantity * price;
        if (entry.checked) checks.push(entry.checked);
      }
    }
    totals[store] = { total, missing, checks };
  }
  const complete = Object.entries(totals).filter(([, s]) => s.missing === 0 && s.total > 0);
  const cheapest = complete.length
    ? complete.reduce((best, cur) => (cur[1].total < best[1].total ? cur : best))
    : null;
  const oldestOf = (list) => list.map((c) => new Date(c)).filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => a - b)[0]?.toISOString() ?? null;
  const basis = cheapest ? cheapest[1].checks : Object.values(totals).flatMap((s) => s.checks);
  return {
    stores: totals,
    cheapest: cheapest ? { store: cheapest[0], total: cheapest[1].total } : null,
    oldest: oldestOf(basis),
  };
}

/** Return the order estimate line, such as 'Order ≈ ₪815 at Rami Levy · ₪920 Shufersal · ₪922 Victory (prices checked 1 day ago)'. '' when no store has a price. */
export function orderEstimateText(estimate, now = new Date()) {
  const stores = estimate?.stores ?? {};
  const rows = Object.entries(stores);
  if (!rows.some(([, s]) => s.total > 0)) return '';
  // Stores with fewer gaps come first, then the lowest total.
  rows.sort((a, b) => a[1].missing - b[1].missing || a[1].total - b[1].total);
  const parts = rows.map(([store, s]) => {
    const gap = s.missing ? ` (${s.missing} without price)` : '';
    if (s.total === 0) return `${storeNameOf(store)}${gap}`;
    const at = estimate.cheapest?.store === store ? ' at' : '';
    return `₪${Math.round(s.total)}${at} ${storeNameOf(store)}${gap}`;
  });
  const age = formatAge(estimate.oldest, now);
  const note = age ? ` (prices checked ${age})` : '';
  return `Order ≈ ${parts.join(' · ')}${note}`;
}

/** Return the store label of a deal, with its brand in brackets when it has one. */
const storeLabelOf = (deal) => (deal?.brand ? `${deal.store} (${deal.brand})` : String(deal?.store ?? ''));

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'text') node.textContent = value;
    else node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
}

const CSS = `
  :host { display: block; }
  .wrap { padding: 16px; }
  .header { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
  .title { font-size: 1.25rem; font-weight: 500; color: var(--primary-text-color); }
  .count { font-size: 0.875rem; color: var(--secondary-text-color); }
  .edit-toggle {
    font: inherit; font-size: 0.875rem; min-height: 32px; padding: 4px 12px;
    border: 1px solid var(--divider-color); border-radius: 16px;
    background: transparent; color: var(--primary-color); cursor: pointer;
  }
  .edit-toggle.active { background: var(--primary-color); color: #fff; border-color: var(--primary-color); }
  .head-actions { display: flex; align-items: center; gap: 8px; }
  .fill-btn {
    font: inherit; font-size: 0.875rem; min-height: 32px; padding: 4px 12px;
    border: 1px solid var(--primary-color); border-radius: 16px;
    background: var(--primary-color); color: #fff; cursor: pointer;
  }
  .fill-btn[hidden] { display: none; }
  .ed-stock { display: flex; flex-direction: column; gap: 8px; }
  .ed-clear {
    font: inherit; font-size: 0.875rem; min-height: 32px; padding: 4px 12px; border-radius: 8px; cursor: pointer;
    border: 1px solid var(--divider-color); background: transparent; color: var(--primary-text-color);
  }
  .editor {
    display: flex; flex-direction: column; gap: 12px; margin-top: 12px; padding: 12px;
    border: 1px solid var(--divider-color); border-radius: 12px;
    background: var(--card-background-color);
  }
  .editor[hidden] { display: none; }
  .ed-head { display: flex; align-items: center; gap: 8px; font-weight: 500; color: var(--primary-text-color); }
  .ed-head .emoji { font-size: 28px; line-height: 1; }
  .ed-head .emoji.big { font-size: 64px; }
  .ed-photos { display: flex; flex-direction: column; gap: 8px; }
  .ed-photos[hidden] { display: none; }
  .ed-photo-btn {
    font: inherit; align-self: flex-start; min-height: 36px; padding: 6px 14px; border-radius: 8px;
    border: 1px solid var(--divider-color); background: transparent; color: var(--primary-text-color); cursor: pointer;
  }
  .ed-photo-btn:disabled { opacity: 0.6; cursor: default; }
  .ed-photo-status { margin: 0; font-size: 0.875rem; color: var(--secondary-text-color); }
  .photo-grid { display: grid; grid-template-columns: repeat(auto-fill, 64px); gap: 8px; }
  .photo-opt {
    display: flex; align-items: center; justify-content: center; box-sizing: border-box;
    width: 64px; height: 64px; padding: 2px; border: 2px solid var(--divider-color); border-radius: 8px;
    background: #fff; color: #000; font: inherit; font-size: 0.75rem; cursor: pointer;
  }
  .photo-opt img { width: 100%; height: 100%; object-fit: contain; display: block; }
  .photo-opt.on { border-color: var(--primary-color); box-shadow: 0 0 0 2px var(--primary-color); }
  .ed-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .ed-label { min-width: 72px; font-size: 0.875rem; color: var(--secondary-text-color); }
  .ed-step {
    width: 40px; height: 40px; font: inherit; font-size: 1.25rem; padding: 0;
    border: 1px solid var(--divider-color); border-radius: 50%;
    background: transparent; color: var(--primary-text-color); cursor: pointer;
  }
  .ed-qty { min-width: 32px; text-align: center; font-size: 1.125rem; font-weight: 500; color: var(--primary-text-color); }
  .ed-details {
    flex: 1 1 160px; min-width: 0; padding: 8px 10px; font: inherit;
    border: 1px solid var(--divider-color); border-radius: 8px;
    background: var(--card-background-color); color: var(--primary-text-color);
  }
  .ed-remember { display: flex; align-items: center; gap: 8px; font-size: 0.875rem; color: var(--primary-text-color); }
  .ed-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
  .ed-actions button {
    font: inherit; min-height: 36px; padding: 6px 14px; border-radius: 8px; cursor: pointer;
    border: 1px solid var(--divider-color); background: transparent; color: var(--primary-text-color);
  }
  .ed-actions .ed-save { background: var(--primary-color); border-color: var(--primary-color); color: #fff; }
  .ed-actions .ed-remove { border-color: var(--error-color, #db4437); color: var(--error-color, #db4437); }
  .notice {
    display: flex; align-items: flex-start; gap: 8px; margin-bottom: 12px; padding: 8px 12px;
    border: 1px solid currentColor; border-radius: 8px; font-size: 0.875rem; overflow-wrap: anywhere;
  }
  .notice[hidden] { display: none; }
  .notice-text { flex: 1 1 auto; min-width: 0; }
  .notice.error { color: var(--error-color, #db4437); }
  .notice.warn { color: var(--warning-color, #b26a00); }
  .notice-close {
    font: inherit; min-width: 28px; min-height: 28px; padding: 0; border: none;
    background: transparent; color: inherit; cursor: pointer;
  }
  .group { margin-top: 12px; }
  .cat { margin: 0 0 6px; font-size: 0.875rem; font-weight: 500; color: var(--secondary-text-color); }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; }
  .tile-wrap { position: relative; }
  .tile {
    position: relative; display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 4px; width: 100%; min-height: 88px; padding: 8px;
    border: 1px solid var(--divider-color); border-radius: 12px;
    background: var(--card-background-color); color: var(--primary-text-color);
    font: inherit; text-align: center; cursor: pointer; user-select: none;
    -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent;
  }
  .tile.on { background: var(--primary-color); border-color: var(--primary-color); color: #fff; }
  .tile.edit { border-style: dashed; }
  .tile.confirm { border-color: var(--error-color, #db4437); color: var(--error-color, #db4437); }
  .tile.short { border-color: var(--warning-color, #b26a00); box-shadow: inset 0 0 0 1px var(--warning-color, #b26a00); }
  .stock {
    position: absolute; inset-block-end: 4px; inset-inline-start: 6px;
    font-size: 0.7rem; font-weight: 500; color: var(--secondary-text-color);
  }
  .emoji { font-size: 32px; line-height: 1; }
  .emoji.big { font-size: 64px; }
  .photo-box {
    display: flex; align-items: center; justify-content: center; box-sizing: border-box;
    width: 56px; height: 56px; padding: 4px; border-radius: 12px; background: #fff; overflow: hidden;
  }
  .photo-box.big { width: 96px; height: 96px; }
  .photo-box img { width: 100%; height: 100%; object-fit: contain; display: block; }
  .name { font-size: 0.875rem; overflow-wrap: anywhere; }
  .details {
    max-width: 100%; font-size: 0.75rem; opacity: 0.85;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .badge, .x {
    position: absolute; inset-block-start: 4px; inset-inline-end: 6px;
    font-size: 0.875rem; font-weight: 700;
  }
  .x { color: var(--secondary-text-color); }
  .pencil {
    position: absolute; inset-block-end: 2px; inset-inline-end: 2px;
    width: 28px; height: 28px; padding: 0; border: none; border-radius: 50%;
    background: var(--card-background-color); color: var(--primary-color);
    font: inherit; font-size: 14px; cursor: pointer;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  }
  .add-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
  .add-row input {
    flex: 1 1 140px; min-width: 0; padding: 8px 10px; font: inherit;
    border: 1px solid var(--divider-color); border-radius: 8px;
    background: var(--card-background-color); color: var(--primary-text-color);
  }
  .add-btn {
    font: inherit; padding: 8px 16px; border: none; border-radius: 8px;
    background: var(--primary-color); color: #fff; cursor: pointer;
  }
  .ed-prefer { display: flex; flex-direction: column; gap: 8px; }
  .ed-prefer-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .ed-prefer-row { display: flex; align-items: center; gap: 6px; }
  .ed-rank { min-width: 24px; font-size: 0.875rem; color: var(--secondary-text-color); }
  .ed-brand { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; color: var(--primary-text-color); }
  .ed-move {
    font: inherit; min-width: 32px; min-height: 32px; padding: 0; border-radius: 8px; cursor: pointer;
    border: 1px solid var(--divider-color); background: transparent; color: var(--primary-text-color);
  }
  .ed-move:disabled { opacity: 0.4; cursor: default; }
  .ed-pref-empty { margin: 0; font-size: 0.875rem; color: var(--secondary-text-color); }
  .ed-brand-item { display: flex; flex-direction: column; gap: 6px; }
  .ed-brand-links-wrap { display: flex; flex-direction: column; gap: 6px; margin-inline-start: 30px; }
  .ed-brand-links { margin-inline-start: 0; }
  .ed-prefer-add { display: flex; gap: 8px; }
  .ed-prefer-add input {
    flex: 1 1 auto; min-width: 0; padding: 8px 10px; font: inherit;
    border: 1px solid var(--divider-color); border-radius: 8px;
    background: var(--card-background-color); color: var(--primary-text-color);
  }
  .ed-prefer-add button {
    font: inherit; min-height: 36px; padding: 6px 14px; border-radius: 8px; cursor: pointer;
    border: 1px solid var(--divider-color); background: transparent; color: var(--primary-text-color);
  }
  .ed-links { display: flex; flex-direction: column; gap: 8px; }
  .ed-provider { min-width: 80px; font-size: 0.875rem; color: var(--secondary-text-color); }
  .ed-link { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; color: var(--primary-color); }
  .ed-link-error { margin: 0; font-size: 0.875rem; color: var(--error-color, #db4437); }
  .link-mark { position: absolute; inset-block-start: 4px; inset-inline-start: 6px; font-size: 0.75rem; }
  .every {
    position: absolute; inset-block-start: 4px; inset-inline-start: 24px;
    font-size: 0.7rem; font-weight: 500; color: var(--secondary-text-color);
  }
  .questions {
    display: flex; flex-direction: column; gap: 10px; margin-top: 12px; padding: 12px;
    border: 1px solid var(--divider-color); border-radius: 12px; background: var(--card-background-color);
  }
  .questions[hidden] { display: none; }
  .q-title { font-size: 0.875rem; font-weight: 500; color: var(--secondary-text-color); }
  .q-row { display: flex; flex-direction: column; gap: 6px; }
  .q-text { font-size: 0.95rem; color: var(--primary-text-color); overflow-wrap: anywhere; }
  .q-chip {
    align-self: flex-start; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem;
    background: var(--divider-color); color: var(--primary-text-color);
  }
  .q-value { font-size: 0.875rem; color: var(--primary-text-color); overflow-wrap: anywhere; }
  .q-answer, .q-ask { display: flex; flex-wrap: wrap; gap: 8px; }
  .q-answer input, .q-ask input {
    flex: 1 1 140px; min-width: 0; padding: 8px 10px; font: inherit;
    border: 1px solid var(--divider-color); border-radius: 8px;
    background: var(--card-background-color); color: var(--primary-text-color);
  }
  .q-btn, .q-open {
    font: inherit; min-height: 36px; padding: 6px 14px; border-radius: 8px; cursor: pointer;
    border: 1px solid var(--divider-color); background: transparent; color: var(--primary-text-color);
  }
  .q-open { align-self: flex-start; margin-top: 12px; }
  .q-answered summary { cursor: pointer; font-size: 0.875rem; color: var(--secondary-text-color); }
  .q-answered .q-row { margin-top: 8px; }
  .ed-question { margin: 0; font-size: 0.875rem; color: var(--primary-text-color); overflow-wrap: anywhere; }
  .ed-log { display: flex; flex-direction: column; gap: 8px; }
  .ed-log-btns { display: flex; flex-wrap: wrap; gap: 8px; }
  .ed-log-btns button {
    font: inherit; min-height: 36px; padding: 6px 14px; border-radius: 8px; cursor: pointer;
    border: 1px solid var(--divider-color); background: transparent; color: var(--primary-text-color);
  }
  .ed-log-note { margin: 0; font-size: 0.875rem; color: var(--secondary-text-color); }
  .ed-history { display: flex; flex-direction: column; gap: 6px; }
  .ed-history-stats { margin: 0; font-size: 0.875rem; color: var(--primary-text-color); overflow-wrap: anywhere; }
  .ed-history-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  .ed-history-list li { display: flex; flex-wrap: wrap; gap: 8px; font-size: 0.875rem; color: var(--secondary-text-color); }
  .deals {
    margin-top: 12px; padding: 8px 12px; border: 1px solid var(--divider-color); border-radius: 12px;
    background: var(--card-background-color);
  }
  .deals[hidden] { display: none; }
  .deals > summary { cursor: pointer; font-size: 0.875rem; font-weight: 500; color: var(--secondary-text-color); }
  .deals-list { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .deal-item { display: flex; align-items: center; gap: 8px; }
  .deal-open {
    flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 8px; padding: 4px;
    font: inherit; text-align: start; border: none; background: transparent; color: var(--primary-text-color); cursor: pointer;
  }
  .deal-open .photo-box { width: 40px; height: 40px; }
  .deal-open .emoji { font-size: 24px; }
  .deal-name { font-size: 0.875rem; overflow-wrap: anywhere; }
  .deal-text { font-size: 0.8rem; color: var(--secondary-text-color); overflow-wrap: anywhere; }
  .deal-link { font-size: 0.8rem; color: var(--primary-color); }
  .deal-badge {
    max-width: 100%; box-sizing: border-box; padding: 1px 6px; border-radius: 8px;
    font-size: 0.7rem; font-weight: 500; color: #fff; background: var(--warning-color, #b26a00);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .price-badge {
    max-width: 100%; box-sizing: border-box; padding: 1px 6px; border-radius: 8px;
    font-size: 0.7rem; font-weight: 500; color: var(--primary-text-color); background: var(--secondary-background-color, #eee);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .ed-price { font-size: 0.8rem; color: var(--secondary-text-color); white-space: nowrap; }
  .ed-deals { display: flex; flex-direction: column; gap: 6px; }
  .ed-deals[hidden] { display: none; }
  .ed-deal-text { flex: 1 1 auto; min-width: 0; font-size: 0.875rem; overflow-wrap: anywhere; color: var(--primary-text-color); }
  .ed-deal-hint { margin: 0; font-size: 0.875rem; font-weight: 500; color: var(--warning-color, #b26a00); }
  .plan {
    display: flex; flex-direction: column; gap: 10px; margin-top: 12px; padding: 12px;
    border: 1px solid var(--divider-color); border-radius: 12px; background: var(--card-background-color);
  }
  .plan[hidden] { display: none; }
  .plan-summary { margin: 0; font-size: 0.95rem; font-weight: 500; color: var(--primary-text-color); overflow-wrap: anywhere; }
  .plan-age { margin: 0; font-size: 0.8rem; color: var(--secondary-text-color); }
  .plan-store { border: 1px solid var(--divider-color); border-radius: 8px; padding: 6px 10px; }
  .plan-store > summary { cursor: pointer; font-size: 0.875rem; color: var(--primary-text-color); overflow-wrap: anywhere; }
  .plan-store .ed-prefer-list { margin-top: 8px; }
  .plan-unassigned { margin: 0; font-size: 0.875rem; color: var(--error-color, #db4437); overflow-wrap: anywhere; }
  .plan-settings { display: flex; flex-direction: column; gap: 8px; }
  .plan-setting { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 0.875rem; }
  .plan-setting label { display: flex; align-items: center; gap: 4px; color: var(--secondary-text-color); }
  .plan-setting input {
    width: 72px; padding: 4px 6px; font: inherit; border: 1px solid var(--divider-color); border-radius: 6px;
    background: var(--card-background-color); color: var(--primary-text-color);
  }
  .plan-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .plan-apply {
    font: inherit; min-height: 36px; padding: 6px 14px; border: none; border-radius: 8px;
    background: var(--primary-color); color: #fff; cursor: pointer;
  }
  .plan-apply:disabled { opacity: 0.5; cursor: default; }
  .plan-status { margin: 0; font-size: 0.875rem; color: var(--secondary-text-color); }
  .plan-status:empty { display: none; }
  .store-table { list-style: none; margin: 0 0 8px; padding: 0; display: grid; gap: 6px; }
  .store-row { padding: 6px 8px; border: 1px solid var(--divider-color); border-radius: 8px; font-size: 0.875rem; }
  .store-row.complete { border-color: var(--primary-color); }
  .store-head { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .store-line { color: var(--secondary-text-color); margin-top: 2px; }
  .store-missing { color: var(--primary-text-color); margin-top: 2px; }
  .fill-btn.active { background: var(--secondary-background-color, #eee); color: var(--primary-text-color); border-color: var(--divider-color); }
  .buy-chip {
    align-self: center; max-width: 100%; box-sizing: border-box; padding: 1px 8px; border-radius: 10px;
    font-size: 0.7rem; font-weight: 500; color: var(--primary-text-color);
    background: var(--secondary-background-color, #eee); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .empty { padding: 12px 0; color: var(--secondary-text-color); }
`;

/* ---- Data backends. The card talks to one of two backends. ---- */

const API_BASE = '/api';
const API_POLL_MS = 3000;
const STANDALONE_DELAY_MS = 150;

/** Build the REST request for a todo service call. Throws for an unknown service. */
export function apiRequestFor(service, entityId, data = {}) {
  const list = `${API_BASE}/lists/${encodeURIComponent(entityId)}`;
  if (service === 'add_item') {
    return {
      method: 'POST',
      path: `${list}/items`,
      body: {
        summary: data.item,
        description: data.description ?? '',
        status: data.status ?? 'needs_action',
      },
    };
  }
  if (service === 'update_item') {
    const body = {};
    if (data.rename !== undefined) body.summary = data.rename;
    if (data.description !== undefined) body.description = data.description;
    if (data.status !== undefined) body.status = data.status;
    return { method: 'PATCH', path: `${list}/items/${encodeURIComponent(data.item)}`, body };
  }
  if (service === 'remove_item') {
    return { method: 'DELETE', path: `${list}/items/${encodeURIComponent(data.item)}`, body: null };
  }
  throw new Error('unsupported service');
}

/** Return the error text of a failed REST reply. Falls back to the HTTP status. */
export function apiErrorMessage(body, status) {
  return typeof body?.error === 'string' && body.error ? body.error : `HTTP ${status}`;
}

/** Return the items array of a list reply. */
export function listItemsOf(body) {
  return Array.isArray(body?.items) ? body.items : [];
}

/** Return up to PHOTO_LIMIT non-empty image URL strings. */
export function imageUrlsOf(images) {
  return Array.isArray(images)
    ? images.filter((url) => typeof url === 'string' && url).slice(0, PHOTO_LIMIT)
    : [];
}

/** Send a REST request. Resolve to the parsed JSON body, or null when there is none. Reject with the server error. */
async function apiRequest(method, path, body = null) {
  const init = { method, headers: {} };
  if (body !== null) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(path, init);
  let parsed = null;
  try {
    parsed = await res.json();
  } catch {
    parsed = null;
  }
  if (!res.ok) throw new Error(apiErrorMessage(parsed, res.status));
  return parsed;
}

/** Home Assistant backend. Wraps the hass object. Behavior is the same as before the backends existed. */
class HassBackend {
  constructor(hass) {
    this.hass = hass;
  }

  get ready() {
    return !!this.hass?.connection;
  }

  /** Subscribe to a todo list. Resolve to the unsubscribe function. */
  subscribeList(entityId, onItems) {
    return this.hass.connection.subscribeMessage((msg) => {
      onItems(listItemsOf(msg));
    }, { type: 'todo/item/subscribe', entity_id: entityId });
  }

  callTodo(service, entityId, data) {
    return this.hass.callService('todo', service, data, { entity_id: entityId });
  }

  startOrder(script) {
    return this.hass.callService(script.domain, script.service, {});
  }

  /** Call the photo service. Resolve to image URLs. Reject on failure. */
  async searchImages(query, { domain, service }) {
    const conn = this.hass?.connection;
    if (!conn) throw new Error('Photo search is not connected');
    const reply = await conn.sendMessagePromise({
      type: 'call_service', domain, service, service_data: { q: query }, return_response: true,
    });
    return imageUrlsOf(reply?.response?.images);
  }
}

/** Standalone backend. Talks to a REST API on the same origin. No hass. */
export class RestockApiBackend {
  constructor() {
    this._subs = new Set();
    this._timer = null;
  }

  get ready() {
    return true;
  }

  /** Fetch the list now and every API_POLL_MS. Resolve to the unsubscribe function. */
  async subscribeList(entityId, onItems) {
    const sub = { entityId, onItems };
    this._subs.add(sub);
    if (!this._timer) this._timer = setInterval(() => this.refreshAll(), API_POLL_MS);
    await this._refresh(sub);
    return () => {
      this._subs.delete(sub);
      if (this._subs.size === 0) {
        clearInterval(this._timer);
        this._timer = null;
      }
    };
  }

  /** Refresh every subscribed list. */
  refreshAll() {
    return Promise.all([...this._subs].map((sub) => this._refresh(sub)));
  }

  async _refresh(sub) {
    let items;
    try {
      const body = await apiRequest('GET', `${API_BASE}/lists/${encodeURIComponent(sub.entityId)}`);
      items = listItemsOf(body);
    } catch (err) {
      console.warn(`restock-card: could not load ${sub.entityId}`, err);
      return;
    }
    if (this._subs.has(sub)) sub.onItems(items);
  }

  /** Send a todo write. Then refresh every list. Reject with the server error. */
  async callTodo(service, entityId, data = {}) {
    const req = apiRequestFor(service, entityId, data);
    await apiRequest(req.method, req.path, req.body);
    this.refreshAll();
  }

  async startOrder() {
    const reply = await apiRequest('POST', `${API_BASE}/start-order`);
    this.refreshAll();
    return reply;
  }

  /** Resolve to up to PHOTO_LIMIT image URLs. Reject on failure. */
  async searchImages(query) {
    const body = await apiRequest('GET', `${API_BASE}/images?q=${encodeURIComponent(query)}`);
    return imageUrlsOf(body?.images);
  }
}

function defineRestockCard() {
  class RestockCard extends HTMLElement {
    constructor() {
      super();
      this._hass = undefined;
      this._backend = null; // HassBackend or RestockApiBackend. Null until one is chosen.
      this._standaloneChecked = false; // true once the standalone backend decision is scheduled
      this._config = undefined;
      this._catalogItems = [];
      this._shoppingItems = [];
      this._unsubs = [];
      this._subscribed = false;
      this._editMode = false;
      this._confirmUid = null;
      this._confirmTimer = null;
      this._pendingQty = new Map(); // normalized name -> quantity not yet seen in a subscription update
      this._pendingTimers = new Map(); // normalized name -> timer id
      this._addPending = new Set(); // normalized names whose add_item has not appeared on the list yet
      this._editor = null;
      this._errorTimer = null;
      this._triedImages = new Set(); // catalog uids already queued for an auto photo lookup this session
      this._imageQueue = []; // catalog uids waiting for an auto photo lookup
      this._imagesInFlight = 0;
      this._photoService = null; // {domain, service} from image_search, or null when photos are off
      this._imageSearchOff = false; // true once the photo script is found missing
      this._questionItems = []; // items of the shopping questions list
      this._asking = false; // true once the Ask a question button is pressed
      this._answeredOpen = false; // state of the Answered toggle, kept across redraws
      this._drafts = new Map(); // question uid -> answer text typed but not sent yet
      this._historyItems = []; // items of the history list
      this._pendingEvents = new Set(); // history descriptions added but not yet marked completed
      this._deals = null; // parsed restock-deals.json, or null before it loads
      this._dealsOpen = false; // state of the Deals now toggle, kept across redraws
      this._prices = null; // parsed restock-prices.json, or null before it loads
      this._dealsTimer = null; // interval id of the 6 hour deals and prices refresh
      this._planOpen = false; // true while the Plan order panel is open
      this._planStoreOpen = new Set(); // store ids whose basket is expanded. Kept across redraws.
      this._lastPlan = null; // {plan, input} of the panel as last drawn. Apply plan reads it.
      this._buildDom();
    }

    static getStubConfig() {
      return { catalog: CATALOG_DEFAULT, shopping: SHOPPING_DEFAULT };
    }

    getCardSize() {
      return 6;
    }

    setConfig(config) {
      const catalog = config?.catalog ?? CATALOG_DEFAULT;
      const shopping = config?.shopping ?? SHOPPING_DEFAULT;
      if (!isTodoId(catalog)) {
        throw new Error(`restock-card: "catalog" must be a todo entity id, got "${catalog}"`);
      }
      if (!isTodoId(shopping)) {
        throw new Error(`restock-card: "shopping" must be a todo entity id, got "${shopping}"`);
      }
      const questions = config?.questions ?? null;
      if (questions !== null && !isTodoId(questions)) {
        throw new Error(`restock-card: "questions" must be a todo entity id, got "${questions}"`);
      }
      const history = config?.history ?? null;
      if (history !== null && !isTodoId(history)) {
        throw new Error(`restock-card: "history" must be a todo entity id, got "${history}"`);
      }
      const dealsUrl = dealsUrlOf(config?.deals_url);
      const dealsChanged = (this._config?.dealsUrl ?? null) !== dealsUrl;
      const pricesUrl = pricesUrlOf(config?.prices_url);
      const pricesChanged = (this._config?.pricesUrl ?? null) !== pricesUrl;
      const startOrder = startOrderOf(config?.[START_ORDER_KEY], shopping);
      const itemLabel = itemLabelOf(config?.item_label);
      storesOf(config?.stores); // throws on a bad stores map
      const splitMaxStores = splitMaxStoresOf(config?.split_max_stores);
      const changed = !this._config
        || this._config.catalog !== catalog
        || this._config.shopping !== shopping
        || this._config.questions !== questions
        || this._config.history !== history;
      const photoService = photoServiceOf(config?.image_search);
      if (JSON.stringify(photoService) !== JSON.stringify(this._photoService)) {
        this._photoService = photoService;
        this._imageSearchOff = false;
        this._triedImages.clear();
        this._imageQueue = [];
      }
      this._config = {
        ...config,
        catalog,
        shopping,
        questions,
        history,
        dealsUrl,
        pricesUrl,
        startOrder,
        itemLabel,
        splitMaxStores,
        title: config?.title ?? 'Home items',
      };
      this._titleEl.textContent = this._config.title;
      this._applyLabels();
      if (changed) {
        this._unsubscribe();
        this._catalogItems = [];
        this._shoppingItems = [];
        this._questionItems = [];
        this._historyItems = [];
        this._closeEditor();
        this._subscribe();
        this._render();
      }
      if (dealsChanged || pricesChanged) {
        if (dealsChanged) this._deals = null;
        if (pricesChanged) this._prices = null;
        if (this.isConnected) this._startDeals();
      }
    }

    set hass(hass) {
      this._hass = hass;
      if (this._backend instanceof HassBackend) this._backend.hass = hass;
      else this._switchBackend(new HassBackend(hass));
      if (this.isConnected) this._subscribe();
    }

    connectedCallback() {
      this._subscribe();
      this._startDeals();
      if (!this._standaloneChecked) {
        // HA may set hass after connect. Wait a short time, then use the REST API if hass never came.
        this._standaloneChecked = true;
        setTimeout(() => {
          if (!this._hass) this._switchBackend(new RestockApiBackend());
        }, STANDALONE_DELAY_MS);
      }
    }

    /** Use another backend. Drop the old subscriptions and subscribe again on the new one. */
    _switchBackend(backend) {
      this._unsubscribe();
      this._catalogItems = [];
      this._shoppingItems = [];
      this._questionItems = [];
      this._historyItems = [];
      this._backend = backend;
      this._subscribe();
    }

    disconnectedCallback() {
      this._unsubscribe();
      this._stopDeals();
      this._clearConfirm();
    }

    /** Load the deals and prices files now, then every 6 hours. A false URL skips that file. */
    _startDeals() {
      this._stopDeals();
      if (!this._config?.dealsUrl && !this._config?.pricesUrl) return;
      this._loadSources();
      this._dealsTimer = setInterval(() => this._loadSources(), DEALS_REFRESH_MS);
    }

    _loadSources() {
      if (this._config?.dealsUrl) this._loadDeals();
      if (this._config?.pricesUrl) this._loadPrices();
    }

    _stopDeals() {
      clearInterval(this._dealsTimer);
      this._dealsTimer = null;
    }

    /** Set the add-item placeholder and label from item_label. */
    _applyLabels() {
      const label = this._config?.itemLabel ?? 'item';
      const text = `Add ${articleFor(label)} ${label}`;
      this._nameInput.setAttribute('placeholder', text);
      this._nameInput.setAttribute('aria-label', text);
    }

    /** Run the start-order script. Errors show in the error bar. */
    _startOrder() {
      const script = this._config?.startOrder;
      if (!script || !this._backend) return;
      let result;
      try {
        result = this._backend.startOrder(script);
      } catch (err) {
        this._onServiceError('start order', err);
        return;
      }
      Promise.resolve(result).catch((err) => this._onServiceError('start order', err));
    }

    /** Read the deals file. A failed read keeps the last deals and logs a warning. No error bar. */
    async _loadDeals() {
      const url = this._config?.dealsUrl;
      if (!url) return;
      try {
        const res = await fetch(url, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        this._deals = await res.json();
        this._render();
      } catch (err) {
        console.warn(`restock-card: deals not loaded from ${url}`, err);
      }
    }

    /** Read the prices file. A failed read keeps the last prices and logs a warning. No error bar. */
    async _loadPrices() {
      const url = this._config?.pricesUrl;
      if (!url) return;
      try {
        const res = await fetch(url, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        this._prices = await res.json();
        this._render();
      } catch (err) {
        console.warn(`restock-card: prices not loaded from ${url}`, err);
      }
    }

    _buildDom() {
      const root = this.attachShadow({ mode: 'open' });

      this._titleEl = el('div', { class: 'title', dir: 'auto' });
      this._countEl = el('div', { class: 'count' });
      this._estimateEl = el('div', { class: 'count', dir: 'auto', hidden: '' });
      this._editBtn = el('button', { type: 'button', class: 'edit-toggle', text: 'Edit' });
      this._editBtn.addEventListener('click', () => {
        this._editMode = !this._editMode;
        this._clearConfirm();
        this._closeEditor();
        this._render();
      });
      this._fillBtn = el('button', { type: 'button', class: 'fill-btn', text: 'Fill up', hidden: '' });
      this._fillBtn.addEventListener('click', () => this._fillUp());
      this._orderBtn = el('button', { type: 'button', class: 'fill-btn', text: 'Start new order', hidden: '' });
      this._orderBtn.addEventListener('click', () => this._startOrder());
      this._planBtn = el('button', { type: 'button', class: 'fill-btn', text: 'Plan order', hidden: '' });
      this._planBtn.addEventListener('click', () => {
        this._planOpen = !this._planOpen;
        this._closeEditor();
        this._render();
      });
      this._orderNote = el('div', { class: 'notice warn', role: 'status', hidden: '' });
      const header = el(
        'div', { class: 'header' },
        el('div', {}, this._titleEl, this._countEl, this._estimateEl),
        el('div', { class: 'head-actions' }, this._orderBtn, this._planBtn, this._fillBtn, this._editBtn),
      );

      this._planEl = el('section', { class: 'plan', dir: 'auto', hidden: '' });
      this._planStatus = el('p', { class: 'plan-status', role: 'status' });

      this._editorEl = el('section', { class: 'editor', dir: 'auto', hidden: '' });
      this._body = el('div', { class: 'body' });

      this._nameInput = el('input', {
        type: 'text', class: 'name-input', dir: 'auto', autocomplete: 'off',
        placeholder: 'Add an item', 'aria-label': 'Add an item',
      });
      this._catInput = el('input', {
        type: 'text', class: 'cat-input', dir: 'auto', autocomplete: 'off',
        placeholder: 'Category', 'aria-label': 'Category', list: 'restock-categories',
      });
      this._datalist = el('datalist', { id: 'restock-categories' });
      const addBtn = el('button', { type: 'submit', class: 'add-btn', text: 'Add' });
      this._form = el('form', { class: 'add-row' }, this._nameInput, this._catInput, this._datalist, addBtn);
      this._form.addEventListener('submit', (event) => {
        event.preventDefault();
        this._addItem();
      });

      this._dealsEl = el('details', { class: 'deals', dir: 'auto', hidden: '' });
      this._dealsEl.addEventListener('toggle', () => { this._dealsOpen = this._dealsEl.open; });

      this._questionsEl = el('section', { class: 'questions', dir: 'auto', hidden: '' });
      this._askBtn = el('button', { type: 'button', class: 'q-open', text: 'Ask a question', hidden: '' });
      this._askBtn.addEventListener('click', () => {
        this._asking = true;
        this._render();
        this._askText.focus();
      });
      this._askText = el('input', {
        type: 'text', dir: 'auto', autocomplete: 'off',
        placeholder: 'Ask a question', 'aria-label': 'Question',
      });
      this._askAbout = el('input', {
        type: 'text', dir: 'auto', autocomplete: 'off',
        placeholder: 'About (optional)', 'aria-label': 'About', list: 'restock-question-items',
      });
      this._aboutList = el('datalist', { id: 'restock-question-items' });
      this._askForm = el(
        'form', { class: 'q-ask' },
        this._askText, this._askAbout, this._aboutList,
        el('button', { type: 'submit', class: 'add-btn', text: 'Add' }),
      );
      this._askForm.addEventListener('submit', (event) => {
        event.preventDefault();
        this._askQuestion();
      });

      this._errorText = el('span', { class: 'notice-text' });
      const errorClose = el('button', {
        type: 'button', class: 'notice-close', 'aria-label': 'Dismiss error', text: '✕',
      });
      errorClose.addEventListener('click', () => this._hideError());
      this._errorEl = el(
        'div', { class: 'notice error', role: 'alert', hidden: '' },
        this._errorText, errorClose,
      );
      this._warnEl = el('div', {
        class: 'notice warn', role: 'status', hidden: '', text: CAPABILITY_WARNING,
      });

      const wrap = el(
        'div', { class: 'wrap' },
        this._errorEl, this._warnEl, this._orderNote, header, this._planEl, this._dealsEl, this._questionsEl, this._askBtn,
        this._editorEl, this._body, this._form,
      );
      root.append(el('style', { text: CSS }), el('ha-card', {}, wrap));
    }

    _subscribe() {
      if (this._subscribed || !this._backend?.ready || !this._config || !this.isConnected) return;
      this._subscribed = true;
      const subs = [
        this._subscribeList(this._config.catalog, (items) => { this._catalogItems = items; }),
        this._subscribeList(this._config.shopping, (items) => {
          this._shoppingItems = items;
          this._reconcilePending();
        }),
      ];
      if (this._config.questions) {
        subs.push(this._subscribeList(this._config.questions, (items) => { this._questionItems = items; }));
      }
      if (this._config.history) {
        subs.push(this._subscribeList(this._config.history, (items) => {
          this._historyItems = items;
          this._reconcileEvents();
        }));
      }
      this._unsubs = subs;
    }

    _subscribeList(entityId, store) {
      const promise = this._backend.subscribeList(entityId, (items) => {
        store(items);
        this._render();
      });
      promise.catch((err) => console.error(`restock-card: subscribe failed for ${entityId}`, err));
      return promise;
    }

    _unsubscribe() {
      for (const pending of this._unsubs) {
        Promise.resolve(pending)
          .then((unsub) => { if (typeof unsub === 'function') unsub(); })
          .catch(() => {});
      }
      this._unsubs = [];
      this._subscribed = false;
    }

    _clearConfirm() {
      clearTimeout(this._confirmTimer);
      this._confirmTimer = null;
      this._confirmUid = null;
    }

    /** Call a todo service. A rejection shows an error bar and rolls back the optional pending key. */
    _callTodo(service, entityId, data, key) {
      if (!this._backend) return;
      let result;
      try {
        result = this._backend.callTodo(service, entityId, data);
      } catch (err) {
        this._onServiceError(service, err, key);
        return;
      }
      Promise.resolve(result).catch((err) => this._onServiceError(service, err, key));
    }

    _onServiceError(service, err, key) {
      const message = err?.message || err?.code || String(err);
      console.error(`restock-card: ${service} failed`, err);
      if (key !== undefined) this._clearPending(key);
      this._showError(message);
      this._render();
    }

    _showError(message) {
      clearTimeout(this._errorTimer);
      this._errorText.textContent = `restock-card: ${oneLine(message)}`;
      this._errorEl.hidden = false;
      this._errorTimer = setTimeout(() => this._hideError(), ERROR_MS);
    }

    _hideError() {
      clearTimeout(this._errorTimer);
      this._errorTimer = null;
      this._errorEl.hidden = true;
      this._errorText.textContent = '';
    }

    /** Set an optimistic quantity. It clears when the list shows it, or after PENDING_MS. */
    _setPending(key, quantity) {
      clearTimeout(this._pendingTimers.get(key));
      this._pendingQty.set(key, quantity);
      this._pendingTimers.set(key, setTimeout(() => {
        this._clearPending(key);
        this._render();
      }, PENDING_MS));
    }

    _clearPending(key) {
      clearTimeout(this._pendingTimers.get(key));
      this._pendingTimers.delete(key);
      this._pendingQty.delete(key);
      this._addPending.delete(key);
    }

    /** Called after each shopping-list update. Clears settled counts. Pushes counts lost behind an add. */
    _reconcilePending() {
      for (const [key, quantity] of [...this._pendingQty]) {
        const match = findOnList(key, this._shoppingItems);
        if (!match) continue;
        const entry = parseEntry(match.description);
        if (this._addPending.has(key) && entry.quantity < quantity) {
          this._addPending.delete(key);
          this._callTodo('update_item', this._config.shopping, {
            item: match.uid,
            description: formatEntry({
              quantity,
              details: entry.details,
              prefer: entry.prefer,
              buyAt: entry.buyAt,
              links: entry.links,
              products: entry.products,
            }),
          }, key);
        } else if (entry.quantity === quantity) {
          this._clearPending(key);
        }
      }
    }

    _quantityOf(item) {
      return this._pendingQty.get(norm(item.summary)) ?? parseEntry(item.description).quantity;
    }

    /** Units of an item already on the order list, or pending. 0 when it is not on the list. */
    _onOrderOf(name, match) {
      if (match) return this._quantityOf(match);
      return this._pendingQty.get(norm(name)) ?? 0;
    }

    /** Catalog items with a wanted amount that is not yet covered by home stock and the order list. */
    _shortItems() {
      const out = [];
      for (const item of this._catalogItems) {
        const name = String(item.summary ?? '').trim();
        const stock = stockOf(item.description);
        if (!name || stock.want === null) continue;
        const match = findOnList(name, this._shoppingItems);
        const missing = missingOf(stock, this._onOrderOf(name, match));
        if (missing > 0) out.push({ item, name, match, missing });
      }
      return out;
    }

    /** Order the missing units of every short item. A new entry gets the catalog details. An entry on the list gets more units. No history is logged. */
    _fillUp() {
      if (!this._config) return;
      for (const { item, name, match, missing } of this._shortItems()) {
        const key = norm(name);
        if (match) {
          const entry = parseEntry(match.description);
          const next = this._quantityOf(match) + missing;
          this._setPending(key, next);
          this._callTodo('update_item', this._config.shopping, {
            item: match.uid,
            description: formatEntry({
              quantity: next,
              details: entry.details,
              prefer: entry.prefer,
              buyAt: entry.buyAt,
              links: entry.links,
              products: entry.products,
            }),
          }, key);
        } else {
          if (this._addPending.has(key)) continue; // add_item is in flight. The next update shows it.
          this._setPending(key, missing);
          this._addPending.add(key);
          this._callTodo('add_item', this._config.shopping, {
            item: name,
            description: formatEntry({
              quantity: missing,
              details: defaultDetailsOf(item.description),
              prefer: preferOf(item.description),
              links: linksOf(item.description),
              products: catalogProductsOf(item.description),
            }),
          }, key);
        }
      }
    }

    /** The store settings: the config stores map, with the fees and minimums saved in this browser. */
    _splitStores() {
      return storesOf(this._config?.stores, this._savedSplit().stores);
    }

    /** The Plan order settings saved in this browser: {maxStores, stores}. {} when none or unreadable. */
    _savedSplit() {
      try {
        const saved = JSON.parse(localStorage.getItem(SPLIT_KEY) ?? 'null');
        return saved && typeof saved === 'object' ? saved : {};
      } catch {
        return {};
      }
    }

    /** Merge a change into the Plan order settings saved in this browser. The card YAML stays the default. */
    _saveSplit(change) {
      try {
        localStorage.setItem(SPLIT_KEY, JSON.stringify({ ...this._savedSplit(), ...change }));
      } catch {
        // Browser storage is off. The settings last until the page reloads.
      }
    }

    _splitMaxStores() {
      try {
        return splitMaxStoresOf(this._savedSplit().maxStores ?? this._config.splitMaxStores);
      } catch {
        return this._config.splitMaxStores;
      }
    }

    _storeName(id) {
      return this._splitStores()[id]?.name ?? id;
    }

    /** The planner input: one row per order entry, with its stored price and the stores that do not sell it. */
    _planInput() {
      const stores = this._splitStores();
      const onList = this._shoppingItems.filter((item) => item.status === 'needs_action');
      const items = onList.map((entry) => {
        const name = String(entry.summary ?? '').trim();
        const prices = pricesFor(name, this._prices);
        const catalog = this._catalogItems.find((item) => norm(item.summary) === norm(name));
        const products = catalog ? catalogProductsOf(catalog.description) : {};
        const quoted = {};
        const none = [];
        for (const id of Object.keys(stores)) {
          const row = prices[id];
          quoted[id] = row && !row.none && typeof row.price === 'number' && Number.isFinite(row.price)
            ? row.price
            : null;
          if (row?.none || norm(products[id] ?? '') === NONE_PRODUCT) none.push(id);
        }
        return { name, quantity: this._quantityOf(entry), prices: quoted, none };
      });
      return { items, stores, maxStores: this._splitMaxStores() };
    }

    /** The age of the oldest price in the plan, such as 'today' or '2 days ago'. '' when none. */
    _planAge(plan) {
      let oldest = null;
      for (const [store, basket] of Object.entries(plan.baskets)) {
        for (const line of basket.items) {
          const time = Date.parse(pricesFor(line.name, this._prices)[store]?.checked);
          if (!Number.isNaN(time) && (oldest === null || time < oldest)) oldest = time;
        }
      }
      return oldest === null ? '' : formatAge(new Date(oldest).toISOString());
    }

    /** One store of the plan: a collapsible list of its items, each with price, quantity and product link. */
    _planBasketEl(id, basket, names) {
      const rows = basket.items.map((line) => {
        const url = pricesFor(line.name, this._prices)[id]?.url;
        const children = [
          el('span', { class: 'ed-deal-text', dir: 'auto', text: line.name }),
          el('span', {
            class: 'ed-price', dir: 'ltr',
            text: `${line.quantity} × ${formatPrice(line.price)} = ${formatPrice(line.price * line.quantity)}`,
          }),
        ];
        if (isHttpsUrl(url)) {
          children.push(el('a', {
            class: 'ed-link', href: url, target: '_blank', rel: 'noopener', dir: 'ltr', text: 'Open',
          }));
        }
        return el('li', { class: 'ed-prefer-row' }, ...children);
      });
      const summary = `${names[id] ?? id} · ${formatPrice(basket.subtotal)} + ${formatPrice(basket.deliveryFee)} delivery `
        + `= ${formatPrice(basket.total)} · ${basket.items.length} items`;
      const details = el(
        'details', { class: 'plan-store', dir: 'auto' },
        el('summary', { text: summary }),
        el('ul', { class: 'ed-prefer-list' }, ...rows),
      );
      details.open = this._planStoreOpen.has(id);
      details.addEventListener('toggle', () => {
        if (details.open) this._planStoreOpen.add(id);
        else this._planStoreOpen.delete(id);
      });
      return details;
    }

    /** The plan settings: the max stores stepper, and each store's delivery fee and minimum order. Saved in this browser. */
    _planSettingsEl(input) {
      const minus = el('button', { type: 'button', class: 'ed-step', 'aria-label': 'Fewer stores', text: '−' });
      const plus = el('button', { type: 'button', class: 'ed-step', 'aria-label': 'More stores', text: '+' });
      minus.addEventListener('click', () => {
        this._saveSplit({ maxStores: Math.max(1, input.maxStores - 1) });
        this._render();
      });
      plus.addEventListener('click', () => {
        this._saveSplit({ maxStores: Math.min(MAX_STORES_LIMIT, input.maxStores + 1) });
        this._render();
      });
      const amount = (text, fallback) => {
        const n = Number(text);
        return String(text).trim() !== '' && Number.isFinite(n) && n >= 0 ? n : fallback;
      };
      const rows = Object.entries(input.stores)
        .filter(([, store]) => store.enabled)
        .map(([id, store]) => {
          const fee = el('input', {
            type: 'number', min: '0', step: '1', dir: 'ltr', 'aria-label': `Delivery fee for ${store.name}`,
          });
          fee.value = String(store.deliveryFee);
          const min = el('input', {
            type: 'number', min: '0', step: '1', dir: 'ltr', 'aria-label': `Minimum order for ${store.name}`,
          });
          min.value = String(store.minOrder);
          const save = () => {
            const current = this._savedSplit().stores ?? {};
            const entry = {
              deliveryFee: amount(fee.value, store.deliveryFee),
              minOrder: amount(min.value, store.minOrder),
            };
            this._saveSplit({ stores: { ...current, [id]: entry } });
            this._render();
          };
          fee.addEventListener('change', save);
          min.addEventListener('change', save);
          return el(
            'li', { class: 'plan-setting' },
            el('span', { class: 'ed-provider', dir: 'auto', text: store.name }),
            el('label', {}, 'Delivery ₪', fee),
            el('label', {}, 'Minimum ₪', min),
          );
        });
      return el(
        'section', { class: 'plan-settings' },
        el('div', { class: 'ed-label', text: 'Plan settings' }),
        el(
          'div', { class: 'ed-row' },
          el('span', { class: 'ed-label', text: 'Max stores' }), minus,
          el('span', { class: 'ed-qty', 'aria-live': 'polite', text: String(input.maxStores) }), plus,
        ),
        el('ul', { class: 'ed-prefer-list' }, ...rows),
        el('p', { class: 'ed-pref-empty', text: 'Saved in this browser. The card YAML sets the default.' }),
      );
    }

    /** Draw the per-store table: what the whole order costs at each enabled store, cheapest first. */
    _perStoreEl(rows) {
      const complete = rows.find((row) => row.complete) ?? null;
      const lowest = rows[0] ?? null;
      const lines = rows.map((row) => {
        const badges = [];
        if (complete && row.store === complete.store) badges.push('cheapest complete');
        if (lowest && row.store === lowest.store && row.store !== complete?.store) badges.push('lowest total');
        const missingNames = row.missing.map((line) => line.name).join(', ');
        const missingText = row.missing.length
          ? `missing: ${missingNames}. ${formatWhole(row.total)} + ${row.missing.length} missing ≈ ${formatWhole(row.missingElsewhereTotal)} at other stores`
          : '';
        const minText = row.belowMinimum ? 'below the minimum order' : '';
        return el(
          'li', { class: row.complete ? 'store-row complete' : 'store-row' },
          el('div', { class: 'store-head', dir: 'auto' },
            el('strong', { text: row.name }),
            ...badges.map((text) => el('span', { class: 'buy-chip', text })),
          ),
          el('div', { class: 'store-line', text: `${row.itemsHave} / ${row.itemsTotal} items · products ${formatMoney(row.subtotal)} · delivery ${formatMoney(row.deliveryFee)} · total ${formatWhole(row.total)}` }),
          ...(missingText ? [el('div', { class: 'store-missing', dir: 'auto', text: missingText })] : []),
          ...(minText ? [el('div', { class: 'store-missing', text: minText })] : []),
        );
      });
      return rows.length
        ? el('ul', { class: 'store-table' }, ...lines)
        : el('p', { class: 'plan-age', text: 'No enabled store.' });
    }

    /** Draw the recommendation lines: the saving against the best single store, and the offer to order at one store. */
    _recommendationEls(plan, rows, names) {
      const rec = recommendation(plan, rows);
      if (rec.split === null) return [];
      const out = [];
      if (plan.bestSingle && plan.savingsVsBestSingle > 0) {
        const single = names[plan.bestSingle.store] ?? plan.bestSingle.store;
        out.push(el('p', {
          class: 'plan-age', dir: 'auto',
          text: `saves ${formatMoney(plan.savingsVsBestSingle)} vs. ${single} (${formatMoney(plan.bestSingle.total)})`,
        }));
      }
      if (rec.offerSingle) {
        out.push(el('p', {
          class: 'plan-unassigned', role: 'status', dir: 'auto',
          text: `only ${formatMoney(rec.extra)} more than splitting — order everything at ${rec.single.name}?`,
        }));
      }
      return out;
    }

    /** Draw the Plan order panel for the order list. It shows the best plan, its stores, and the settings. */
    _renderPlan() {
      const onList = this._shoppingItems.filter((item) => item.status === 'needs_action');
      const open = this._planOpen && onList.length > 0 && Boolean(this._config);
      this._planBtn.hidden = onList.length === 0;
      this._planBtn.classList.toggle('active', this._planOpen);
      this._planEl.hidden = !open;
      if (!open) {
        this._lastPlan = null;
        this._planEl.replaceChildren();
        return;
      }
      const input = this._planInput();
      const plan = planSplit(input);
      this._lastPlan = { plan, input };
      const names = Object.fromEntries(Object.entries(input.stores).map(([id, store]) => [id, store.name]));

      const apply = el('button', { type: 'button', class: 'plan-apply', text: 'Apply plan' });
      apply.disabled = Object.keys(plan.baskets).length === 0;
      apply.addEventListener('click', () => this._applyPlan());
      const rows = perStoreTotals(input.items, input.stores);
      const children = [
        el('div', { class: 'ed-label', text: 'Plan order' }),
        this._perStoreEl(rows),
        el('div', { class: 'ed-label', text: 'Recommended split' }),
        el('p', { class: 'plan-summary', dir: 'auto', text: formatPlanSummary(plan, names) }),
        ...this._recommendationEls(plan, rows, names),
      ];
      if (!this._prices) children.push(el('p', { class: 'plan-age', text: 'Prices not loaded yet.' }));
      const age = this._planAge(plan);
      if (age) children.push(el('p', { class: 'plan-age', text: `Prices checked ${age}` }));
      for (const id of Object.keys(plan.baskets).sort()) {
        children.push(this._planBasketEl(id, plan.baskets[id], names));
      }
      if (plan.unassigned.length) {
        children.push(el('p', {
          class: 'plan-unassigned', role: 'status', dir: 'auto', text: `Not in any plan: ${plan.unassigned.join(', ')}`,
        }));
      }
      children.push(
        this._planSettingsEl(input),
        el('div', { class: 'plan-actions' }, apply),
        this._planStatus,
      );
      this._planEl.replaceChildren(...children);
    }

    /** Write Buy at to each order entry in the plan. Other lines are kept. The status line shows how many entries were tagged. */
    _applyPlan() {
      if (!this._lastPlan || !this._config) return;
      let tagged = 0;
      for (const [store, basket] of Object.entries(this._lastPlan.plan.baskets)) {
        for (const line of basket.items) {
          const match = findOnList(line.name, this._shoppingItems);
          if (!match) continue;
          this._callTodo('update_item', this._config.shopping, {
            item: match.uid,
            description: withBuyAt(match.description, store),
          });
          tagged += 1;
        }
      }
      this._planStatus.textContent = `Tagged ${tagged} ${tagged === 1 ? 'entry' : 'entries'} with Buy at.`;
    }

    _render() {
      if (!this._config) return;
      const onList = this._shoppingItems.filter((item) => item.status === 'needs_action');
      const units = onList.reduce((sum, item) => sum + this._quantityOf(item), 0);
      const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
      this._countEl.textContent = `${plural(onList.length, 'item')} · ${plural(units, 'unit')} on the shopping list`;
      const estimate = orderEstimateText(orderEstimate(
        onList.map((item) => ({ name: item.summary, quantity: this._quantityOf(item) })),
        this._prices,
      ));
      this._estimateEl.textContent = estimate;
      this._estimateEl.hidden = !estimate;
      this._editBtn.textContent = this._editMode ? 'Done' : 'Edit';
      this._editBtn.classList.toggle('active', this._editMode);
      const short = this._shortItems().length;
      this._fillBtn.hidden = short === 0;
      this._fillBtn.textContent = `Fill up (${short})`;

      const states = this._hass?.states ?? {};
      const unsupported = [this._config.shopping, this._config.catalog, this._config.questions, this._config.history]
        .filter(Boolean)
        .some((id) => states[id] && !supportsDescription(states[id]));
      this._warnEl.hidden = !unsupported;

      const script = this._config.startOrder;
      this._orderBtn.hidden = !script;
      const scriptMissing = script && Object.keys(states).length > 0 && !states[script.id];
      this._orderNote.hidden = !scriptMissing;
      this._orderNote.textContent = scriptMissing
        ? `${script.id} not found. Add the script in Home Assistant, or set start_order_script.`
        : '';

      const groups = groupByCategory(this._catalogItems);
      if (groups.length === 0) {
        const label = this._config.itemLabel;
        this._body.replaceChildren(el('div', { class: 'empty', text: `No ${label}s yet. Add one below.` }));
      } else {
        this._body.replaceChildren(...groups.map(([category, items]) => this._groupEl(category, items)));
      }

      this._datalist.replaceChildren(
        ...groups
          .map(([category]) => category)
          .filter((category) => category !== OTHER)
          .map((category) => el('option', { value: category })),
      );
      this._renderDeals();
      this._renderQuestions();
      this._renderPlan();
      if (this._editor) {
        this._paintHistory(this._editor);
        this._paintDeals(this._editor);
      }
      this._queueImageSearches();
    }

    /** The Deals now section: one row per catalog item with a deal. The row opens the editor. */
    _renderDeals() {
      const rows = [];
      for (const item of this._catalogItems) {
        const name = String(item.summary ?? '').trim();
        const best = bestDeal(dealsFor(name, this._deals));
        if (name && best) rows.push(this._dealRow(item, name, best));
      }
      this._dealsEl.hidden = rows.length === 0;
      this._dealsEl.open = this._dealsOpen;
      this._dealsEl.replaceChildren(
        el('summary', { text: `Deals now (${rows.length})` }),
        el('ul', { class: 'deals-list' }, ...rows),
      );
    }

    /** One item with its best deal. Tapping the name opens the editor. The link opens the store page. */
    _dealRow(item, name, best) {
      const open = el(
        'button', { type: 'button', class: 'deal-open' },
        this._visualEl(name, item.description),
        el('span', {},
          el('span', { class: 'deal-name', dir: 'auto', text: name }),
          el('br'),
          el('span', { class: 'deal-text', dir: 'auto', text: `${storeLabelOf(best)} · ${formatDeal(best)}` })),
      );
      open.addEventListener('click', () => this._openEditor(item, name, findOnList(name, this._shoppingItems)));
      const link = isHttpsUrl(best.url)
        ? el('a', { class: 'deal-link', href: best.url, target: '_blank', rel: 'noopener', text: 'Open' })
        : null;
      return el('li', { class: 'deal-item' }, open, ...(link ? [link] : []));
    }

    /** Add a history event for an item. The event is completed once the history list shows it. */
    _logEvent(name, action, quantity) {
      if (!this._config?.history) return;
      const description = formatEvent({ action, quantity, at: new Date().toISOString() });
      this._pendingEvents.add(description);
      this._callTodo('add_item', this._config.history, { item: name, description });
    }

    /** Mark each history event this card added as completed. Each event is marked once. */
    _reconcileEvents() {
      for (const item of this._historyItems) {
        if (item.status !== 'needs_action' || !this._pendingEvents.has(item.description)) continue;
        this._pendingEvents.delete(item.description);
        this._callTodo('update_item', this._config.history, { item: item.uid, status: 'completed' });
      }
    }

    /** Draw the open-questions section. It shows when a question is open or the Ask form is open. The Ask button shows otherwise. */
    _renderQuestions() {
      const configured = Boolean(this._config?.questions);
      const open = this._questionItems.filter((item) => item.status === 'needs_action');
      const answered = this._questionItems.filter((item) => item.status === 'completed');

      this._aboutList.replaceChildren(
        ...this._catalogItems
          .map((item) => oneLine(item.summary))
          .filter(Boolean)
          .map((name) => el('option', { value: name })),
      );

      const show = configured && (open.length > 0 || this._asking);
      this._questionsEl.hidden = !show;
      this._askBtn.hidden = !configured || show;
      if (!show) {
        this._questionsEl.replaceChildren();
        return;
      }
      const children = [
        el('div', { class: 'q-title', text: `Open questions (${open.length})` }),
        ...open.map((item) => this._questionRow(item)),
      ];
      if (answered.length) children.push(this._answeredEl(answered));
      children.push(this._askForm);
      this._questionsEl.replaceChildren(...children);
    }

    _aboutChips(about) {
      return about ? [el('span', { class: 'q-chip', dir: 'auto', text: `About: ${about}` })] : [];
    }

    /** One open question: text, About chip, and an answer box with an Answer button. */
    _questionRow(item) {
      const name = oneLine(item.summary);
      const { about, answer } = parseQuestion(item.description);
      const input = el('input', {
        type: 'text', dir: 'auto', autocomplete: 'off', placeholder: 'Answer', 'aria-label': `Answer: ${name}`,
      });
      input.value = this._drafts.get(item.uid) ?? answer;
      input.addEventListener('input', () => this._drafts.set(item.uid, input.value));
      const form = el(
        'form', { class: 'q-answer' },
        input, el('button', { type: 'submit', class: 'add-btn', text: 'Answer' }),
      );
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        this._answerQuestion(item, about, input.value);
      });
      return el(
        'div', { class: 'q-row' },
        el('div', { class: 'q-text', dir: 'auto', text: name }),
        ...this._aboutChips(about),
        form,
      );
    }

    /** The collapsed Answered toggle. Its open state survives redraws. */
    _answeredEl(answered) {
      const details = el(
        'details', { class: 'q-answered' },
        el('summary', { text: `Answered (${answered.length})` }),
        ...answered.map((item) => this._answeredRow(item)),
      );
      details.open = this._answeredOpen;
      details.addEventListener('toggle', () => { this._answeredOpen = details.open; });
      return details;
    }

    /** One resolved question: text, About chip, read-only answer, and a Reopen button. */
    _answeredRow(item) {
      const name = oneLine(item.summary);
      const { about, answer } = parseQuestion(item.description);
      const reopen = el('button', { type: 'button', class: 'q-btn', text: 'Reopen' });
      reopen.addEventListener('click', () => {
        this._callTodo('update_item', this._config.questions, { item: item.uid, status: 'needs_action' });
      });
      return el(
        'div', { class: 'q-row' },
        el('div', { class: 'q-text', dir: 'auto', text: name }),
        ...this._aboutChips(about),
        el('div', { class: 'q-value', dir: 'auto', text: answer ? `Answer: ${answer}` : 'No answer text' }),
        reopen,
      );
    }

    /** Mark a question resolved with its answer. An empty answer shows an error and sends nothing. */
    _answerQuestion(item, about, rawAnswer) {
      const answer = oneLine(rawAnswer);
      if (!answer) {
        this._showError('Type an answer first.');
        return;
      }
      this._drafts.delete(item.uid);
      this._callTodo('update_item', this._config.questions, {
        item: item.uid,
        description: formatQuestion({ about, answer }),
        status: 'completed',
      });
    }

    /** Add an open question to the shopping questions list. */
    _askQuestion() {
      const summary = oneLine(this._askText.value);
      if (!summary || !this._backend || !this._config?.questions) return;
      this._callTodo('add_item', this._config.questions, {
        item: summary,
        description: formatQuestion({ about: this._askAbout.value }),
      });
      this._askText.value = '';
      this._askAbout.value = '';
    }

    /** Notes for open questions that name this item. The editor shows them. */
    _questionNotes(name) {
      const open = this._questionItems.filter((item) => item.status === 'needs_action');
      return questionsAbout(open, name).map((item) => el('p', {
        class: 'ed-question', dir: 'auto', text: `Open question: ${oneLine(item.summary)}`,
      }));
    }

    _photoSearchEnabled() {
      return this._photoService !== null && !this._imageSearchOff;
    }

    _latestCatalog(uid) {
      return this._catalogItems.find((entry) => entry.uid === uid);
    }

    /** Queue catalog items that have no Image line. Each uid is queued once per session. */
    _queueImageSearches() {
      if (!this._photoSearchEnabled()) return;
      for (const item of this._catalogItems) {
        const name = String(item.summary ?? '').trim();
        if (!item.uid || !name || this._triedImages.has(item.uid)) continue;
        if (hasImageLine(item.description)) continue;
        this._triedImages.add(item.uid);
        this._imageQueue.push(item.uid);
      }
      this._pumpImageQueue();
    }

    /** Run queued lookups, at most PHOTO_IN_FLIGHT at a time. */
    _pumpImageQueue() {
      while (this._photoSearchEnabled() && this._imagesInFlight < PHOTO_IN_FLIGHT && this._imageQueue.length) {
        const uid = this._imageQueue.shift();
        this._imagesInFlight += 1;
        this._autoFindImage(uid).finally(() => {
          this._imagesInFlight -= 1;
          this._pumpImageQueue();
        });
      }
    }

    /** Look up one photo. Save the first hit as the Image line. Never shows an error bar. */
    async _autoFindImage(uid) {
      const item = this._latestCatalog(uid);
      if (!item || hasImageLine(item.description)) return;
      const name = String(item.summary ?? '').trim();
      try {
        const [url] = await this._searchImages(imageQuery(name, defaultDetailsOf(item.description)));
        const latest = this._latestCatalog(uid);
        if (url && latest && this._config && !hasImageLine(latest.description)) {
          this._callTodo('update_item', this._config.catalog, {
            item: uid,
            description: withImage(latest.description, url),
          });
        }
      } catch (err) {
        if (isServiceMissing(err)) {
          this._imageSearchOff = true;
          this._imageQueue = [];
          return;
        }
        console.warn(`restock-card: photo search failed for ${name}`, err);
      }
    }

    /** Call the photo script. Resolve to up to PHOTO_LIMIT image URLs. Reject on failure. */
    async _searchImages(query) {
      if (!this._backend || !this._photoService) throw new Error('Photo search is not connected');
      return this._backend.searchImages(query, this._photoService);
    }

    /** Return the photo of a catalog item as an img in a box, or the emoji. A failed photo falls back to the emoji. */
    _visualEl(name, description, big = false) {
      const emoji = () => el('span', {
        class: big ? 'emoji big' : 'emoji', text: iconFor(name), 'aria-hidden': 'true',
      });
      const { url } = imageOf(description);
      if (!url) return emoji();
      const img = el('img', { src: url, loading: 'lazy', referrerpolicy: 'no-referrer', alt: '' });
      const box = el('span', { class: big ? 'photo-box big' : 'photo-box', 'aria-hidden': 'true' }, img);
      img.addEventListener('error', () => box.replaceWith(emoji()));
      return box;
    }

    _groupEl(category, items) {
      const grid = el('div', { class: 'grid' }, ...items.map((item) => this._tileEl(item)));
      return el('section', { class: 'group' }, el('h3', { class: 'cat', dir: 'auto', text: category }), grid);
    }

    _tileEl(item) {
      const name = String(item.summary ?? '').trim();
      const match = findOnList(name, this._shoppingItems);
      const confirming = this._editMode && this._confirmUid === item.uid;
      const stock = stockOf(item.description);
      const short = stock.want !== null && (stock.have ?? 0) < stock.want;
      const missing = missingOf(stock, this._onOrderOf(name, match));

      const classes = ['tile'];
      if (match) classes.push('on');
      if (this._editMode) classes.push('edit');
      if (confirming) classes.push('confirm');
      if (short) classes.push('short');

      const tile = el('button', { type: 'button', class: classes.join(' ') });
      const wrap = el('div', { class: 'tile-wrap' }, tile);

      if (this._editMode) {
        tile.addEventListener('click', () => this._onEditTap(item.uid));
        tile.append(el('span', { class: 'x', text: '✕', 'aria-hidden': 'true' }));
      } else {
        this._bindPress(
          tile,
          () => this._onTileTap(item, name, match),
          () => this._openEditor(item, name, match),
        );
        if (match) {
          tile.append(el('span', { class: 'badge', text: `×${this._quantityOf(match)}`, 'aria-hidden': 'true' }));
        }
        const pencil = el('button', {
          type: 'button', class: 'pencil', text: '✎', 'aria-label': `Edit ${name}`,
        });
        pencil.addEventListener('pointerdown', (event) => event.stopPropagation());
        pencil.addEventListener('click', (event) => {
          event.stopPropagation();
          this._openEditor(item, name, match);
        });
        wrap.append(pencil);
      }

      tile.append(
        this._visualEl(name, item.description),
        el('span', { class: 'name', dir: 'auto', text: confirming ? 'Tap again to delete' : name }),
      );
      const entry = match ? parseEntry(match.description) : null;
      const details = entry && !this._editMode ? entry.details : '';
      if (details) tile.append(el('span', { class: 'details', dir: 'auto', text: details }));
      const [brand] = entry ? entry.prefer : preferOf(item.description);
      if (brand) tile.append(el('span', { class: 'details', dir: 'auto', text: `★ ${brand}` }));
      if (entry?.buyAt) {
        tile.append(el('span', { class: 'buy-chip', dir: 'auto', text: `🛒 ${this._storeName(entry.buyAt)}`, title: 'Buy at' }));
      }
      const deal = formatDeal(bestDeal(dealsFor(name, this._deals)));
      if (deal) tile.append(el('span', { class: 'deal-badge', dir: 'auto', text: `🏷️ ${deal}`, title: 'Store deal' }));
      const cheapest = cheapestStore(pricesFor(name, this._prices));
      if (cheapest) {
        tile.append(el('span', { class: 'price-badge', dir: 'ltr', text: `from ${formatPrice(cheapest.price)}`, title: 'Cheapest stored price' }));
      }
      if (Object.keys(linksOf(item.description)).length) {
        tile.append(el('span', { class: 'link-mark', title: 'Store links', 'aria-hidden': 'true', text: '🔗' }));
      }
      const every = everyOrderOf(item.description);
      if (every > 0) {
        tile.append(el('span', { class: 'every', dir: 'ltr', text: `↻${every}`, title: 'Every order' }));
      }
      if (stock.want !== null) {
        const need = missing > 0 ? ` · need ${missing}` : '';
        tile.append(el('span', { class: 'stock', dir: 'ltr', text: `${stock.have ?? 0}/${stock.want}${need}` }));
      }
      return wrap;
    }

    /** Short tap runs onTap. A press of LONG_PRESS_MS or more runs onLongPress and no tap. */
    _bindPress(tile, onTap, onLongPress) {
      let timer = null;
      let fired = false;
      const cancel = () => {
        clearTimeout(timer);
        timer = null;
      };
      tile.addEventListener('pointerdown', () => {
        fired = false;
        cancel();
        timer = setTimeout(() => {
          timer = null;
          fired = true;
          onLongPress();
        }, LONG_PRESS_MS);
      });
      for (const type of ['pointerup', 'pointerleave', 'pointercancel', 'pointermove']) {
        tile.addEventListener(type, cancel);
      }
      tile.addEventListener('click', () => {
        if (fired) {
          fired = false;
          return;
        }
        onTap();
      });
    }

    _onTileTap(item, name, match) {
      const key = norm(name);
      if (match) {
        const {
          details, prefer, buyAt, links, products,
        } = parseEntry(match.description);
        const next = this._quantityOf(match) + 1;
        this._setPending(key, next);
        this._callTodo('update_item', this._config.shopping, {
          item: match.uid,
          description: formatEntry({
            quantity: next, details, prefer, buyAt, links, products,
          }),
        }, key);
        return;
      }
      if (this._addPending.has(key)) {
        // add_item was sent but the list does not show it yet. Count the tap. Reconcile pushes it.
        this._setPending(key, this._pendingQty.get(key) + 1);
        return;
      }
      this._setPending(key, 1);
      this._addPending.add(key);
      this._callTodo('add_item', this._config.shopping, {
        item: name,
        description: formatEntry({
          quantity: 1,
          details: defaultDetailsOf(item.description),
          prefer: preferOf(item.description),
          links: linksOf(item.description),
          products: catalogProductsOf(item.description),
        }),
      }, key);
      this._logEvent(name, 'used', 1);
    }

    _onEditTap(uid) {
      if (this._confirmUid === uid) {
        this._clearConfirm();
        this._callTodo('remove_item', this._config.catalog, { item: uid });
        return;
      }
      this._clearConfirm();
      this._confirmUid = uid;
      this._confirmTimer = setTimeout(() => {
        this._clearConfirm();
        this._render();
      }, 3000);
      this._render();
    }

    _openEditor(item, name, match) {
      const key = norm(name);
      const onList = match ? parseEntry(match.description) : null;
      this._editor = {
        item,
        name,
        key,
        match,
        quantity: this._pendingQty.get(key) ?? onList?.quantity ?? 1,
        details: onList ? onList.details : defaultDetailsOf(item.description),
        // Entry brands win when the entry has any. Otherwise use the catalog order, so Save never wipes it.
        prefer: onList?.prefer.length ? onList.prefer : preferOf(item.description),
        // Entry links win when the entry has any. Otherwise use the catalog links, as with Prefer.
        links: Object.keys(onList?.links ?? {}).length ? onList.links : linksOf(item.description),
        // Entry products win when the entry has any. Otherwise use the catalog products, as with links.
        products: Object.keys(onList?.products ?? {}).length ? onList.products : catalogProductsOf(item.description),
        buyAt: onList?.buyAt ?? '', // the store the order split chose. Kept on Save.
        want: stockOf(item.description).want, // null: no wanted amount
        have: stockOf(item.description).have, // null: no home amount. Counts as 0.
        everyOrder: everyOrderOf(item.description), // 0: off
        stockPanel: null, // element of the Stock at home section, repainted by the Log buttons
        linkError: null, // {brand, text}. brand null: the Product per store section. Otherwise the brand row.
        prefPanel: null, // element of the Brand preference section, repainted by its own controls
        productPanel: null, // element of the Product per store section, repainted by its own controls
        remember: false,
        pickedImage: undefined, // undefined: keep photo. url or 'none': set on Save.
        photoResults: null, // array of url once a search ends
        photoStatus: '',
        photoBusy: false,
        photoToken: null,
        logNote: '', // confirmation under the Log buttons, such as "Logged: bought ×2"
        logPanel: null, // element of the Log row, repainted without a full editor redraw
        historyEl: null, // element of the History section, repainted when history changes
        dealsEl: null, // element of the Deals section, repainted when the quantity or deals change
      };
      this._renderEditor();
      this._editorEl.scrollIntoView?.({ block: 'nearest' });
    }

    _closeEditor() {
      this._editor = null;
      this._renderEditor();
    }

    _renderEditor() {
      const state = this._editor;
      if (!state) {
        this._editorEl.hidden = true;
        this._editorEl.replaceChildren();
        return;
      }

      const qtyEl = el('span', { class: 'ed-qty', 'aria-live': 'polite', text: String(state.quantity) });
      const minus = el('button', { type: 'button', class: 'ed-step', 'aria-label': 'Decrease quantity', text: '−' });
      const plus = el('button', { type: 'button', class: 'ed-step', 'aria-label': 'Increase quantity', text: '+' });
      minus.addEventListener('click', () => {
        state.quantity = Math.max(1, state.quantity - 1);
        qtyEl.textContent = String(state.quantity);
        this._paintDeals(state);
      });
      plus.addEventListener('click', () => {
        state.quantity += 1;
        qtyEl.textContent = String(state.quantity);
        this._paintDeals(state);
      });

      const detailsInput = el('input', {
        type: 'text', class: 'ed-details', dir: 'auto', autocomplete: 'off',
        placeholder: 'Brand or variant', 'aria-label': 'Details',
      });
      detailsInput.value = state.details;

      const rememberBox = el('input', { type: 'checkbox' });
      rememberBox.checked = state.remember;

      const save = el('button', { type: 'button', class: 'ed-save', text: 'Save' });
      save.addEventListener('click', () => this._saveEditor(state, detailsInput.value, rememberBox.checked));
      const remove = el('button', { type: 'button', class: 'ed-remove', text: 'Remove from list' });
      remove.addEventListener('click', () => this._removeFromList(state));
      const cancel = el('button', { type: 'button', class: 'ed-cancel', text: 'Cancel' });
      cancel.addEventListener('click', () => this._closeEditor());

      const photoPanel = el('div', { class: 'ed-photos', hidden: '' });
      this._paintPhotos(state, photoPanel, detailsInput);
      const stockPanel = el('section', { class: 'ed-stock' });
      state.stockPanel = stockPanel;
      this._paintStock(state, stockPanel);
      const prefPanel = el('div', { class: 'ed-prefer' });
      state.prefPanel = prefPanel;
      this._paintPrefer(state, prefPanel);
      const productPanel = el('div', { class: 'ed-links' });
      state.productPanel = productPanel;
      this._paintProducts(state, productPanel);
      const dealsPanel = el('section', { class: 'ed-deals', dir: 'auto', hidden: '' });
      state.dealsEl = dealsPanel;
      this._paintDeals(state);

      this._editorEl.replaceChildren(
        el(
          'div', { class: 'ed-head' },
          this._visualEl(state.name, state.item.description, true),
          el('span', { class: 'ed-name', dir: 'auto', text: state.name }),
          ...(state.buyAt ? [el('span', { class: 'buy-chip', dir: 'auto', text: `Buy at ${this._storeName(state.buyAt)}` })] : []),
        ),
        ...this._questionNotes(state.name),
        photoPanel,
        el(
          'div', { class: 'ed-row' },
          el('span', { class: 'ed-label', text: 'Quantity' }),
          minus, qtyEl, plus,
        ),
        el(
          'label', { class: 'ed-row' },
          el('span', { class: 'ed-label', text: 'Details' }),
          detailsInput,
        ),
        stockPanel,
        prefPanel,
        productPanel,
        dealsPanel,
        el(
          'label', { class: 'ed-remember' },
          rememberBox,
          el('span', { text: 'Remember details for next time' }),
        ),
        this._logPanel(state),
        ...(this._config?.history ? [this._historyPanel(state)] : []),
        el('datalist', { id: 'restock-stores' }, ...STORE_SUGGESTIONS.map((s) => el('option', { value: s }))),
        el('div', { class: 'ed-actions' }, ...[save, state.match && remove, cancel].filter(Boolean)),
      );
      this._editorEl.hidden = false;
    }

    /** The Stock at home section: Wanted and Have steppers. Only this section redraws, so typed details stay. */
    _paintStock(state, panel) {
      const repaint = () => this._paintStock(state, panel);
      const stepper = (label, shown, onMinus, onPlus) => {
        const minus = el('button', { type: 'button', class: 'ed-step', 'aria-label': `Decrease ${label}`, text: '−' });
        const plus = el('button', { type: 'button', class: 'ed-step', 'aria-label': `Increase ${label}`, text: '+' });
        minus.addEventListener('click', () => { onMinus(); repaint(); });
        plus.addEventListener('click', () => { onPlus(); repaint(); });
        return el(
          'div', { class: 'ed-row' },
          el('span', { class: 'ed-label', text: label }),
          minus,
          el('span', { class: 'ed-qty', 'aria-live': 'polite', text: shown }),
          plus,
        );
      };
      const wantRow = stepper(
        'Wanted',
        state.want === null ? 'not set' : String(state.want),
        () => { if (state.want !== null) state.want = Math.max(0, state.want - 1); },
        () => { state.want = (state.want ?? 0) + 1; },
      );
      if (state.want !== null) {
        const clear = el('button', { type: 'button', class: 'ed-clear', text: 'Clear' });
        clear.addEventListener('click', () => { state.want = null; repaint(); });
        wantRow.append(clear);
      }
      const haveRow = stepper(
        'Have',
        String(state.have ?? 0),
        () => { state.have = Math.max(0, (state.have ?? 0) - 1); },
        () => { state.have = (state.have ?? 0) + 1; },
      );
      const everyRow = stepper(
        'Every order',
        state.everyOrder === 0 ? 'off' : String(state.everyOrder),
        () => { state.everyOrder = Math.max(0, state.everyOrder - 1); },
        () => { state.everyOrder += 1; },
      );
      panel.replaceChildren(
        el('div', { class: 'ed-label', text: 'Stock at home' }),
        wantRow,
        haveRow,
        everyRow,
      );
    }

    /** The Log row: Bought, Used up and Threw away buttons, with a confirmation note. Stock changes with each button. History is logged only when the history list is set. */
    _logPanel(state) {
      state.logPanel = el('div', { class: 'ed-log', dir: 'auto' });
      this._paintLog(state);
      return state.logPanel;
    }

    _paintLog(state) {
      const button = (text, action) => {
        const btn = el('button', { type: 'button', text });
        btn.addEventListener('click', () => this._logFromEditor(state, action));
        return btn;
      };
      const children = [
        el('div', { class: 'ed-label', text: 'Log' }),
        el(
          'div', { class: 'ed-log-btns' },
          button('Bought', 'bought'), button('Used up', 'used'), button('Threw away', 'thrown'),
        ),
      ];
      if (state.logNote) children.push(el('p', { class: 'ed-log-note', role: 'status', text: state.logNote }));
      state.logPanel.replaceChildren(...children);
    }

    /** Log a bought or thrown event with the editor quantity. Used up logs one unit. Bought also completes the order entry. Have changes in the catalog. */
    _logFromEditor(state, action) {
      const quantity = action === 'used' ? 1 : state.quantity;
      this._logEvent(state.name, action, quantity);
      if (action === 'bought' && state.match && this._config) {
        this._clearPending(state.key);
        this._callTodo('update_item', this._config.shopping, { item: state.match.uid, status: 'completed' }, state.key);
      }
      this._adjustHave(state, action, quantity);
      state.logNote = this._config?.history
        ? `Logged: ${action} ×${quantity}`
        : `Stock: ${action} ×${quantity}`;
      this._paintLog(state);
    }

    /** Set Have for the action. The editor value is the base, so two quick presses both count. The catalog keeps its Want. */
    _adjustHave(state, action, quantity) {
      state.have = haveAfter(state.have, action, quantity);
      this._paintStock(state, state.stockPanel);
      const uid = state.item.uid;
      if (!uid || !this._config) return;
      const base = this._latestCatalog(uid)?.description ?? state.item.description;
      const { want } = stockOf(base);
      this._callTodo('update_item', this._config.catalog, {
        item: uid,
        description: withStock(base, { want, have: state.have }),
      });
    }

    /** The History section: a stats line and the last events. */
    _historyPanel(state) {
      state.historyEl = el('section', { class: 'ed-history', dir: 'auto' });
      this._paintHistory(state);
      return state.historyEl;
    }

    _paintHistory(state) {
      state.historyEl?.replaceChildren(...this._historyChildren(state.name));
    }

    _historyChildren(name) {
      const now = Date.now();
      const events = eventsFor(name, this._historyItems);
      const title = el('div', { class: 'ed-label', text: 'History' });
      if (events.length === 0) {
        return [title, el('p', { class: 'ed-pref-empty', text: 'No history yet' })];
      }
      const line = statsLine(historyStats(events, now), now);
      const rows = events.slice(0, HISTORY_SHOWN).map((event) => el(
        'li', {},
        el('span', { dir: 'auto', text: relativeTime(event.at, now) }),
        el('span', { dir: 'ltr', text: `${event.action} ×${event.quantity}` }),
      ));
      return [
        title,
        el('p', { class: 'ed-history-stats', dir: 'auto', text: line }),
        el('ul', { class: 'ed-history-list' }, ...rows),
      ];
    }

    /** The Deals section of the editor: each store deal with its link. A hint shows when a deal needs more units than the editor quantity. */
    _paintDeals(state) {
      const panel = state.dealsEl;
      if (!panel) return;
      const deals = dealsFor(state.name, this._deals);
      if (deals.length === 0) {
        panel.hidden = true;
        panel.replaceChildren();
        return;
      }
      const hints = dealBuyHints(deals, state.quantity).map((deal) => el('p', {
        class: 'ed-deal-hint', role: 'status', dir: 'ltr',
        text: `Deal: buy ${deal.dealQuantity} at ${storeLabelOf(deal)}`,
      }));
      const rows = deals.map((deal) => el(
        'li', { class: 'ed-prefer-row' },
        el('span', { class: 'ed-provider', dir: 'ltr', text: storeLabelOf(deal) }),
        el('span', { class: 'ed-deal-text', dir: 'auto', text: formatDeal(deal) }),
        ...(isHttpsUrl(deal.url)
          ? [el('a', { class: 'ed-link', href: deal.url, target: '_blank', rel: 'noopener', dir: 'ltr', text: 'Open' })]
          : []),
      ));
      panel.hidden = false;
      panel.replaceChildren(
        el('div', { class: 'ed-label', text: 'Deals' }),
        el('ul', { class: 'ed-prefer-list' }, ...rows),
        ...hints,
      );
    }

    /** Draw the brand preference list and the Add brand form. Only this panel redraws, so typed details stay. */
    _paintPrefer(state, panel) {
      const repaint = () => this._paintPrefer(state, panel);
      const rows = state.prefer.map((brand, index) => {
        const up = el('button', { type: 'button', class: 'ed-move', 'aria-label': 'Move up', text: '↑' });
        const down = el('button', { type: 'button', class: 'ed-move', 'aria-label': 'Move down', text: '↓' });
        const remove = el('button', { type: 'button', class: 'ed-move', 'aria-label': 'Remove', text: '✕' });
        up.disabled = index === 0;
        down.disabled = index === state.prefer.length - 1;
        up.addEventListener('click', () => {
          state.prefer = moveItem(state.prefer, index, -1);
          repaint();
        });
        down.addEventListener('click', () => {
          state.prefer = moveItem(state.prefer, index, 1);
          repaint();
        });
        remove.addEventListener('click', () => {
          state.prefer = state.prefer.filter((_, i) => i !== index);
          state.links = withoutBrandLinks(state.links, brand);
          repaint();
        });
        return el(
          'li', { class: 'ed-brand-item' },
          el(
            'div', { class: 'ed-prefer-row' },
            el('span', { class: 'ed-rank', text: `${index + 1}.` }),
            el('span', { class: 'ed-brand', dir: 'auto', text: brand }),
            up, down, remove,
          ),
          this._brandLinksEl(state, brand, repaint),
        );
      });

      const input = el('input', {
        type: 'text', dir: 'auto', autocomplete: 'off',
        placeholder: 'Add brand', 'aria-label': 'Add brand',
      });
      const addForm = el(
        'form', { class: 'ed-prefer-add' },
        input,
        el('button', { type: 'submit', text: 'Add' }),
      );
      addForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const brand = oneLine(input.value.replaceAll(PREFER_SEPARATOR, ' '));
        if (brand && !state.prefer.some((b) => norm(b) === norm(brand))) {
          state.prefer = [...state.prefer, brand];
        }
        repaint();
        panel.querySelector(':scope > .ed-prefer-add input')?.focus();
      });

      panel.replaceChildren(
        el('div', { class: 'ed-label', text: 'Brand preference' }),
        rows.length
          ? el('ul', { class: 'ed-prefer-list' }, ...rows)
          : el('p', { class: 'ed-pref-empty', text: 'No brand preference yet.' }),
        addForm,
      );
    }

    /** The store links of one brand, with an Add link form. repaint redraws the brand preference panel. */
    _brandLinksEl(state, brand, repaint) {
      const rows = linksOfBrand(state.links, brand).map(({ key, store, url }) => {
        const remove = el('button', {
          type: 'button', class: 'ed-move', 'aria-label': `Remove ${store} link for ${brand}`, text: '✕',
        });
        remove.addEventListener('click', () => {
          state.links = Object.fromEntries(Object.entries(state.links).filter(([k]) => k !== key));
          repaint();
        });
        return el(
          'li', { class: 'ed-prefer-row' },
          el('span', { class: 'ed-provider', dir: 'ltr', text: store }),
          el('a', { class: 'ed-link', href: url, target: '_blank', rel: 'noopener', dir: 'ltr', text: url }),
          remove,
        );
      });

      const store = el('input', {
        type: 'text', dir: 'ltr', autocomplete: 'off', list: 'restock-stores',
        placeholder: 'Store', 'aria-label': `Store for ${brand}`,
      });
      const url = el('input', {
        type: 'text', dir: 'ltr', autocomplete: 'off',
        placeholder: 'https://', 'aria-label': `Store link URL for ${brand}`,
      });
      const addForm = el(
        'form', { class: 'ed-prefer-add ed-brand-link-add' },
        store, url,
        el('button', { type: 'submit', text: 'Add' }),
      );
      addForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const name = oneLine(store.value).toLowerCase();
        const link = oneLine(url.value);
        if (!PROVIDER_ID.test(name)) {
          state.linkError = { brand, text: 'Store must be one lowercase word, such as victory.' };
        } else if (!isHttpsUrl(link)) {
          state.linkError = { brand, text: 'Link must start with https://' };
        } else {
          state.linkError = null;
          state.links = { ...state.links, [linkKey(name, brand)]: link };
        }
        repaint();
      });

      const children = [];
      if (rows.length) children.push(el('ul', { class: 'ed-prefer-list ed-brand-links' }, ...rows));
      children.push(addForm);
      if (state.linkError?.brand === brand) {
        children.push(el('p', { class: 'ed-link-error', role: 'alert', text: state.linkError.text }));
      }
      return el('div', { class: 'ed-brand-links-wrap' }, ...children);
    }

    /** Draw the Product per store list and its add row. Each row is one store: its product, its link, and a remove button. Only this panel redraws, so typed details stay. */
    _paintProducts(state, panel) {
      const repaint = () => this._paintProducts(state, panel);
      const rows = storeRows(state.links, state.products)
        .filter((row) => row.brand === null)
        .map(({ store, url, product, none }) => {
          const remove = el('button', {
            type: 'button', class: 'ed-move', 'aria-label': `Remove ${store}`, text: '✕',
          });
          remove.addEventListener('click', () => {
            state.links = Object.fromEntries(Object.entries(state.links).filter(([k]) => k !== store));
            state.products = Object.fromEntries(Object.entries(state.products).filter(([k]) => k !== store));
            repaint();
          });
          const label = product ?? (none ? 'no product here' : 'no product name');
          const priced = priceLabel(pricesFor(state.name, this._prices)[store]);
          const children = [
            el('span', { class: 'ed-provider', dir: 'ltr', text: store }),
            el('span', { class: 'ed-deal-text', dir: 'auto', text: label }),
            ...(priced ? [el('span', { class: 'ed-price', dir: 'ltr', text: priced, title: 'Stored price' })] : []),
          ];
          if (url) {
            children.push(el('a', {
              class: 'ed-link', href: url, target: '_blank', rel: 'noopener', dir: 'ltr', text: 'Open',
            }));
          }
          children.push(remove);
          return el('li', { class: 'ed-prefer-row' }, ...children);
        });

      const store = el('input', {
        type: 'text', dir: 'ltr', autocomplete: 'off', list: 'restock-stores',
        placeholder: 'Store', 'aria-label': 'Store',
      });
      const product = el('input', {
        type: 'text', dir: 'auto', autocomplete: 'off',
        placeholder: 'Product, or none', 'aria-label': 'Product name',
      });
      const url = el('input', {
        type: 'text', dir: 'ltr', autocomplete: 'off',
        placeholder: 'https:// (optional)', 'aria-label': 'Store link URL',
      });
      const addForm = el(
        'form', { class: 'ed-prefer-add ed-link-add' },
        store,
        product,
        url,
        el('button', { type: 'submit', text: 'Add' }),
      );
      addForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const name = oneLine(store.value).toLowerCase();
        const text = oneLine(product.value);
        const link = oneLine(url.value);
        if (!PROVIDER_ID.test(name)) {
          state.linkError = { brand: null, text: 'Store must be one lowercase word, such as victory.' };
        } else if (link && !isHttpsUrl(link)) {
          state.linkError = { brand: null, text: 'Link must start with https://' };
        } else if (!text && !link) {
          state.linkError = { brand: null, text: 'Type a product name or a link.' };
        } else {
          state.linkError = null;
          if (link) state.links = { ...state.links, [name]: link };
          if (text) {
            const value = norm(text) === NONE_PRODUCT ? NONE_PRODUCT : text;
            state.products = { ...state.products, [name]: value };
          }
        }
        repaint();
        const [storeInput, productInput, urlInput] = panel.querySelectorAll('.ed-link-add input');
        const error = state.linkError?.text ?? '';
        let focus = storeInput;
        if (error.startsWith('Link')) focus = urlInput;
        else if (error.startsWith('Type')) focus = productInput;
        focus?.focus();
      });

      const children = [
        el('div', { class: 'ed-label', text: 'Product per store' }),
        rows.length
          ? el('ul', { class: 'ed-prefer-list' }, ...rows)
          : el('p', { class: 'ed-pref-empty', text: 'No store products yet.' }),
        addForm,
      ];
      if (state.linkError?.brand === null) {
        children.push(el('p', { class: 'ed-link-error', role: 'alert', text: state.linkError.text }));
      }
      panel.replaceChildren(...children);
    }

    /** Draw the photo part of the editor: Change photo button, status, and the result grid. */
    _paintPhotos(state, panel, detailsInput) {
      if (!this._photoSearchEnabled()) {
        panel.hidden = true;
        panel.replaceChildren();
        return;
      }
      panel.hidden = false;
      const change = el('button', { type: 'button', class: 'ed-photo-btn', text: 'Change photo' });
      change.disabled = state.photoBusy;
      change.addEventListener('click', () => this._searchPhotos(state, panel, detailsInput));
      const parts = [change];
      if (state.photoStatus) {
        parts.push(el('p', { class: 'ed-photo-status', role: 'status', text: state.photoStatus }));
      }
      if (state.photoResults) {
        const choose = (value) => {
          state.pickedImage = value;
          this._paintPhotos(state, panel, detailsInput);
        };
        const option = (value, content, label) => {
          const picked = state.pickedImage === value;
          const btn = el('button', {
            type: 'button', class: picked ? 'photo-opt on' : 'photo-opt',
            'aria-label': label, 'aria-pressed': String(picked),
          }, content);
          btn.addEventListener('click', () => choose(value));
          return btn;
        };
        parts.push(el(
          'div', { class: 'photo-grid' },
          option('none', el('span', { text: 'No photo' }), 'No photo'),
          ...state.photoResults.map((url) => option(
            url,
            el('img', { src: url, loading: 'lazy', referrerpolicy: 'no-referrer', alt: '' }),
            'Use this photo',
          )),
        ));
      }
      panel.replaceChildren(...parts);
    }

    /** Search photos for the editor name and the details now typed. Results land in the grid. */
    async _searchPhotos(state, panel, detailsInput) {
      const token = {};
      state.photoToken = token;
      state.photoBusy = true;
      state.photoResults = null;
      state.photoStatus = 'Searching…';
      state.pickedImage = undefined;
      this._paintPhotos(state, panel, detailsInput);

      const details = oneLine(detailsInput.value) || defaultDetailsOf(state.item.description);
      let images = [];
      let failed = false;
      try {
        images = await this._searchImages(imageQuery(state.name, details));
      } catch (err) {
        failed = true;
        console.warn('restock-card: photo search failed', err);
      }
      if (state.photoToken !== token || this._editor !== state) return;
      state.photoBusy = false;
      state.photoResults = images;
      if (failed) state.photoStatus = 'Photo search failed';
      else state.photoStatus = images.length ? '' : 'No photos found';
      this._paintPhotos(state, panel, detailsInput);
    }

    _saveEditor(state, rawDetails, remember) {
      if (!this._config) return;
      const details = oneLine(rawDetails);
      const prefer = state.prefer;
      const links = state.links;
      const products = state.products;
      const description = formatEntry({
        quantity: state.quantity, details, prefer, buyAt: state.buyAt, links, products,
      });
      this._setPending(state.key, state.quantity);
      if (state.match) {
        this._callTodo('update_item', this._config.shopping, { item: state.match.uid, description }, state.key);
      } else {
        this._addPending.add(state.key);
        this._callTodo('add_item', this._config.shopping, { item: state.name, description }, state.key);
      }
      const uid = state.item.uid;
      if (uid) {
        let catalog = this._latestCatalog(uid)?.description ?? state.item.description;
        if (remember) catalog = withDefaultDetails(catalog, details);
        if (state.pickedImage !== undefined) catalog = withImage(catalog, state.pickedImage);
        catalog = withPrefer(catalog, prefer);
        catalog = withLinks(catalog, links);
        catalog = withProducts(catalog, products);
        catalog = withEveryOrder(catalog, state.everyOrder);
        catalog = withStock(catalog, { want: state.want, have: state.have });
        this._callTodo('update_item', this._config.catalog, { item: uid, description: catalog });
      }
      this._closeEditor();
    }

    _removeFromList(state) {
      if (!state.match || !this._config) return;
      this._clearPending(state.key);
      this._callTodo('remove_item', this._config.shopping, { item: state.match.uid });
      this._closeEditor();
    }

    _addItem() {
      const name = this._nameInput.value.trim();
      const category = this._catInput.value.trim();
      if (!name || !this._backend) return;
      if (this._catalogItems.some((item) => norm(item.summary) === norm(name))) return;
      this._callTodo('add_item', this._config.catalog, { item: name, description: category });
      this._nameInput.value = '';
      this._catInput.value = '';
    }
  }

  if (!customElements.get(CARD_TYPE)) {
    customElements.define(CARD_TYPE, RestockCard);
  }
  window.customCards = window.customCards || [];
  if (!window.customCards.some((card) => card.type === CARD_TYPE)) {
    window.customCards.push({
      type: CARD_TYPE,
      name: 'Restock card',
      description: 'Tap household items to add them to the shopping list.',
    });
  }
}

const HAS_DOM = typeof HTMLElement !== 'undefined'
  && typeof customElements !== 'undefined'
  && typeof window !== 'undefined';

if (HAS_DOM) defineRestockCard();
