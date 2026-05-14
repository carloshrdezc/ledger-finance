export const ACCOUNTS = [
  { id: 'chk',  name: 'CHASE CHECKING',   type: 'CHK', code: '··4218', bal:  8420.18,   ccy: 'USD', delta:  +120.40 },
  { id: 'sav',  name: 'ALLY SAVINGS',     type: 'SAV', code: '··9931', bal: 24618.00,   ccy: 'USD', delta:  +812.00 },
  { id: 'amex', name: 'AMEX PLATINUM',    type: 'CC',  code: '··1009', bal: -1245.55,   ccy: 'USD', delta:  -312.40 },
  { id: 'csp',  name: 'CHASE SAPPHIRE',   type: 'CC',  code: '··7720', bal:  -612.80,   ccy: 'USD', delta:  -88.10  },
  { id: 'vti',  name: 'VANGUARD VTI',     type: 'INV', code: 'BROK',   bal: 187201.00,  ccy: 'USD', delta: +2418.20 },
  { id: '401k', name: 'FIDELITY 401(K)',  type: 'INV', code: 'IRA',    bal:  92140.00,  ccy: 'USD', delta:  +610.10 },
  { id: 'btc',  name: 'COINBASE BTC',     type: 'CRY', code: '0.612',  bal:  42180.00,  ccy: 'USD', delta:  +824.60 },
  { id: 'eur',  name: 'WISE EUR',         type: 'FX',  code: 'EUR',    bal:   1280.45,  ccy: 'EUR', delta:   +18.00 },
];

export const CATEGORIES = {
  food:    { label: 'GROCERIES',  glyph: '◇' },
  dining:  { label: 'DINING',     glyph: '◆' },
  rent:    { label: 'RENT',       glyph: '▣' },
  trans:   { label: 'TRANSPORT',  glyph: '▷' },
  bills:   { label: 'UTILITIES',  glyph: '▢' },
  shop:    { label: 'SHOPPING',   glyph: '○' },
  travel:  { label: 'TRAVEL',     glyph: '▲' },
  health:  { label: 'HEALTH',     glyph: '+' },
  income:  { label: 'INCOME',     glyph: '↑' },
  subs:    { label: 'SUBSCRIPT.', glyph: '∞' },
  edu:     { label: 'EDUCATION',  glyph: '✎' },
};

export const CATEGORY_TREE = {
  income:  { label: 'INCOME',     glyph: '↑', children: {
    payroll:  { label: 'PAYROLL' },
    interest: { label: 'INTEREST' },
    refund:   { label: 'REFUNDS' },
  }},
  rent:    { label: 'RENT',       glyph: '▣' },
  food:    { label: 'GROCERIES',  glyph: '◇', children: {
    produce:  { label: 'PRODUCE' },
    meat:     { label: 'MEAT & FISH' },
    pantry:   { label: 'PANTRY' },
    snacks:   { label: 'SNACKS' },
    bev:      { label: 'BEVERAGES' },
  }},
  dining:  { label: 'DINING',     glyph: '◆', children: {
    cafe:     { label: 'CAFÉ' },
    lunch:    { label: 'LUNCH' },
    dinner:   { label: 'DINNER' },
    bar:      { label: 'BAR' },
  }},
  trans:   { label: 'TRANSPORT',  glyph: '▷', children: {
    transit:   { label: 'TRANSIT' },
    rideshare: { label: 'RIDESHARE' },
    fuel:      { label: 'FUEL' },
    parking:   { label: 'PARKING' },
  }},
  bills:   { label: 'UTILITIES',  glyph: '▢', children: {
    elec:     { label: 'ELECTRIC' },
    internet: { label: 'INTERNET' },
    water:    { label: 'WATER' },
    phone:    { label: 'PHONE' },
  }},
  shop:    { label: 'SHOPPING',   glyph: '○', children: {
    clothes:  { label: 'CLOTHING' },
    home:     { label: 'HOME GOODS' },
    tech:     { label: 'ELECTRONICS' },
    gifts:    { label: 'GIFTS' },
  }},
  travel:  { label: 'TRAVEL',     glyph: '▲', children: {
    flights:  { label: 'FLIGHTS' },
    lodging:  { label: 'LODGING' },
    rental:   { label: 'CAR RENTAL' },
  }},
  health:  { label: 'HEALTH',     glyph: '+', children: {
    fitness:  { label: 'FITNESS' },
    medical:  { label: 'MEDICAL' },
    pharmacy: { label: 'PHARMACY' },
  }},
  subs:    { label: 'SUBSCRIPT.', glyph: '∞', children: {
    media:    { label: 'MEDIA' },
    software: { label: 'SOFTWARE' },
    news:     { label: 'NEWS' },
  }},
  edu:     { label: 'EDUCATION',  glyph: '✎', children: {
    school:   { label: 'SCHOOL', children: {
      supplies: { label: 'SUPPLIES', children: {
        pencils:  { label: 'PENCILS' },
        paper:    { label: 'PAPER' },
        books:    { label: 'TEXTBOOKS' },
      }},
      tuition:  { label: 'TUITION' },
      fees:     { label: 'FEES' },
    }},
    courses:  { label: 'COURSES' },
    books:    { label: 'BOOKS' },
  }},
};

