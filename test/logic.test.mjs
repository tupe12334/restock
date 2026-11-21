import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  iconFor,
  categoryOf,
  groupByCategory,
  findOnList,
  parseEntry,
  formatEntry,
  defaultDetailsOf,
  withDefaultDetails,
  supportsDescription,
  imageOf,
  withImage,
  imageQuery,
  preferOf,
  withPrefer,
  parsePrefer,
  formatPrefer,
  moveItem,
  linksOf,
  withLinks,
  brandLinksOf,
  linkKey,
  splitLinkKey,
  isHttpsUrl,
  parseQuestion,
  formatQuestion,
  questionsAbout,
  formatEvent,
  parseEvent,
  historyStats,
  eventsFor,
  stockOf,
  withStock,
  missingOf,
  haveAfter,
  dealsFor,
  bestDeal,
  formatDeal,
  dealBuyHints,
  dealsUrlOf,
  everyOrderOf,
  withEveryOrder,
  storeProductsOf,
  withStoreProduct,
  startOrderOf,
  itemLabelOf,
  articleFor,
} from '../restock-card.js';

test('supportsDescription is false for a missing state', () => {
  assert.equal(supportsDescription(undefined), false);
  assert.equal(supportsDescription(null), false);
});

test('supportsDescription checks bit 64 of supported_features', () => {
  assert.equal(supportsDescription({ attributes: { supported_features: 64 } }), true);
  assert.equal(supportsDescription({ attributes: { supported_features: 127 } }), true);
  assert.equal(supportsDescription({ attributes: { supported_features: 63 } }), false);
  assert.equal(supportsDescription({ attributes: { supported_features: 128 } }), false);
  assert.equal(supportsDescription({ attributes: { supported_features: 0 } }), false);
  assert.equal(supportsDescription({ attributes: {} }), false);
  assert.equal(supportsDescription({}), false);
});

test('iconFor maps cola and soda names', () => {
  assert.equal(iconFor('Cola'), '🥤');
  assert.equal(iconFor('קולה'), '🥤');
  assert.equal(iconFor('Pepsi Max'), '🥤');
});

test('iconFor maps English keywords', () => {
  assert.equal(iconFor('Milk'), '🥛');
  assert.equal(iconFor('eggs'), '🥚');
  assert.equal(iconFor('Coffee beans'), '☕');
  assert.equal(iconFor('Chicken thighs'), '🍗');
});

test('iconFor maps Hebrew keywords', () => {
  assert.equal(iconFor('חלב'), '🥛');
  assert.equal(iconFor('ביצים'), '🥚');
  assert.equal(iconFor('גבינה לבנה'), '🧀');
  assert.equal(iconFor('נייר טואלט'), '🧻');
});

test('iconFor prefers the longest keyword', () => {
  assert.equal(iconFor('toilet paper'), '🧻');
  assert.equal(iconFor('paper towel'), '🧻');
  assert.equal(iconFor('dish soap'), '🧽');
  assert.equal(iconFor('soap'), '🧼');
  assert.equal(iconFor('eggplant'), '🍆');
  assert.equal(iconFor('steak'), '🥩');
  assert.equal(iconFor('תפוח אדמה'), '🥔');
  assert.equal(iconFor('תפוח'), '🍎');
});

test('iconFor falls back to the cart emoji', () => {
  assert.equal(iconFor('xyzzy widget'), '🛒');
  assert.equal(iconFor(''), '🛒');
  assert.equal(iconFor('   '), '🛒');
  assert.equal(iconFor(undefined), '🛒');
});

test('categoryOf returns Other for empty descriptions', () => {
  assert.equal(categoryOf({ description: '' }), 'Other');
  assert.equal(categoryOf({ description: '   ' }), 'Other');
  assert.equal(categoryOf({}), 'Other');
  assert.equal(categoryOf(undefined), 'Other');
});

test('categoryOf uses the trimmed first line only', () => {
  assert.equal(categoryOf({ description: '  Dairy  ' }), 'Dairy');
  assert.equal(categoryOf({ description: 'Dairy\nignored line' }), 'Dairy');
  assert.equal(categoryOf({ description: 'Dairy\r\nignored' }), 'Dairy');
});

test('groupByCategory sorts categories A to Z with Other last', () => {
  const items = [
    { summary: 'Milk', description: 'Dairy' },
    { summary: 'Bread', description: 'Bakery' },
    { summary: 'Bags', description: '' },
    { summary: 'Butter', description: 'Dairy' },
    { summary: 'Apple', description: 'Fruit' },
    { summary: 'Cheese', description: 'Dairy\nextra notes' },
    { summary: 'Mystery', description: '\n' },
  ];
  const groups = groupByCategory(items);
  assert.deepEqual(
    groups.map(([category]) => category),
    ['Bakery', 'Dairy', 'Fruit', 'Other'],
  );
  const dairy = groups.find(([category]) => category === 'Dairy')[1];
  assert.deepEqual(dairy.map((item) => item.summary), ['Butter', 'Cheese', 'Milk']);
  const other = groups.find(([category]) => category === 'Other')[1];
  assert.deepEqual(other.map((item) => item.summary), ['Bags', 'Mystery']);
});

test('groupByCategory returns an empty array for no items', () => {
  assert.deepEqual(groupByCategory([]), []);
  assert.deepEqual(groupByCategory(undefined), []);
});

test('findOnList matches case and whitespace insensitively', () => {
  const shopping = [
    { uid: 'a', summary: 'Milk', status: 'completed' },
    { uid: 'b', summary: '  milk  ', status: 'needs_action' },
    { uid: 'c', summary: 'Eggs', status: 'needs_action' },
    { uid: 'd', summary: 'Pita   bread', status: 'needs_action' },
  ];
  assert.equal(findOnList('MILK', shopping).uid, 'b');
  assert.equal(findOnList(' eggs ', shopping).uid, 'c');
  assert.equal(findOnList('pita bread', shopping).uid, 'd');
});

test('findOnList ignores completed items and unknown names', () => {
  const shopping = [{ uid: 'a', summary: 'Milk', status: 'completed' }];
  assert.equal(findOnList('Milk', shopping), undefined);
  assert.equal(findOnList('Bread', shopping), undefined);
  assert.equal(findOnList('', shopping), undefined);
  assert.equal(findOnList('Milk', undefined), undefined);
});

test('parseEntry reads quantity and details', () => {
  assert.deepEqual(parseEntry('Quantity: 3\nDetails: Pepsi'), { quantity: 3, details: 'Pepsi', prefer: [], links: {}, products: {} });
  assert.deepEqual(parseEntry('Quantity: 2'), { quantity: 2, details: '', prefer: [], links: {}, products: {} });
});

test('parseEntry defaults to quantity 1 and empty details', () => {
  assert.deepEqual(parseEntry(undefined), { quantity: 1, details: '', prefer: [], links: {}, products: {} });
  assert.deepEqual(parseEntry(''), { quantity: 1, details: '', prefer: [], links: {}, products: {} });
  assert.deepEqual(parseEntry('Details: Pepsi'), { quantity: 1, details: 'Pepsi', prefer: [], links: {}, products: {} });
});

test('parseEntry reads the Prefer line in order', () => {
  assert.deepEqual(
    parseEntry('Quantity: 2\nDetails: Tnuva\nPrefer: Tnuva > Tara > Yotvata'),
    { quantity: 2, details: 'Tnuva', prefer: ['Tnuva', 'Tara', 'Yotvata'], links: {}, products: {} },
  );
  assert.deepEqual(parseEntry('Quantity: 1\nprefer: תנובה > תרא'), { quantity: 1, details: '', prefer: ['תנובה', 'תרא'], links: {}, products: {} });
});

