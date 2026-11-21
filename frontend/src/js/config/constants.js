/**
 * config/constants.js — Konfigurasi global: API_BASE, kategori, album anime, paket kredit.
 * Depends on: (tidak ada)
 */
// --- Configuration ---
const API_BASE = (() => {
    if (typeof window !== 'undefined' && typeof window.__ZX_API_BASE__ === 'string') {
        return window.__ZX_API_BASE__;
    }
    const host = typeof window !== 'undefined' ? window.location.hostname : '';
    if (!host || host === 'localhost' || host === '127.0.0.1' || host.endsWith('.run.app') || host.endsWith('.workers.dev')) {
        return '';
    }
    return 'https://ai.zxaionverse.workers.dev';
})();
const ITEMS_PER_PAGE = 30;
const CATEGORIES = ['All', 'Anime', 'Fantasy', 'Abstract', 'Photography', 'COMITBASE', 'DTREASURE', 'ZMEME', 'OVERLAY'];
const ANIME_SUB_ALBUMS = [
    'Attack on Titan', 'One Piece', 'My Hero Academia', 'Demon Slayer',
    'One-Punch Man', 'Death Note', 'Sousou no Frieren', 'Boruto',
    'Jujutsu Kaisen', 'Pokémon', 'Chainsaw Man', 'Fate Series',
    'Solo Leveling', 'Evangelion', 'Naruto', 'The Seven Deadly Sins',
    'Tokyo Ghoul', 'Sword Art Online', 'Dragon Ball Super', 'Haikyuu!!',
    'Fairy Tail', 'Hunter x Hunter', 'Black Clover', 'Dr. Stone',
    'HSR', 'GENSHIN', 'ZZZ', 'WUWA', 'PURAVEN', 'FINAL FANTASY',
    'RESIDENT EVIL', 'DEAD OR ALIVE', 'TOKYO REVENGER', 'FIRE FORCE',
    'ROMANCE ANIME', 'ISEKAI', 'ORIGINAL'
];

const _CREDIT_PACK_UI_META = {
    '5$':   { label: 'BASIC',        color: 'from-gray-400 to-gray-500' },
    '25$':  { label: 'STANDARD',     color: 'from-blue-400 to-blue-500' },
    '45$':  { label: 'PREMIUM',      color: 'from-violet-400 to-violet-500' },
    '75$':  { label: 'ULTIMATE',     color: 'from-purple-400 to-purple-500' },
    '99$':  { label: 'MEGA',         color: 'from-pink-400 to-rose-500' },
    '125$': { label: 'LIFETIME PRO', color: 'from-amber-400 to-orange-500' }
};

const _DEFAULT_PACK_DEFS = [
    { key: '5$',   price: 5,   credits: 200,  bonus: 0,    lifetime: false },
    { key: '25$',  price: 25,  credits: 1300, bonus: 450,  lifetime: false },
    { key: '45$',  price: 45,  credits: 2700, bonus: 900,  lifetime: false },
    { key: '75$',  price: 75,  credits: 4500, bonus: 1400, lifetime: false },
    { key: '99$',  price: 99,  credits: 7000, bonus: 2300, lifetime: false },
    { key: '125$', price: 125, credits: 0,    bonus: 0,    lifetime: true }
];

const _ACTIVE_PACK_DEFS = (typeof window !== 'undefined' && Array.isArray(window.__ZX_CREDIT_PACKS__))
    ? window.__ZX_CREDIT_PACKS__
    : _DEFAULT_PACK_DEFS;

const CREDIT_PACKS = Object.fromEntries(
    _ACTIVE_PACK_DEFS.map(def => {
        const meta = _CREDIT_PACK_UI_META[def.key] || { label: def.key, color: 'from-gray-400 to-gray-500' };
        return [
            def.key,
            {
                credits: def.lifetime ? 'lifetime' : def.credits,
                bonus:   def.bonus || 0,
                label:   meta.label,
                price:   def.price,
                color:   meta.color,
            }
        ];
    })
);