export function catBreadcrumb(path) {
  const parts = [];
  let node = CATEGORY_TREE;
  for (const seg of path) {
    node = (node && node.children ? node.children : node)[seg];
    if (!node) break;
    parts.push(node.label);
  }
  return parts.join(' › ');
}
export function catGlyph(path) {
  const top = CATEGORY_TREE[path[0]];
  return top ? top.glyph : '·';
}

export const TRANSACTIONS = [
  { id: 't01', d:  0, name: 'WHOLE FOODS MKT',     acct: 'amex', cat: 'food',   path:['food','produce'],   amt:  -87.42, ccy: 'USD' },
  { id: 't02', d:  0, name: 'BLUE BOTTLE COFFEE',  acct: 'csp',  cat: 'dining', path:['dining','cafe'],    amt:   -6.50, ccy: 'USD' },
  { id: 't03', d:  0, name: 'UBER · DOWNTOWN',     acct: 'csp',  cat: 'trans',  path:['trans','rideshare'],amt:  -18.20, ccy: 'USD' },
  { id: 't04', d:  1, name: 'NETFLIX',             acct: 'chk',  cat: 'subs',   path:['subs','media'],     amt:  -15.49, ccy: 'USD' },
  { id: 't05', d:  1, name: 'TARTINE BAKERY',      acct: 'csp',  cat: 'dining', path:['dining','cafe'],    amt:  -22.10, ccy: 'USD' },
  { id: 't06', d:  2, name: 'PG&E ELECTRIC',       acct: 'chk',  cat: 'bills',  path:['bills','elec'],     amt: -112.00, ccy: 'USD' },
  { id: 't07', d:  2, name: 'SPOTIFY FAMILY',      acct: 'amex', cat: 'subs',   path:['subs','media'],     amt:  -16.99, ccy: 'USD' },
  { id: 't08', d:  3, name: 'PAYROLL · STRIPE',    acct: 'chk',  cat: 'income', path:['income','payroll'], amt: 6840.00, ccy: 'USD' },
  { id: 't09', d:  3, name: 'TRADER JOES',         acct: 'amex', cat: 'food',   path:['food','pantry'],    amt:  -54.80, ccy: 'USD' },
  { id: 't10', d:  4, name: 'BART · EMBARCADERO',  acct: 'csp',  cat: 'trans',  path:['trans','transit'],  amt:   -4.40, ccy: 'USD' },
  { id: 't11', d:  4, name: 'AMAZON · 4 ITEMS',    acct: 'amex', cat: 'shop',   path:['shop','home'],      amt: -128.30, ccy: 'USD' },
  { id: 't12', d:  5, name: 'CHEZ PANISSE',        acct: 'csp',  cat: 'dining', path:['dining','dinner'],  amt: -184.20, ccy: 'USD' },
  { id: 't13', d:  6, name: 'COMCAST XFINITY',     acct: 'chk',  cat: 'bills',  path:['bills','internet'], amt:  -89.00, ccy: 'USD' },
  { id: 't14', d:  7, name: 'KAISER · COPAY',      acct: 'amex', cat: 'health', path:['health','medical'], amt:  -45.00, ccy: 'USD' },
  { id: 't15', d:  8, name: 'APPLE STORE',         acct: 'amex', cat: 'shop',   path:['shop','tech'],      amt: -249.00, ccy: 'USD' },
  { id: 't16', d:  9, name: 'TARTINE BAKERY',      acct: 'csp',  cat: 'dining', path:['dining','cafe'],    amt:  -18.40, ccy: 'USD' },
  { id: 't17', d: 10, name: 'TRANSFER → SAVINGS',  acct: 'chk',  cat: 'income', path:['income','payroll'], amt:-1000.00, ccy: 'USD' },
  { id: 't18', d: 11, name: 'RENT · GREENPOINT',   acct: 'chk',  cat: 'rent',   path:['rent'],             amt:-2400.00, ccy: 'USD' },
  { id: 't19', d: 12, name: 'LUFTHANSA · SFO→BER', acct: 'csp',  cat: 'travel', path:['travel','flights'], amt: -812.40, ccy: 'USD' },
  { id: 't20', d: 13, name: 'BERLIN · KAFFEE',     acct: 'eur',  cat: 'dining', path:['dining','cafe'],    amt:   -4.20, ccy: 'EUR' },
  { id: 't21', d: 13, name: 'BVG TICKET',          acct: 'eur',  cat: 'trans',  path:['trans','transit'],  amt:   -3.50, ccy: 'EUR' },
  { id: 't22', d: 14, name: 'BIO COMPANY',         acct: 'eur',  cat: 'food',   path:['food','produce'],   amt:  -28.10, ccy: 'EUR' },
  { id: 't23', d: 15, name: 'NYTIMES',             acct: 'amex', cat: 'subs',   path:['subs','news'],      amt:  -17.00, ccy: 'USD' },
  { id: 't24', d: 16, name: 'COSTCO',              acct: 'amex', cat: 'food',   path:['food','pantry'],    amt: -212.80, ccy: 'USD' },
  { id: 't25', d: 18, name: 'CHEVRON',             acct: 'amex', cat: 'trans',  path:['trans','fuel'],     amt:  -52.30, ccy: 'USD' },
  { id: 't26', d: 19, name: 'PAYROLL · STRIPE',    acct: 'chk',  cat: 'income', path:['income','payroll'], amt: 6840.00, ccy: 'USD' },
  { id: 't27', d: 21, name: 'CLAUDE PRO',          acct: 'amex', cat: 'subs',   path:['subs','software'],  amt:  -20.00, ccy: 'USD' },
  { id: 't28', d: 22, name: 'EQUINOX',             acct: 'amex', cat: 'health', path:['health','fitness'], amt: -245.00, ccy: 'USD' },
  { id: 't29', d: 24, name: 'MUJI',                acct: 'amex', cat: 'shop',   path:['shop','home'],      amt:  -68.20, ccy: 'USD' },
  { id: 't30', d: 26, name: 'WHOLE FOODS MKT',     acct: 'amex', cat: 'food',   path:['food','produce'],   amt:  -94.10, ccy: 'USD' },
  { id: 't31', d:  2, name: 'STAPLES · PENCILS',   acct: 'amex', cat: 'edu',    path:['edu','school','supplies','pencils'], amt:  -8.40, ccy: 'USD' },
  { id: 't32', d:  5, name: 'STAPLES · NOTEBOOKS', acct: 'amex', cat: 'edu',    path:['edu','school','supplies','paper'],   amt: -14.20, ccy: 'USD' },
  { id: 't33', d:  9, name: 'AMAZON · TEXTBOOK',   acct: 'amex', cat: 'edu',    path:['edu','school','supplies','books'],   amt: -82.50, ccy: 'USD' },
  { id: 't34', d: 17, name: 'UC EXTENSION',        acct: 'chk',  cat: 'edu',    path:['edu','courses'],                    amt: -420.00, ccy: 'USD' },
];