test('parseEntry reads an empty Prefer line as no brands', () => {
  assert.deepEqual(parseEntry('Quantity: 1\nPrefer:'), { quantity: 1, details: '', prefer: [], links: {}, products: {} });
});

test('parseEntry treats zero, negative, fractional and garbage quantity as 1', () => {
  assert.equal(parseEntry('Quantity: 0').quantity, 1);
  assert.equal(parseEntry('Quantity: -4').quantity, 1);
  assert.equal(parseEntry('Quantity: 2.5').quantity, 1);
  assert.equal(parseEntry('Quantity: lots').quantity, 1);
  assert.equal(parseEntry('Quantity:').quantity, 1);
});

test('parseEntry is case-insensitive and tolerates extra spaces', () => {
  assert.deepEqual(
    parseEntry('  quantity :   4  \n DETAILS:   Hebrew brand  '),
    { quantity: 4, details: 'Hebrew brand', prefer: [], links: {}, products: {} },
  );
  assert.deepEqual(parseEntry('QUANTITY: 5\ndetails: Pepsi'), { quantity: 5, details: 'Pepsi', prefer: [], links: {}, products: {} });
});

test('parseEntry keeps Hebrew details', () => {
  assert.deepEqual(
    parseEntry('Quantity: 2\nDetails: לחם אחיד'),
    { quantity: 2, details: 'לחם אחיד', prefer: [], links: {}, products: {} },
  );
});

test('formatEntry writes the two-line format', () => {
  assert.equal(formatEntry({ quantity: 3, details: 'Pepsi' }), 'Quantity: 3\nDetails: Pepsi');
});

test('formatEntry omits the Details line when details are empty', () => {
  assert.equal(formatEntry({ quantity: 1, details: '' }), 'Quantity: 1');
  assert.equal(formatEntry({ quantity: 1, details: '   ' }), 'Quantity: 1');
  assert.equal(formatEntry({ quantity: 1 }), 'Quantity: 1');
  assert.equal(formatEntry(), 'Quantity: 1');
});

test('formatEntry coerces invalid quantity to 1', () => {
  assert.equal(formatEntry({ quantity: 0, details: '' }), 'Quantity: 1');
  assert.equal(formatEntry({ quantity: 'abc', details: '' }), 'Quantity: 1');
  assert.equal(formatEntry({ quantity: 2.5, details: '' }), 'Quantity: 1');
});

test('formatEntry output parses back to the same values', () => {
  const text = formatEntry({ quantity: 7, details: 'לימונדה טבעית' });
  assert.deepEqual(parseEntry(text), { quantity: 7, details: 'לימונדה טבעית', prefer: [], links: {}, products: {} });
});

test('formatEntry writes the Prefer line after Details', () => {
  assert.equal(
    formatEntry({ quantity: 2, details: 'Tnuva', prefer: ['Tnuva', 'Tara'] }),
    'Quantity: 2\nDetails: Tnuva\nPrefer: Tnuva > Tara',
  );
  assert.equal(formatEntry({ quantity: 1, prefer: ['Tnuva'] }), 'Quantity: 1\nPrefer: Tnuva');
});

test('formatEntry omits the Prefer line when the list is empty', () => {
  assert.equal(formatEntry({ quantity: 1, details: '', prefer: [] }), 'Quantity: 1');
  assert.equal(formatEntry({ quantity: 1, prefer: [' ', ''] }), 'Quantity: 1');
});

test('formatEntry and parseEntry round-trip the Prefer list in order', () => {
  const prefer = ['חלב תנובה', 'Tara', 'Yotvata'];
  const text = formatEntry({ quantity: 3, details: 'לחם', prefer });
  assert.deepEqual(parseEntry(text), { quantity: 3, details: 'לחם', prefer, links: {}, products: {} });
});

test('parsePrefer splits on > and trims, drops empties, keeps order', () => {
  assert.deepEqual(parsePrefer('Tnuva > Tara > Yotvata'), ['Tnuva', 'Tara', 'Yotvata']);
  assert.deepEqual(parsePrefer('  Tnuva >  > Tara>  Yotvata  '), ['Tnuva', 'Tara', 'Yotvata']);
  assert.deepEqual(parsePrefer(' > > '), []);
  assert.deepEqual(parsePrefer(''), []);
  assert.deepEqual(parsePrefer(undefined), []);
});

test('parsePrefer dedupes brands case-insensitively and keeps the first spelling', () => {
  assert.deepEqual(parsePrefer('Tnuva > tnuva > Tara > TARA > Tnuva'), ['Tnuva', 'Tara']);
});

test('parsePrefer keeps Hebrew brands', () => {
  assert.deepEqual(parsePrefer('תנובה > תרא > יטבתה'), ['תנובה', 'תרא', 'יטבתה']);
});

test('formatPrefer joins brands with " > " and applies the same cleanup', () => {
  assert.equal(formatPrefer(['Tnuva', 'Tara', 'Yotvata']), 'Tnuva > Tara > Yotvata');
  assert.equal(formatPrefer(['  Tnuva ', '', 'tnuva', 'Tara']), 'Tnuva > Tara');
  assert.equal(formatPrefer(['תנובה']), 'תנובה');
  assert.equal(formatPrefer([]), '');
  assert.equal(formatPrefer(undefined), '');
});

test('preferOf reads the Prefer line of a catalog description', () => {
  assert.deepEqual(preferOf('Dairy\nPrefer: Tnuva > Tara > Yotvata'), ['Tnuva', 'Tara', 'Yotvata']);
  assert.deepEqual(preferOf('Dairy\nprefer: תנובה > תרא'), ['תנובה', 'תרא']);
  assert.deepEqual(preferOf('Dairy\nPrefer: Tnuva > TNUVA'), ['Tnuva']);
});

test('preferOf is empty without a Prefer line', () => {
  assert.deepEqual(preferOf('Dairy'), []);
  assert.deepEqual(preferOf('Dairy\nMilk 3%'), []);
  assert.deepEqual(preferOf('Dairy\nPrefer:'), []);
  assert.deepEqual(preferOf(''), []);
  assert.deepEqual(preferOf(undefined), []);
});

test('the Prefer line is not read as default details', () => {
  assert.equal(defaultDetailsOf('Dairy\nPrefer: Tnuva > Tara'), '');
  assert.equal(defaultDetailsOf('Dairy\nPrefer: Tnuva\nLow fat'), 'Low fat');
  assert.equal(defaultDetailsOf('Dairy\nLow fat\nPrefer: Tnuva'), 'Low fat');
});

test('withPrefer sets the Prefer line between details and Image', () => {
  assert.equal(
    withPrefer('Dairy\nLow fat\nImage: https://x/a.jpg', ['Tnuva', 'Tara']),
    'Dairy\nLow fat\nPrefer: Tnuva > Tara\nImage: https://x/a.jpg',
  );
  assert.equal(withPrefer('Dairy', ['Tnuva']), 'Dairy\nPrefer: Tnuva');
});

test('withPrefer replaces an existing Prefer line and keeps other lines', () => {
  assert.equal(
    withPrefer('Dairy\nPrefer: Old\nLow fat\nImage: none', ['Tnuva', 'Tara']),
    'Dairy\nLow fat\nPrefer: Tnuva > Tara\nImage: none',
  );
});

