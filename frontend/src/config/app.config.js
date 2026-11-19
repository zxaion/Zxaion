/**
 * Shared frontend configuration extracted without changing legacy values.
 * Window-facing image/logo/icon maps are applied during browser startup.
 */
export const API_BASE = 'https://ai.zxaionverse.workers.dev';
export const ITEMS_PER_PAGE = 30;
export const CATEGORIES = ['All', 'Anime', 'Fantasy', 'Abstract', 'Photography', 'COMITBASE', 'DTREASURE', 'ZMEME', 'OVERLAY'];
export const ANIME_SUB_ALBUMS = [
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

export const CREDIT_PACKS = {
    '5$':   { credits: 200,  bonus: 0,    label: 'BASIC',        price: 5,   color: 'from-gray-400 to-gray-500' },
    '25$':  { credits: 1300, bonus: 450,  label: 'STANDARD',     price: 25,  color: 'from-blue-400 to-blue-500' },
    '45$':  { credits: 2700, bonus: 900,  label: 'PREMIUM',      price: 45,  color: 'from-violet-400 to-violet-500' },
    '75$':  { credits: 4500, bonus: 1400, label: 'ULTIMATE',     price: 75,  color: 'from-purple-400 to-purple-500' },
    '99$':  { credits: 7000, bonus: 2300, label: 'MEGA',         price: 99,  color: 'from-pink-400 to-rose-500' },
    '125$': { credits: 'lifetime', bonus: 0, label: 'LIFETIME PRO', price: 125, color: 'from-amber-400 to-orange-500' }
};

export function applyLegacyWindowConfig(targetWindow) {
    const window = targetWindow;
    window.headerBackgrounds = {
        'All':         `${API_BASE}/api/img/HEADER/Home.jpg`,
        'Anime':       `${API_BASE}/api/img/HEADER/Anime.jpg`,
        'Fantasy':     `${API_BASE}/api/img/HEADER/Fantasy.jpg`,
        'Abstract':    `${API_BASE}/api/img/HEADER/Abstract.jpg`,
        'Photography': `${API_BASE}/api/img/PHOTOGRAPHY/PSX_207.jpg`,
        'COMITBASE':   `${API_BASE}/api/img/HEADER/Combaseheader.jpg`,
        'DTREASURE':   `${API_BASE}/api/img/HEADER/Dtreasure.jpg`,
        'ZMEME':       `${API_BASE}/api/img/HEADER/Memehead.jpg`,
        'OVERLAY':     `${API_BASE}/api/img/HEADER/Overlayhead.jpg`
    };
    
    window.categoryThumbnails = {
        'Anime':       `${API_BASE}/api/img/HEADER/Anime.jpg`,
        'Fantasy':     `${API_BASE}/api/img/HEADER/Fantasy.jpg`,
        'Abstract':    `${API_BASE}/api/img/HEADER/Abstract.jpg`,
        'Photography': `${API_BASE}/api/img/PHOTOGRAPHY/PSX_207.jpg`,
        'COMITBASE':   `${API_BASE}/api/img/HEADER/Combaseheader.jpg`,
        'DTREASURE':   `${API_BASE}/api/img/HEADER/Dtreasure1.jpg`,
        'ZMEME':       `${API_BASE}/api/img/HEADER/Zmeme.jpg`,
        'OVERLAY':     `${API_BASE}/api/img/HEADER/Overlay.jpg`
    };
    
    window.animeAlbumThumbnails = {
        'Attack on Titan':      `${API_BASE}/api/img/HEADER/AOT.jpg`,
        'One Piece':            `${API_BASE}/api/img/HEADER/One piece.jpg`,
        'My Hero Academia':     `${API_BASE}/api/img/HEADER/Hro academia.jpg`,
        'Demon Slayer':         `${API_BASE}/api/img/ANIME/Demon slayer/ai_generated_by_zxaionverse_djco3hq.jpg`,
        'One-Punch Man':        `${API_BASE}/api/img/HEADER/Onepuvhman.jpg`,
        'Death Note':           `${API_BASE}/api/img/HEADER/Deathnote.jpg`,
        'Sousou no Frieren':    `${API_BASE}/api/img/HEADER/Frieren.jpg`,
        'Boruto':               `${API_BASE}/api/img/HEADER/Boruto.jpg`,
        'Jujutsu Kaisen':       `${API_BASE}/api/img/HEADER/Jjk.jpg`,
        'Pokémon':              `${API_BASE}/api/img/HEADER/Pokemon.jpg`,
        'Chainsaw Man':         `${API_BASE}/api/img/HEADER/Chainsawman.jpg`,
        'Fate Series':          `${API_BASE}/api/img/ANIME/Fate series/PSX_193.jpg`,
        'Solo Leveling':        `${API_BASE}/api/img/HEADER/Sololeveling.jpg`,
        'Evangelion':           `${API_BASE}/api/img/HEADER/Evangelion.jpg`,
        'Naruto':               `${API_BASE}/api/img/HEADER/Naruti.jpg`,
        'The Seven Deadly Sins':`${API_BASE}/api/img/HEADER/Nanatsu.jpg`,
        'Tokyo Ghoul':          `${API_BASE}/api/img/HEADER/Ghoul.jpg`,
        'Sword Art Online':     `${API_BASE}/api/img/HEADER/SAO.jpg`,
        'Dragon Ball Super':    `${API_BASE}/api/img/HEADER/Goku.jpg`,
        'Haikyuu!!':            `${API_BASE}/api/img/HEADER/Haikyu.jpg`,
        'Fairy Tail':           `${API_BASE}/api/img/HEADER/Fairytail.jpg`,
        'Hunter x Hunter':      `${API_BASE}/api/img/HEADER/Hmterx hunter.jpg`,
        'Black Clover':         `${API_BASE}/api/img/HEADER/Vanesablack clover.jpg`,
        'Dr. Stone':            `${API_BASE}/api/img/HEADER/Dr stone.jpg`,
        'HSR':                  `${API_BASE}/api/img/HEADER/Hsr 1.jpg`,
        'GENSHIN':              `${API_BASE}/api/img/HEADER/1Genshin.jpg`,
        'ZZZ':                  `${API_BASE}/api/img/HEADER/Zzz 1.jpg`,
        'WUWA':                 `${API_BASE}/api/img/HEADER/Wuwa 1.jpg`,
        'PURAVEN':              `${API_BASE}/api/img/HEADER/Puraven.jpg`,
        'FINAL FANTASY':        `${API_BASE}/api/img/HEADER/FF.jpg`,
        'RESIDENT EVIL':        `${API_BASE}/api/img/HEADER/Residentevil.jpg`,
        'DEAD OR ALIVE':        `${API_BASE}/api/img/HEADER/Anime.jpg`,
        'TOKYO REVENGER':       `${API_BASE}/api/img/HEADER/TokyoR.jpg`,
        'FIRE FORCE':           `${API_BASE}/api/img/HEADER/Fireforce.jpg`,
        'ROMANCE ANIME':        `${API_BASE}/api/img/HEADER/Anime.jpg`,
        'ISEKAI':               `${API_BASE}/api/img/HEADER/Isekai.jpg`,
        'ORIGINAL':             `${API_BASE}/api/img/HEADER/Original.jpg`
    };
    
    // Custom logo dari R2
    window.customLogo = {
        enabled:     true,
        url:         `${API_BASE}/api/img/HEADER/Logo.png`,
        alt:         'ZXAION VERSE Logo',
        fallbackUrl: ''
    };
    
    // ============================================================
    // CUSTOM ICONS — Ganti semua FontAwesome icon dengan gambar R2
    // ============================================================
    window.customIcons = {
        enabled: true, // ← set true setelah upload icon ke R2
    
        definitions: [
            // ── Crypto donation icons ─────────────────────────────────
            { selector: '.crypto-btn[data-name="Bitcoin"] .w-12 i',   url: 'HEADER/icons/Btc.png'  },
            { selector: '.crypto-btn[data-name="Ethereum"] .w-12 i',  url: 'HEADER/icons/Ethicon.png' },
            { selector: '.crypto-btn[data-name="Solana"] .w-12 i',    url: 'HEADER/icons/Sol.png'   },
            { selector: '.crypto-btn[data-name="BNB"] .w-12 i',       url: 'HEADER/icons/Bnb icon.png'      },
            { selector: '.crypto-btn[data-name="Polygon"] .w-12 i',   url: 'HEADER/icons/Pol.webp'  },
            { selector: '.crypto-btn[data-name="XRP (BSC)"] .w-12 i', url: 'HEADER/icons/Xrpicon.png'      },
        ]
    };
}