export const BUDGETS = [
  { cat: 'food',   limit: 800,  spent: 477.22 },
  { cat: 'dining', limit: 400,  spent: 235.40 },
  { cat: 'rent',   limit: 2400, spent: 2400   },
  { cat: 'trans',  limit: 200,  spent:  78.40 },
  { cat: 'bills',  limit: 300,  spent: 201.00 },
  { cat: 'shop',   limit: 400,  spent: 445.50 },
  { cat: 'travel', limit: 600,  spent: 812.40 },
  { cat: 'subs',   limit: 100,  spent:  69.48 },
];

export const GOALS = [
  { id: 'g1', name: 'EMERGENCY · 6MO',      target: 30000, current: 22400 },
  { id: 'g2', name: 'BERLIN APT · DEPOSIT', target: 12000, current:  4820 },
  { id: 'g3', name: 'AMEX PAYOFF',          target:  1245, current:   612 },
  { id: 'g4', name: 'CAMERA · LEICA Q3',    target:  6200, current:  1840 },
];

export const BILLS = [
  { name: 'RENT · GREENPOINT', amt: 2400.00, day:  1, acct: 'chk',  cat: 'rent'   },
  { name: 'COMCAST XFINITY',   amt:   89.00, day:  6, acct: 'chk',  cat: 'bills'  },
  { name: 'PG&E ELECTRIC',     amt:  112.00, day:  2, acct: 'chk',  cat: 'bills'  },
  { name: 'NETFLIX',           amt:   15.49, day:  1, acct: 'chk',  cat: 'subs'   },
  { name: 'SPOTIFY FAMILY',    amt:   16.99, day:  1, acct: 'amex', cat: 'subs'   },
  { name: 'NYTIMES',           amt:   17.00, day: 15, acct: 'amex', cat: 'subs'   },
  { name: 'EQUINOX',           amt:  245.00, day: 22, acct: 'amex', cat: 'health' },
  { name: 'CLAUDE PRO',        amt:   20.00, day: 21, acct: 'amex', cat: 'subs'   },
];