test('withPrefer removes the Prefer line for an empty list', () => {
  assert.equal(withPrefer('Dairy\nPrefer: Tnuva\nLow fat', []), 'Dairy\nLow fat');
  assert.equal(withPrefer('Dairy\nPrefer: Tnuva', []), 'Dairy');
});

test('withPrefer keeps a Hebrew category and Hebrew brands', () => {
  const text = withPrefer('מזון\nלחם אחיד', ['תנובה', 'אנג׳ל']);
  assert.equal(text, 'מזון\nלחם אחיד\nPrefer: תנובה > אנג׳ל');
  assert.deepEqual(preferOf(text), ['תנובה', 'אנג׳ל']);
});

test('withPrefer keeps the category through the other catalog helpers', () => {
  const withBrands = withPrefer('Dairy\nPrefer: Tnuva > Tara\nImage: https://x/a.jpg', ['Tnuva']);
  assert.equal(withDefaultDetails(withBrands, 'Low fat'), 'Dairy\nLow fat\nPrefer: Tnuva\nImage: https://x/a.jpg');
  assert.equal(withImage(withBrands, 'none'), 'Dairy\nPrefer: Tnuva\nImage: none');
  assert.deepEqual(preferOf(withImage(withBrands, 'none')), ['Tnuva']);
  assert.equal(defaultDetailsOf(withBrands), '');
  assert.deepEqual(imageOf(withBrands), { url: 'https://x/a.jpg', none: false });
});

test('withDefaultDetails and withImage keep the Prefer line', () => {
  assert.equal(
    withDefaultDetails('Dairy\nPrefer: Tnuva > Tara\nold', 'Low fat'),
    'Dairy\nLow fat\nPrefer: Tnuva > Tara',
  );
  assert.equal(
    withImage('Dairy\nPrefer: Tnuva > Tara', 'https://x/a.jpg'),
    'Dairy\nPrefer: Tnuva > Tara\nImage: https://x/a.jpg',
  );
});

test('moveItem swaps an item with its neighbour', () => {
  assert.deepEqual(moveItem(['a', 'b', 'c'], 1, -1), ['b', 'a', 'c']);
  assert.deepEqual(moveItem(['a', 'b', 'c'], 1, 1), ['a', 'c', 'b']);
  assert.deepEqual(moveItem(['a', 'b', 'c'], 0, 1), ['b', 'a', 'c']);
});

test('moveItem clamps at the ends of the array', () => {
  assert.deepEqual(moveItem(['a', 'b', 'c'], 0, -1), ['a', 'b', 'c']);
  assert.deepEqual(moveItem(['a', 'b', 'c'], 2, 1), ['a', 'b', 'c']);
  assert.deepEqual(moveItem(['a', 'b', 'c'], 0, -5), ['a', 'b', 'c']);
  assert.deepEqual(moveItem(['a', 'b', 'c'], 0, 5), ['b', 'c', 'a']);
});

test('moveItem returns a new array and ignores bad input', () => {
  const list = ['a', 'b'];
  const moved = moveItem(list, 0, 1);
  assert.notEqual(moved, list);
  assert.deepEqual(list, ['a', 'b']);
  assert.deepEqual(moveItem(['a'], 5, 1), ['a']);
  assert.deepEqual(moveItem(['a'], -1, 1), ['a']);
  assert.deepEqual(moveItem(['a'], 0.5, 1), ['a']);
  assert.deepEqual(moveItem(undefined, 0, 1), []);
});

test('defaultDetailsOf returns trimmed line 2', () => {
  assert.equal(defaultDetailsOf('Drinks\nPepsi'), 'Pepsi');
  assert.equal(defaultDetailsOf('  Drinks  \n  Pepsi  \nnotes'), 'Pepsi');
  assert.equal(defaultDetailsOf('Drinks\n   '), '');
});

test('defaultDetailsOf returns empty string without line 2', () => {
  assert.equal(defaultDetailsOf('Drinks'), '');
  assert.equal(defaultDetailsOf(''), '');
  assert.equal(defaultDetailsOf(undefined), '');
});

test('withDefaultDetails keeps the category and sets line 2', () => {
  assert.equal(withDefaultDetails('Drinks\nold brand', 'Pepsi'), 'Drinks\nPepsi');
  assert.equal(withDefaultDetails('Drinks', 'Pepsi'), 'Drinks\nPepsi');
  assert.equal(withDefaultDetails('Drinks', 'לימונדה'), 'Drinks\nלימונדה');
});

test('withDefaultDetails drops line 2 when details are empty', () => {
  assert.equal(withDefaultDetails('Drinks\nold brand', ''), 'Drinks');
  assert.equal(withDefaultDetails('Drinks\nold brand', '  '), 'Drinks');
});

test('withDefaultDetails with an empty category keeps line 1 empty', () => {
  const text = withDefaultDetails('', 'Pepsi');
  assert.equal(text, '\nPepsi');
  assert.equal(categoryOf({ description: text }), 'Other');
  assert.equal(defaultDetailsOf(text), 'Pepsi');
  assert.equal(withDefaultDetails('', ''), '');
  assert.equal(withDefaultDetails(undefined, 'Pepsi'), '\nPepsi');
});

test('defaultDetailsOf skips Image lines in any case', () => {
  assert.equal(defaultDetailsOf('Drinks\nImage: https://x/a.jpg\nPepsi'), 'Pepsi');
  assert.equal(defaultDetailsOf('Drinks\nimage: https://x/a.jpg'), '');
  assert.equal(defaultDetailsOf('Drinks\nIMAGE:none\n  Pepsi  '), 'Pepsi');
});

test('defaultDetailsOf keeps Hebrew details', () => {
  assert.equal(defaultDetailsOf('משקאות\nלימונדה טבעית'), 'לימונדה טבעית');
});

test('withDefaultDetails keeps the Image line and replaces details', () => {
  assert.equal(
    withDefaultDetails('Drinks\nold\nImage: https://x/a.jpg', 'Pepsi'),
    'Drinks\nPepsi\nImage: https://x/a.jpg',
  );
  assert.equal(withDefaultDetails('Drinks\nImage: none', ''), 'Drinks\nImage: none');
});

test('imageOf returns the url of an Image line', () => {
  assert.deepEqual(
    imageOf('Drinks\nImage: https://images.openfoodfacts.org/a.jpg'),
    { url: 'https://images.openfoodfacts.org/a.jpg', none: false },
  );
  assert.deepEqual(imageOf('Drinks\nPepsi\nimage:   https://x/b.jpg  '), { url: 'https://x/b.jpg', none: false });
});

test('imageOf reports none for Image: none in any case', () => {
  assert.deepEqual(imageOf('Drinks\nImage: none'), { url: '', none: true });
  assert.deepEqual(imageOf('Drinks\nimage: NONE'), { url: '', none: true });
});

test('imageOf returns an empty url without an Image line', () => {
  assert.deepEqual(imageOf('Drinks\nPepsi'), { url: '', none: false });
  assert.deepEqual(imageOf('Drinks'), { url: '', none: false });
  assert.deepEqual(imageOf(''), { url: '', none: false });
  assert.deepEqual(imageOf(undefined), { url: '', none: false });
});

test('withImage adds an Image line after the details', () => {
  assert.equal(withImage('Drinks\nPepsi', 'https://x/a.jpg'), 'Drinks\nPepsi\nImage: https://x/a.jpg');
  assert.equal(withImage('Drinks', 'https://x/a.jpg'), 'Drinks\nImage: https://x/a.jpg');
});

