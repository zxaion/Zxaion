// Paket kredit & harga — satu sumber kebenaran untuk webhook PayPal, /api/credits/purchase, dan frontend build.

export const CREDIT_PACK_DEFINITIONS = [
  { key: '5$',   price: 5,   credits: 200,  bonus: 0,    lifetime: false },
  { key: '25$',  price: 25,  credits: 1300, bonus: 450,  lifetime: false },
  { key: '45$',  price: 45,  credits: 2700, bonus: 900,  lifetime: false },
  { key: '75$',  price: 75,  credits: 4500, bonus: 1400, lifetime: false },
  { key: '99$',  price: 99,  credits: 7000, bonus: 2300, lifetime: false },
  { key: '125$', price: 125, credits: 0,    bonus: 0,    lifetime: true  },
];

export const PACK_BY_PRICE = Object.fromEntries(
  CREDIT_PACK_DEFINITIONS.map(({ price, credits, bonus, lifetime }) => [price, { credits, bonus, lifetime }])
);

export const PACK_BY_CENTS = Object.fromEntries(
  CREDIT_PACK_DEFINITIONS.map(({ price, credits, bonus, lifetime }) => [Math.round(price * 100), { credits, bonus, lifetime }])
);

export const PACK_PRICES = Object.fromEntries(
  CREDIT_PACK_DEFINITIONS.map(({ key, price }) => [key, price])
);

export const PACKS = Object.fromEntries(
  CREDIT_PACK_DEFINITIONS.map(({ key, credits, bonus, lifetime }) => [key, { credits, bonus, lifetime }])
);