export const INVESTMENTS = [
  { ticker: 'VTI',  name: 'VANGUARD TOTAL MKT', shares:  412.20, price:  281.40, chg: +1.21 },
  { ticker: 'VXUS', name: 'INTL STOCK INDEX',   shares:  220.00, price:   68.40, chg: -0.42 },
  { ticker: 'BND',  name: 'TOTAL BOND',         shares:  140.00, price:   74.10, chg: +0.08 },
  { ticker: 'AAPL', name: 'APPLE INC',          shares:   48.00, price:  224.80, chg: +2.10 },
  { ticker: 'BTC',  name: 'BITCOIN',            shares:    0.612,price: 68920.00,chg: +3.40 },
];

export const MERCHANTS = [
  { name: 'WHOLE FOODS',   amt: -181.52, n: 2, cat: 'food'   },
  { name: 'TARTINE BAKERY',amt:  -40.50, n: 2, cat: 'dining' },
  { name: 'AMEX FEES',     amt:  -45.00, n: 1, cat: 'bills'  },
  { name: 'AMAZON',        amt: -196.50, n: 2, cat: 'shop'   },
  { name: 'COSTCO',        amt: -212.80, n: 1, cat: 'food'   },
  { name: 'APPLE',         amt: -249.00, n: 1, cat: 'shop'   },
  { name: 'EQUINOX',       amt: -245.00, n: 1, cat: 'health' },
  { name: 'STAPLES',       amt:  -22.60, n: 2, cat: 'edu'    },
  { name: 'CHEVRON',       amt:  -52.30, n: 1, cat: 'trans'  },
  { name: 'LUFTHANSA',     amt: -812.40, n: 1, cat: 'travel' },
];