test('withImage replaces an existing Image line and keeps the details', () => {
  assert.equal(
    withImage('Drinks\nImage: https://x/old.jpg\nPepsi', 'https://x/new.jpg'),
    'Drinks\nPepsi\nImage: https://x/new.jpg',
  );
});

test('withImage writes none and imageOf reads it back', () => {
  assert.equal(withImage('Drinks\nPepsi\nImage: https://x/a.jpg', 'none'), 'Drinks\nPepsi\nImage: none');
  assert.deepEqual(imageOf(withImage('Drinks', 'none')), { url: '', none: true });
});

test('withImage removes the Image line for an empty value', () => {
  assert.equal(withImage('Drinks\nPepsi\nImage: https://x/a.jpg', ''), 'Drinks\nPepsi');
  assert.equal(withImage('Drinks\nImage: none', ''), 'Drinks');
  assert.equal(withImage('Drinks\nImage: none', undefined), 'Drinks');
});

test('withImage keeps a Hebrew category and details', () => {
  assert.equal(
    withImage('מזון\nלחם אחיד', 'https://x/a.jpg'),
    'מזון\nלחם אחיד\nImage: https://x/a.jpg',
  );
});

test('withImage with an empty category keeps line 1 empty', () => {
  const text = withImage('', 'https://x/a.jpg');
  assert.equal(text, '\nImage: https://x/a.jpg');
  assert.equal(categoryOf({ description: text }), 'Other');
  assert.equal(imageOf(text).url, 'https://x/a.jpg');
});

test('imageQuery joins name and details with one space', () => {
  assert.equal(imageQuery('Cola', 'Pepsi Max'), 'Cola Pepsi Max');
  assert.equal(imageQuery('  Milk   fresh ', ' 3%   '), 'Milk fresh 3%');
  assert.equal(imageQuery('  Cola  ', '  '), 'Cola');
  assert.equal(imageQuery('Milk', undefined), 'Milk');
  assert.equal(imageQuery('', 'Pepsi'), 'Pepsi');
  assert.equal(imageQuery('חלב', 'תנובה'), 'חלב תנובה');
});

test('linksOf reads Link lines as provider to url, in line order', () => {
  assert.deepEqual(
    linksOf('Dairy\nLink victory: https://www.victoryonline.co.il/p/1\nLink shufersal: https://www.shufersal.co.il/p/2'),
    { victory: 'https://www.victoryonline.co.il/p/1', shufersal: 'https://www.shufersal.co.il/p/2' },
  );
  assert.deepEqual(Object.keys(linksOf('Dairy\nLink shufersal: https://a\nLink victory: https://b')), ['shufersal', 'victory']);
});

test('linksOf ignores case in the key and lowercases the provider', () => {
  assert.deepEqual(linksOf('Dairy\nlink VICTORY: https://a'), { victory: 'https://a' });
  assert.deepEqual(linksOf('Dairy\nLINK Ramilevy:   https://a  '), { ramilevy: 'https://a' });
});

test('linksOf keeps the first link per provider and skips empty ones', () => {
  assert.deepEqual(linksOf('Dairy\nLink victory: https://a\nLink victory: https://b'), { victory: 'https://a' });
  assert.deepEqual(linksOf('Dairy\nLink victory:\nLink carrefour:   '), {});
});

test('linksOf ignores lines that are not Link lines', () => {
  assert.deepEqual(linksOf('Dairy\nPepsi\nPrefer: Tnuva\nImage: https://x/a.jpg'), {});
  assert.deepEqual(linksOf('Link: https://a'), {});
  assert.deepEqual(linksOf('Dairy\nlinks victory: https://a'), {});
  assert.deepEqual(linksOf(''), {});
  assert.deepEqual(linksOf(undefined), {});
});

test('linksOf reads shopping-list text too', () => {
  assert.deepEqual(
    linksOf('Quantity: 2\nDetails: Tnuva\nPrefer: Tnuva\nLink victory: https://a'),
    { victory: 'https://a' },
  );
});

test('withLinks replaces every Link line and keeps the other lines', () => {
  assert.equal(
    withLinks('Dairy\nPepsi\nLink victory: https://old\nPrefer: Tnuva\nLink shufersal: https://old2\nImage: https://x/a.jpg', { ramilevy: 'https://new' }),
    'Dairy\nPepsi\nPrefer: Tnuva\nLink ramilevy: https://new\nImage: https://x/a.jpg',
  );
});

test('withLinks with an empty object removes every Link line', () => {
  assert.equal(withLinks('Dairy\nLink victory: https://a\nImage: none', {}), 'Dairy\nImage: none');
  assert.equal(withLinks('Quantity: 1\nLink victory: https://a', {}), 'Quantity: 1');
});

test('withLinks appends Link lines to a shopping-list entry', () => {
  assert.equal(
    withLinks('Quantity: 2\nPrefer: Tnuva', { victory: 'https://a', carrefour: 'https://b' }),
    'Quantity: 2\nPrefer: Tnuva\nLink victory: https://a\nLink carrefour: https://b',
  );
});

test('withLinks keeps a Hebrew category and Hebrew text', () => {
  assert.equal(
    withLinks('מזון\nלחם אחיד', { victory: 'https://a' }),
    'מזון\nלחם אחיד\nLink victory: https://a',
  );
  assert.deepEqual(linksOf(withLinks('מזון', { victory: 'https://a' })), { victory: 'https://a' });
});

test('withLinks round-trips through linksOf', () => {
  const links = { victory: 'https://www.victoryonline.co.il/a', shufersal: 'https://www.shufersal.co.il/b' };
  assert.deepEqual(linksOf(withLinks('Dairy\nPepsi', links)), links);
});

test('isHttpsUrl accepts https only', () => {
  assert.equal(isHttpsUrl('https://www.victoryonline.co.il/'), true);
  assert.equal(isHttpsUrl('http://www.victoryonline.co.il/'), false);
  assert.equal(isHttpsUrl('ftp://x.example/a'), false);
  assert.equal(isHttpsUrl('victoryonline.co.il'), false);
  assert.equal(isHttpsUrl('https://'), false);
  assert.equal(isHttpsUrl(''), false);
  assert.equal(isHttpsUrl(undefined), false);
});

test('formatEntry writes Link lines after Prefer', () => {
  assert.equal(
    formatEntry({ quantity: 2, details: 'Tnuva', prefer: ['Tnuva'], links: { victory: 'https://a' } }),
    'Quantity: 2\nDetails: Tnuva\nPrefer: Tnuva\nLink victory: https://a',
  );
});

test('formatEntry drops empty link values and lowercases providers', () => {
  assert.equal(
    formatEntry({ quantity: 1, links: { Victory: 'https://a', shufersal: '  ', ramilevy: '' } }),
    'Quantity: 1\nLink victory: https://a',
  );
});

test('parseEntry returns links and round-trips them', () => {
  const links = { victory: 'https://a', carrefour: 'https://b' };
  const text = formatEntry({ quantity: 3, details: 'לחם', prefer: ['תנובה'], links });
  assert.deepEqual(parseEntry(text), { quantity: 3, details: 'לחם', prefer: ['תנובה'], links, products: {} });
});

test('parseEntry does not read Link lines as details', () => {
  assert.deepEqual(
    parseEntry('Quantity: 1\nLink victory: https://a'),
    { quantity: 1, details: '', prefer: [], links: { victory: 'https://a' }, products: {} },
  );
});

