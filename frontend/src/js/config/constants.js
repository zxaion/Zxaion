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

const CREDIT_PACKS = {
    '5$':   { credits: 200,  bonus: 0,    label: 'BASIC',        price: 5,   color: 'from-gray-400 to-gray-500' },
    '25$':  { credits: 1300, bonus: 450,  label: 'STANDARD',     price: 25,  color: 'from-blue-400 to-blue-500' },
    '45$':  { credits: 2700, bonus: 900,  label: 'PREMIUM',      price: 45,  color: 'from-violet-400 to-violet-500' },
    '75$':  { credits: 4500, bonus: 1400, label: 'ULTIMATE',     price: 75,  color: 'from-purple-400 to-purple-500' },
    '99$':  { credits: 7000, bonus: 2300, label: 'MEGA',         price: 99,  color: 'from-pink-400 to-rose-500' },
    '125$': { credits: 'lifetime', bonus: 0, label: 'LIFETIME PRO', price: 125, color: 'from-amber-400 to-orange-500' }
};