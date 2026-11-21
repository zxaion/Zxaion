// Paket kredit & harga — satu sumber kebenaran untuk webhook PayPal dan /api/credits/purchase.

export const PACK_BY_PRICE = {
  5:   { credits: 200,  bonus: 0,    lifetime: false },
  25:  { credits: 1300, bonus: 450,  lifetime: false },
  45:  { credits: 2700, bonus: 900,  lifetime: false },
  75:  { credits: 4500, bonus: 1400, lifetime: false },
  99:  { credits: 7000, bonus: 2300, lifetime: false },
  125: { credits: 0,    bonus: 0,    lifetime: true  },
};

export const PACK_BY_CENTS = {
  500:   { credits: 200,  bonus: 0,    lifetime: false },
  2500:  { credits: 1300, bonus: 450,  lifetime: false },
  4500:  { credits: 2700, bonus: 900,  lifetime: false },
  7500:  { credits: 4500, bonus: 1400, lifetime: false },
  9900:  { credits: 7000, bonus: 2300, lifetime: false },
  12500: { credits: 0,    bonus: 0,    lifetime: true  },
};

export const PACK_PRICES = {
  '5$':   5,
  '25$':  25,
  '45$':  45,
  '75$':  75,
  '99$':  99,
  '125$': 125,
};

export const PACKS = {
  '5$':   { credits: 200,  bonus: 0,    lifetime: false },
  '25$':  { credits: 1300, bonus: 450,  lifetime: false },
  '45$':  { credits: 2700, bonus: 900,  lifetime: false },
  '75$':  { credits: 4500, bonus: 1400, lifetime: false },
  '99$':  { credits: 7000, bonus: 2300, lifetime: false },
  '125$': { credits: 0,    bonus: 0,    lifetime: true  },
};