test('defaultDetailsOf and preferOf ignore Link lines', () => {
  assert.equal(defaultDetailsOf('Dairy\nLink victory: https://a'), '');
  assert.equal(defaultDetailsOf('Dairy\nLink victory: https://a\nLow fat'), 'Low fat');
  assert.deepEqual(preferOf('Dairy\nLink victory: https://a\nPrefer: Tnuva'), ['Tnuva']);
  assert.equal(categoryOf({ description: 'Dairy\nLink victory: https://a' }), 'Dairy');
});

test('withDefaultDetails, withPrefer and withImage keep Link lines in canonical order', () => {
  const base = 'Dairy\nLow fat\nPrefer: Tnuva\nLink victory: https://a\nImage: https://x/a.jpg';
  assert.equal(withDefaultDetails(base, 'Full fat'), 'Dairy\nFull fat\nPrefer: Tnuva\nLink victory: https://a\nImage: https://x/a.jpg');
  assert.equal(withPrefer(base, ['Tara']), 'Dairy\nLow fat\nPrefer: Tara\nLink victory: https://a\nImage: https://x/a.jpg');
  assert.equal(withImage(base, 'none'), 'Dairy\nLow fat\nPrefer: Tnuva\nLink victory: https://a\nImage: none');
  assert.deepEqual(linksOf(withImage(base, '')), { victory: 'https://a' });
});

test('withPrefer writes the Link line before Image when the catalog had none', () => {
  const text = withPrefer('Dairy\nImage: https://x/a.jpg', ['Tnuva']);
  assert.equal(withLinks(text, { victory: 'https://a' }), 'Dairy\nPrefer: Tnuva\nLink victory: https://a\nImage: https://x/a.jpg');
});

test('parseQuestion reads About and Answer lines', () => {
  assert.deepEqual(parseQuestion('About: Alex\nAnswer: Tnuva'), { about: 'Alex', answer: 'Tnuva' });
  assert.deepEqual(parseQuestion('About: ביצים\nAnswer: L שמונה'), { about: 'ביצים', answer: 'L שמונה' });
});

test('parseQuestion gives empty strings for missing lines', () => {
  assert.deepEqual(parseQuestion(''), { about: '', answer: '' });
  assert.deepEqual(parseQuestion(undefined), { about: '', answer: '' });
  assert.deepEqual(parseQuestion('About: Milk'), { about: 'Milk', answer: '' });
  assert.deepEqual(parseQuestion('Answer: Tnuva'), { about: '', answer: 'Tnuva' });
  assert.deepEqual(parseQuestion('About:\nAnswer:   '), { about: '', answer: '' });
});

test('parseQuestion is case-insensitive, trims, and keeps colons in the answer', () => {
  assert.deepEqual(
    parseQuestion('answer:  Shufersal  \nABOUT:  Milk '),
    { about: 'Milk', answer: 'Shufersal' },
  );
  assert.deepEqual(parseQuestion('Answer: 3: 1 mix'), { about: '', answer: '3: 1 mix' });
});

test('formatQuestion writes About then Answer and omits empty lines', () => {
  assert.equal(formatQuestion({ about: 'Alex', answer: 'Tnuva' }), 'About: Alex\nAnswer: Tnuva');
  assert.equal(formatQuestion({ about: 'Alex' }), 'About: Alex');
  assert.equal(formatQuestion({ answer: '  Tnuva  ' }), 'Answer: Tnuva');
  assert.equal(formatQuestion({ about: '  ', answer: '' }), '');
  assert.equal(formatQuestion(), '');
});

test('formatQuestion output parses back to the same values', () => {
  const text = formatQuestion({ about: 'פתיתים', answer: 'Osem' });
  assert.deepEqual(parseQuestion(text), { about: 'פתיתים', answer: 'Osem' });
});

test('questionsAbout matches the About line case and spacing insensitively', () => {
  const questions = [
    { uid: 'a', summary: 'Which couscous?', description: 'About: Pasta' },
    { uid: 'b', summary: 'Which milk?', description: 'About:  milk ' },
    { uid: 'c', summary: 'No topic', description: 'Answer: x' },
    { uid: 'd', summary: 'Which pasta shape?', description: 'About: Pasta\nAnswer: Penne' },
  ];
  assert.deepEqual(questionsAbout(questions, ' PASTA ').map((item) => item.uid), ['a', 'd']);
  assert.deepEqual(questionsAbout(questions, 'Milk').map((item) => item.uid), ['b']);
  assert.deepEqual(questionsAbout(questions, 'Bread'), []);
});

test('questionsAbout ignores an empty name and missing lists', () => {
  assert.deepEqual(questionsAbout([{ description: 'About: ' }], ''), []);
  assert.deepEqual(questionsAbout([{ description: 'About: ' }], '  '), []);
  assert.deepEqual(questionsAbout(undefined, 'Milk'), []);
});

test('formatEvent writes Action, Quantity and At lines', () => {
  assert.equal(
    formatEvent({ action: 'bought', quantity: 2, at: '2026-11-01T10:00:00.000Z' }),
    'Action: bought\nQuantity: 2\nAt: 2026-11-01T10:00:00.000Z',
  );
  assert.equal(formatEvent({ action: 'used', at: 'x' }), 'Action: used\nQuantity: 1\nAt: x');
});

test('parseEvent reads back what formatEvent writes', () => {
  const at = '2026-11-01T10:00:00.000Z';
  assert.deepEqual(
    parseEvent(formatEvent({ action: 'thrown', quantity: 3, at })),
    { action: 'thrown', quantity: 3, at },
  );
});

test('parseEvent returns null for an unknown or missing action', () => {
  assert.equal(parseEvent('Action: sold\nQuantity: 1\nAt: 2026-11-01T10:00:00Z'), null);
  assert.equal(parseEvent('Quantity: 1\nAt: 2026-11-01T10:00:00Z'), null);
  assert.equal(parseEvent(''), null);
  assert.equal(parseEvent(undefined), null);
});

test('parseEvent is case-insensitive and defaults quantity to 1', () => {
  assert.deepEqual(parseEvent('  action :  BOUGHT \n quantity: lots'), { action: 'bought', quantity: 1, at: '' });
  assert.deepEqual(
    parseEvent('ACTION: used\nAt: 2026-11-01T10:00:00Z'),
    { action: 'used', quantity: 1, at: '2026-11-01T10:00:00Z' },
  );
  assert.equal(parseEvent('Action: used\nQuantity: 0').quantity, 1);
});

const DAY_MS = 86400000;
const dayAt = (n) => new Date(Date.UTC(2026, 10, 1) + n * DAY_MS).toISOString();
const NOW = Date.UTC(2026, 10, 20);

test('historyStats is empty for no events', () => {
  assert.deepEqual(historyStats([], NOW), {
    lastBought: null, lastUsed: null, boughtCount: 0, thrownCount: 0, thrownUnits: 0, avgDaysBetweenBuys: null,
  });
  assert.equal(historyStats(undefined, NOW).boughtCount, 0);
});

test('historyStats counts actions and finds the latest dates', () => {
  const stats = historyStats([
    { action: 'bought', quantity: 2, at: dayAt(0) },
    { action: 'used', quantity: 1, at: dayAt(3) },
    { action: 'bought', quantity: 1, at: dayAt(9) },
    { action: 'thrown', quantity: 3, at: dayAt(10) },
    { action: 'thrown', quantity: 1, at: dayAt(12) },
  ], NOW);
  assert.equal(stats.lastBought, dayAt(9));
  assert.equal(stats.lastUsed, dayAt(3));
  assert.equal(stats.boughtCount, 2);
  assert.equal(stats.thrownCount, 2);
  assert.equal(stats.thrownUnits, 4);
});