export const MOM_SPEND = [4820, 5102, 4940, 5380, 5210, 5640, 4980, 5340, 5510, 5180, 6713, 5234];

export const SPARK_NW = [
  281179, 280912, 281340, 281510, 281690, 281402, 281820, 282110, 281990, 282240,
  282510, 282390, 282680, 282940, 283100, 282860, 283210, 283480, 283620, 283412,
  283710, 283920, 284010, 283820, 284120, 284340, 284200, 284410, 284520, 284591,
];
export const SPARK_SPEND = [
  124, 88, 0, 245, 60, 110, 0, 320, 78, 0, 180, 0, 412, 90, 60, 540, 0, 70, 100, 220,
  0, 88, 0, 612, 45, 30, 0, 480, 92, 110,
];

export const NET_WORTH   = ACCOUNTS.reduce((s, a) => s + (a.ccy === 'USD' ? a.bal : a.bal * 1.08), 0);
export const MONTH_SPEND = TRANSACTIONS.filter(t => t.cat !== 'income' && t.amt < 0).reduce((s, t) => s + Math.abs(t.ccy === 'USD' ? t.amt : t.amt * 1.08), 0);
export const CASH        = ACCOUNTS.filter(a => ['CHK','SAV','FX'].includes(a.type)).reduce((s, a) => s + (a.ccy === 'USD' ? a.bal : a.bal * 1.08), 0);
export const SAFE_DAY    = 162.50;

export const HERO_METRICS = [
  { key: 'nw',    label: 'NET WORTH',      value: NET_WORTH,   delta: +3412.40, deltaPct:  1.21, spark: SPARK_NW,                          ccy: 'USD' },
  { key: 'spend', label: 'MONTH SPENDING', value: MONTH_SPEND, delta: -1480.00, deltaPct:-22.40, spark: SPARK_SPEND, ccy: 'USD', invert: true },
  { key: 'cash',  label: 'CASH ON HAND',   value: CASH,        delta:  +812.00, deltaPct:  2.40, spark: SPARK_NW.map(v => v * 0.12),        ccy: 'USD' },
  { key: 'safe',  label: 'SAFE TO SPEND',  value: SAFE_DAY,    delta:   -32.10, deltaPct:-16.50, spark: SPARK_NW.map(v => v * 0.0006),      ccy: 'USD', unit: '/ DAY' },
];

// ── formatters ──────────────────────────────────────────────────────────────
const CCY_SYM = { USD: '$', EUR: '€', GBP: '£' };

export function fmtMoney(v, ccy = 'USD', decimals = true) {
  const sym = CCY_SYM[ccy] || '$';
  const abs = Math.abs(v);
  const txt = decimals
    ? abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : Math.round(abs).toLocaleString('en-US');
  return (v < 0 ? '−' : '') + sym + txt;
}
export function fmtSigned(v, ccy = 'USD', decimals = true) {
  const sym = CCY_SYM[ccy] || '$';
  const abs = Math.abs(v);
  const txt = decimals
    ? abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : Math.round(abs).toLocaleString('en-US');
  return (v >= 0 ? '+' : '−') + sym + txt;
}
export function fmtPct(v) { return (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2) + '%'; }

const TODAY = new Date('2026-05-11');
export function dayLabel(d) {
  const dt = new Date(TODAY);
  dt.setDate(dt.getDate() - d);
  return dt.toLocaleDateString('en-US', { month: 'short', day: '2-digit' }).toUpperCase();
}