test('historyStats averages the days between buys', () => {
  const stats = historyStats([
    { action: 'bought', quantity: 1, at: dayAt(0) },
    { action: 'bought', quantity: 1, at: dayAt(9) },
    { action: 'bought', quantity: 1, at: dayAt(18) },
  ], NOW);
  assert.equal(stats.avgDaysBetweenBuys, 9);
});

test('historyStats gives no average with fewer than two buys', () => {
  assert.equal(historyStats([{ action: 'bought', quantity: 1, at: dayAt(0) }], NOW).avgDaysBetweenBuys, null);
  assert.equal(historyStats([{ action: 'used', quantity: 1, at: dayAt(0) }], NOW).avgDaysBetweenBuys, null);
});

test('historyStats ignores events after now and unreadable times', () => {
  const stats = historyStats([
    { action: 'bought', quantity: 1, at: dayAt(0) },
    { action: 'bought', quantity: 1, at: dayAt(30) },
    { action: 'bought', quantity: 1, at: 'not a time' },
    { action: 'thrown', quantity: 2, at: dayAt(1) },
  ], NOW);
  assert.equal(stats.boughtCount, 1);
  assert.equal(stats.lastBought, dayAt(0));
  assert.equal(stats.avgDaysBetweenBuys, null);
  assert.equal(stats.thrownUnits, 2);
});

test('eventsFor matches the name case-insensitively and sorts newest first', () => {
  const items = [
    { uid: '1', summary: 'Milk', description: formatEvent({ action: 'bought', quantity: 1, at: dayAt(1) }) },
    { uid: '2', summary: ' milk ', description: formatEvent({ action: 'used', quantity: 1, at: dayAt(5) }) },
    { uid: '3', summary: 'Eggs', description: formatEvent({ action: 'bought', quantity: 1, at: dayAt(9) }) },
    { uid: '4', summary: 'Milk', description: 'Action: sold\nAt: ' + dayAt(7) },
  ];
  assert.deepEqual(eventsFor('MILK', items), [
    { action: 'used', quantity: 1, at: dayAt(5) },
    { action: 'bought', quantity: 1, at: dayAt(1) },
  ]);
  assert.deepEqual(eventsFor('Bread', items), []);
  assert.deepEqual(eventsFor('', items), []);
  assert.deepEqual(eventsFor('Milk', undefined), []);
});

test('stockOf reads Want and Have lines as integers', () => {
  assert.deepEqual(stockOf('Dairy\nWant: 4\nHave: 1'), { want: 4, have: 1 });
  assert.deepEqual(stockOf('Dairy\nhave:   0 \nWANT: 2'), { want: 2, have: 0 });
});

test('stockOf gives null for an absent, empty or unreadable value', () => {
  assert.deepEqual(stockOf('Dairy'), { want: null, have: null });
  assert.deepEqual(stockOf('Dairy\nWant: 3'), { want: 3, have: null });
  assert.deepEqual(stockOf('Dairy\nHave: 2'), { want: null, have: 2 });
  assert.deepEqual(stockOf('Dairy\nWant:'), { want: null, have: null });
  assert.deepEqual(stockOf('Dairy\nWant: -1\nHave: 2.5'), { want: null, have: null });
  assert.deepEqual(stockOf('Dairy\nWant: lots'), { want: null, have: null });
  assert.deepEqual(stockOf(''), { want: null, have: null });
  assert.deepEqual(stockOf(undefined), { want: null, have: null });
});

test('Want and Have lines are not read as default details or category', () => {
  assert.equal(defaultDetailsOf('Dairy\nWant: 4'), '');
  assert.equal(defaultDetailsOf('Dairy\nHave: 1\nLow fat'), 'Low fat');
  assert.equal(defaultDetailsOf('Dairy\nWant: 4\nHave: 1\nLow fat'), 'Low fat');
  assert.equal(categoryOf({ description: 'Dairy\nWant: 4' }), 'Dairy');
});

test('withStock writes Want and Have after Prefer and before Link and Image', () => {
  const base = 'Dairy\nLow fat\nPrefer: Tnuva\nLink victory: https://a\nImage: https://x/a.jpg';
  assert.equal(
    withStock(base, { want: 4, have: 1 }),
    'Dairy\nLow fat\nPrefer: Tnuva\nWant: 4\nHave: 1\nLink victory: https://a\nImage: https://x/a.jpg',
  );
  assert.equal(withStock('Dairy', { want: 0, have: 0 }), 'Dairy\nWant: 0\nHave: 0');
});

test('withStock replaces existing lines and keeps the other lines', () => {
  assert.equal(
    withStock('Dairy\nWant: 9\nLow fat\nHave: 7\nImage: none', { want: 2, have: 3 }),
    'Dairy\nLow fat\nWant: 2\nHave: 3\nImage: none',
  );
});

test('withStock removes a line for a null or undefined value', () => {
  assert.equal(withStock('Dairy\nWant: 4\nHave: 1', { want: null, have: 1 }), 'Dairy\nHave: 1');
  assert.equal(withStock('Dairy\nWant: 4\nHave: 1', { want: 4 }), 'Dairy\nWant: 4');
  assert.equal(withStock('Dairy\nWant: 4\nHave: 1', {}), 'Dairy');
  assert.equal(withStock('Dairy\nWant: 4\nHave: 1'), 'Dairy');
});

test('withStock drops an invalid value as if it were absent', () => {
  assert.equal(withStock('Dairy', { want: -2, have: 2.5 }), 'Dairy');
});

test('withStock with an empty category keeps line 1 empty', () => {
  const text = withStock('', { want: 1, have: 0 });
  assert.equal(text, '\nWant: 1\nHave: 0');
  assert.equal(categoryOf({ description: text }), 'Other');
});

test('other catalog helpers keep the Want and Have lines', () => {
  const base = 'Dairy\nLow fat\nPrefer: Tnuva > Tara\nWant: 4\nHave: 1\nLink victory: https://a\nImage: https://x/a.jpg';
  assert.deepEqual(stockOf(withDefaultDetails(base, 'Full fat')), { want: 4, have: 1 });
  assert.deepEqual(stockOf(withPrefer(base, ['Tara'])), { want: 4, have: 1 });
  assert.deepEqual(stockOf(withImage(base, 'none')), { want: 4, have: 1 });
  assert.deepEqual(stockOf(withLinks(base, {})), { want: 4, have: 1 });
  assert.deepEqual(stockOf(withStock(base, { want: 4, have: 1 })), { want: 4, have: 1 });
  assert.equal(
    withPrefer(base, ['Tnuva']),
    'Dairy\nLow fat\nPrefer: Tnuva\nWant: 4\nHave: 1\nLink victory: https://a\nImage: https://x/a.jpg',
  );
  assert.deepEqual(preferOf(withStock(base, { want: 4, have: 1 })), ['Tnuva', 'Tara']);
  assert.deepEqual(linksOf(base), { victory: 'https://a' });
});

test('missingOf is want minus have minus units on order, never below 0', () => {
  assert.equal(missingOf({ want: 4, have: 1 }, 0), 3);
  assert.equal(missingOf({ want: 4, have: 1 }, 2), 1);
  assert.equal(missingOf({ want: 4, have: 1 }, 5), 0);
  assert.equal(missingOf({ want: 4, have: 1 }), 3);
  assert.equal(missingOf({ want: 4, have: 4 }, 0), 0);
  assert.equal(missingOf({ want: 4, have: 9 }, 0), 0);
});

test('missingOf gives 0 without a wanted amount and counts a null have as 0', () => {
  assert.equal(missingOf({ want: null, have: 0 }, 0), 0);
  assert.equal(missingOf({ want: null, have: null }, 3), 0);
  assert.equal(missingOf({ want: 3, have: null }, 0), 3);
  assert.equal(missingOf(undefined, 0), 0);
});

test('haveAfter adds on bought, takes one on used and quantity on thrown, never below 0', () => {
  assert.equal(haveAfter(1, 'bought', 2), 3);
  assert.equal(haveAfter(null, 'bought', 1), 1);
  assert.equal(haveAfter(3, 'used', 1), 2);
  assert.equal(haveAfter(0, 'used', 1), 0);
  assert.equal(haveAfter(3, 'thrown', 2), 1);
  assert.equal(haveAfter(1, 'thrown', 5), 0);
  assert.equal(haveAfter(null, 'thrown', 1), 0);
  assert.equal(haveAfter(4, 'sold', 1), 4);
});

test('linksOf reads a brand-qualified Link line as store (brand) and keeps its case', () => {
  assert.deepEqual(
    linksOf('Floor\nLink victory (ריצפז): https://a\nLink victory (Nikol): https://b\nLink victory: https://c'),
    { 'victory (ריצפז)': 'https://a', 'victory (Nikol)': 'https://b', victory: 'https://c' },
  );
  assert.deepEqual(Object.keys(linksOf('Floor\nLink victory (ניקול): https://a\nLink victory: https://b')), ['victory (ניקול)', 'victory']);
});

test('linksOf keeps the first link per store and brand and drops empty brand links', () => {
  assert.deepEqual(
    linksOf('Floor\nLink victory (ניקול): https://a\nlink VICTORY (ניקול): https://b'),
    { 'victory (ניקול)': 'https://a' },
  );
  assert.deepEqual(linksOf('Floor\nLink victory (  ): https://a'), { victory: 'https://a' });
  assert.deepEqual(linksOf('Floor\nLink victory (ניקול):'), {});
  assert.deepEqual(linksOf('Floor\nLink victory (a(b)): https://a'), {});
});

test('brandLinksOf lists store, brand and url in line order', () => {
  assert.deepEqual(
    brandLinksOf('Floor\nLink victory (ניקול): https://b\nLink shufersal: https://c'),
    [
      { store: 'victory', brand: 'ניקול', url: 'https://b' },
      { store: 'shufersal', brand: null, url: 'https://c' },
    ],
  );
});

test('linkKey and splitLinkKey are inverses for plain and brand keys', () => {
  assert.equal(linkKey('Victory', ''), 'victory');
  assert.equal(linkKey('victory', '  ניקול  '), 'victory (ניקול)');
  assert.deepEqual(splitLinkKey('victory'), { store: 'victory', brand: null });
  assert.deepEqual(splitLinkKey('victory (ניקול)'), { store: 'victory', brand: 'ניקול' });
});

test('withLinks writes brand-qualified Link lines in key order and replaces only Link lines', () => {
  assert.equal(
    withLinks('Floor\nLink victory: https://old\nPrefer: ריצפז > ניקול\nImage: https://x/a.jpg', {
      'victory (ריצפז)': 'https://a',
      'victory (ניקול)': 'https://b',
      shufersal: 'https://c',
    }),
    'Floor\nPrefer: ריצפז > ניקול\nLink victory (ריצפז): https://a\nLink victory (ניקול): https://b\nLink shufersal: https://c\nImage: https://x/a.jpg',
  );
});

test('brand-qualified links round-trip through parseEntry and formatEntry', () => {
  const links = { 'victory (ריצפז)': 'https://a', 'victory (ניקול)': 'https://b', shufersal: 'https://c' };
  const text = formatEntry({ quantity: 10, details: 'לימון', prefer: ['ריצפז', 'ניקול'], links });
  assert.equal(
    text,
    'Quantity: 10\nDetails: לימון\nPrefer: ריצפז > ניקול\nLink victory (ריצפז): https://a\nLink victory (ניקול): https://b\nLink shufersal: https://c',
  );
  assert.deepEqual(parseEntry(text), { quantity: 10, details: 'לימון', prefer: ['ריצפז', 'ניקול'], links, products: {} });
});

test('brand-qualified Link lines are not read as details or brands', () => {
  assert.equal(defaultDetailsOf('Floor\nLink victory (ניקול): https://a\nLemon'), 'Lemon');
  assert.deepEqual(preferOf('Floor\nLink victory (ניקול): https://a\nPrefer: ניקול'), ['ניקול']);
  assert.equal(categoryOf({ description: 'Floor\nLink victory (ניקול): https://a' }), 'Floor');
});

const DEALS_FILE = {
  updated: '2026-11-20T04:15:00Z',
  deals: {
    'Pepsi Cola': [
      { store: 'victory', brand: null, price: 7, deal: '2 ב-12.9 ₪', dealQuantity: 2, dealPrice: 12.9, until: '2026-11-28', url: 'https://www.victoryonline.co.il/p/1' },
      { store: 'ramilevy', brand: null, price: 8.9, deal: '3 ב-10 ₪', dealQuantity: 3, dealPrice: 10, until: '2026-11-20', url: 'https://www.rami-levy.co.il/x' },
    ],
  },
};

test('dealsFor reads the deals object and matches the name case-insensitively', () => {
  assert.equal(dealsFor('pepsi  cola', DEALS_FILE).length, 2);
  assert.deepEqual(dealsFor('Milk', DEALS_FILE), []);
  assert.deepEqual(dealsFor('', DEALS_FILE), []);
  assert.deepEqual(dealsFor('Pepsi Cola', null), []);
});

test('dealsFor also accepts a plain name map', () => {
  assert.equal(dealsFor('Pepsi Cola', DEALS_FILE.deals).length, 2);
});

test('bestDeal picks the lowest unit price of a quantity deal', () => {
  // victory: 12.9 / 2 = 6.45 per unit. ramilevy: 10 / 3 = 3.33 per unit.
  assert.equal(bestDeal(DEALS_FILE.deals['Pepsi Cola']).store, 'ramilevy');
});

test('bestDeal uses the regular price for a deal without a quantity', () => {
  const list = [
    { store: 'a', price: 5, deal: '20% הנחה', dealQuantity: null, dealPrice: null },
    { store: 'b', price: 6, deal: '2 ב-8 ₪', dealQuantity: 2, dealPrice: 8 },
  ];
  assert.equal(bestDeal(list).store, 'b');
});

test('bestDeal skips deals without any price and returns null for an empty list', () => {
  assert.equal(bestDeal([{ store: 'x', price: null, deal: 'y' }, { store: 'z', price: 3, deal: 'w' }]).store, 'z');
  assert.equal(bestDeal([]), null);
  assert.equal(bestDeal(undefined), null);
});

test('formatDeal returns the deal text, or builds it from the numbers', () => {
  assert.equal(formatDeal({ deal: ' 2 ב-12.9 ₪ ' }), '2 ב-12.9 ₪');
  assert.equal(formatDeal({ deal: '', dealQuantity: 2, dealPrice: 20 }), '2 ב-20 ₪');
  assert.equal(formatDeal({ deal: '' }), '');
  assert.equal(formatDeal(null), '');
});

test('dealBuyHints lists deals that need more units than the quantity', () => {
  const list = DEALS_FILE.deals['Pepsi Cola'];
  assert.deepEqual(dealBuyHints(list, 1).map((d) => d.store), ['victory', 'ramilevy']);
  assert.deepEqual(dealBuyHints(list, 2).map((d) => d.store), ['ramilevy']);
  assert.deepEqual(dealBuyHints(list, 3), []);
  assert.deepEqual(dealBuyHints(undefined, 1), []);
});

test('dealsUrlOf gives the default for undefined, null for false, and checks the value', () => {
  assert.equal(dealsUrlOf(undefined), '/local/restock-deals.json');
  assert.equal(dealsUrlOf(false), null);
  assert.equal(dealsUrlOf('/local/other.json'), '/local/other.json');
  assert.equal(dealsUrlOf('https://example.com/d.json'), 'https://example.com/d.json');
  assert.throws(() => dealsUrlOf('relative.json'), /deals_url/);
  assert.throws(() => dealsUrlOf(true), /deals_url/);
});

test('everyOrderOf reads the Every order line and gives 0 when absent or invalid', () => {
  assert.equal(everyOrderOf('Dairy\nWant: 2\nEvery order: 3'), 3);
  assert.equal(everyOrderOf('Dairy\nevery  ORDER:  1 '), 1);
  assert.equal(everyOrderOf('Dairy'), 0);
  assert.equal(everyOrderOf('Dairy\nEvery order: lots'), 0);
  assert.equal(everyOrderOf(undefined), 0);
});

test('the Every order line is not read as default details', () => {
  assert.equal(defaultDetailsOf('Dairy\nEvery order: 2'), '');
  assert.equal(defaultDetailsOf('Dairy\nEvery order: 2\nLow fat'), 'Low fat');
});

test('withEveryOrder sets the line after Have and removes it for 0 or null', () => {
  assert.equal(
    withEveryOrder('Dairy\nWant: 4\nHave: 1\nLink victory: https://a', 2),
    'Dairy\nWant: 4\nHave: 1\nEvery order: 2\nLink victory: https://a',
  );
  assert.equal(withEveryOrder('Dairy\nEvery order: 2', 0), 'Dairy');
  assert.equal(withEveryOrder('Dairy\nEvery order: 2', null), 'Dairy');
});

test('the other catalog helpers keep the Every order line', () => {
  const base = withEveryOrder('Dairy\nLow fat\nPrefer: Tnuva\nWant: 4\nImage: https://x/a.jpg', 2);
  assert.equal(everyOrderOf(withStock(base, { want: 4, have: 1 })), 2);
  assert.equal(everyOrderOf(withDefaultDetails(base, 'Full fat')), 2);
  assert.equal(everyOrderOf(withPrefer(base, ['Tara'])), 2);
  assert.equal(everyOrderOf(withImage(base, 'none')), 2);
  assert.deepEqual(stockOf(withEveryOrder(base, 0)), { want: 4, have: null });
});

test('storeProductsOf merges Link and Product lines into one row per store', () => {
  const text = [
    'Floor',
    'Link victory: https://v',
    'Product victory: Nikol 10L',
    'Link shufersal: https://s',
    'Product shufersal: none',
    'Product ramilevy: Nikol',
  ].join('\n');
  assert.deepEqual(storeProductsOf(text), [
    { store: 'victory', brand: null, url: 'https://v', product: 'Nikol 10L', none: false },
    { store: 'shufersal', brand: null, url: 'https://s', product: null, none: true },
    { store: 'ramilevy', brand: null, url: null, product: 'Nikol', none: false },
  ]);
});

test('storeProductsOf adds brand links as their own rows', () => {
  assert.deepEqual(storeProductsOf('Floor\nLink victory (Nikol): https://b\nLink victory: https://a'), [
    { store: 'victory', brand: null, url: 'https://a', product: null, none: false },
    { store: 'victory', brand: 'Nikol', url: 'https://b', product: null, none: false },
  ]);
});

test('withStoreProduct sets the store link and product and keeps other lines', () => {
  const text = 'Floor\nLow fat\nPrefer: Nikol\nLink victory (Nikol): https://b\nImage: https://x/a.jpg';
  const out = withStoreProduct(text, 'Victory', { url: 'https://v', product: 'נייקול 10 ליטר' });
  assert.equal(
    out,
    'Floor\nLow fat\nPrefer: Nikol\nLink victory (Nikol): https://b\nLink victory: https://v\nProduct victory: נייקול 10 ליטר\nImage: https://x/a.jpg',
  );
  assert.deepEqual(storeProductsOf(out).filter((row) => row.store === 'victory'), [
    { store: 'victory', brand: null, url: 'https://v', product: 'נייקול 10 ליטר', none: false },
    { store: 'victory', brand: 'Nikol', url: 'https://b', product: null, none: false },
  ]);
});

test('withStoreProduct marks none, and removes the store when url and product are empty', () => {
  const text = 'Floor\nLink shufersal: https://s\nProduct shufersal: Old';
  assert.equal(
    withStoreProduct(text, 'shufersal', { url: null, product: null, none: true }),
    'Floor\nProduct shufersal: none',
  );
  assert.equal(withStoreProduct(text, 'shufersal', {}), 'Floor');
});

test('withStoreProduct keeps brand links and rejects a store that is not one word', () => {
  const text = 'Floor\nLink victory (Nikol): https://b';
  assert.deepEqual(linksOf(withStoreProduct(text, 'victory', {})), { 'victory (Nikol)': 'https://b' });
  assert.throws(() => withStoreProduct(text, 'Rami Levy', {}), /store/);
});

test('Product lines are not read as default details or brands', () => {
  const text = 'Floor\nProduct victory: Nikol\nLow fat';
  assert.equal(defaultDetailsOf(text), 'Low fat');
  assert.deepEqual(preferOf(text), []);
  assert.equal(categoryOf({ description: text }), 'Floor');
});

test('formatEntry writes Product lines after Link lines and parseEntry reads them back', () => {
  const products = { victory: 'Nikol 10L', shufersal: 'none' };
  const links = { victory: 'https://v' };
  const text = formatEntry({ quantity: 2, details: 'Nikol', prefer: ['Nikol'], links, products });
  assert.equal(
    text,
    'Quantity: 2\nDetails: Nikol\nPrefer: Nikol\nLink victory: https://v\nProduct victory: Nikol 10L\nProduct shufersal: none',
  );
  assert.deepEqual(parseEntry(text), { quantity: 2, details: 'Nikol', prefer: ['Nikol'], links, products });
});

test('startOrderOf uses the default script only for the to-order list, and false hides it', () => {
  assert.deepEqual(startOrderOf(undefined, 'todo.to_order'), {
    id: 'script.restock_start_order', domain: 'script', service: 'restock_start_order',
  });
  assert.equal(startOrderOf(undefined, 'todo.filaments_to_order'), null);
  assert.deepEqual(startOrderOf('script.my_order', 'todo.filaments_to_order'), {
    id: 'script.my_order', domain: 'script', service: 'my_order',
  });
  assert.equal(startOrderOf(false, 'todo.to_order'), null);
  assert.throws(() => startOrderOf('light.kitchen', 'todo.to_order'), /start_order_script/);
  assert.throws(() => startOrderOf('bad id', 'todo.to_order'), /start_order_script/);
});

test('itemLabelOf defaults to item, and articleFor picks a or an', () => {
  assert.equal(itemLabelOf(undefined), 'item');
  assert.equal(itemLabelOf(' filament '), 'filament');
  assert.throws(() => itemLabelOf('   '), /item_label/);
  assert.throws(() => itemLabelOf(3), /item_label/);
  assert.equal(articleFor('item'), 'an');
  assert.equal(articleFor('filament'), 'a');
});
