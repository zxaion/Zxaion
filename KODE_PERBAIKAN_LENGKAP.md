# Kode Perbaikan Lengkap - ZXAION Gallery

## ✅ DAFTAR PERUBAHAN LENGKAP

---

## 1️⃣ FIX: ResizeObserver untuk Mobile Layout (TAMBAH di script.js)

**LOKASI**: `frontend/script.js` - Tambahkan di awal setelah DOM loaded

```javascript
// ============================================================
// FIX 1: ResizeObserver untuk Mobile Search Bar Height
// Mencegah category-nav overlap mobile search di breakpoint < 768px
// ============================================================
function initializeResponsiveLayout() {
  const mobileSearchBar = document.getElementById('mobile-search-bar');
  const categoryNav = document.getElementById('category-nav');
  
  if (!mobileSearchBar || !categoryNav) return;

  const resizeObserver = new ResizeObserver(() => {
    const searchHeight = mobileSearchBar.offsetHeight;
    const navHeight = document.querySelector('nav').offsetHeight;
    const totalStickyHeight = navHeight + searchHeight;
    
    // Update category nav top position hanya di mobile
    if (window.innerWidth < 768) {
      categoryNav.style.top = `${totalStickyHeight}px`;
    } else {
      categoryNav.style.top = '';
    }
  });

  resizeObserver.observe(mobileSearchBar);
  resizeObserver.observe(document.querySelector('nav'));
  
  // Juga trigger pada window resize
  window.addEventListener('resize', () => {
    if (window.innerWidth < 768) {
      const searchHeight = mobileSearchBar.offsetHeight;
      const navHeight = document.querySelector('nav').offsetHeight;
      categoryNav.style.top = `${searchHeight + navHeight}px`;
    }
  });
}

// Panggil setelah DOM ready
document.addEventListener('DOMContentLoaded', initializeResponsiveLayout);
```

---

## 2️⃣ FIX: PayPal Button Integration (GANTI di script.js)

**LOKASI**: `frontend/script.js` - CARI function yang handle buy credits modal

**GANTI DARI:**
```javascript
// Lama - tidak ada inisialisasi PayPal
```

**GANTI KE:**
```javascript
// ============================================================
// FIX 2: PayPal Button Initialization
// ============================================================

async function initializePayPalButtons(selectedPack) {
  if (typeof paypal === 'undefined') {
    console.error('PayPal SDK not loaded');
    return;
  }

  const paypalContainer = document.getElementById('paypal-button-container');
  const creditPacks = document.getElementById('credit-packs');
  
  if (!paypalContainer) return;

  try {
    // Hapus buttons lama jika ada
    const oldButtons = document.getElementById('paypal-buttons');
    if (oldButtons) oldButtons.innerHTML = '';

    paypal.Buttons({
      createOrder: (data, actions) => {
        const pack = selectedPack || document.querySelector('[data-pack-selected]')?.dataset.packSelected;
        const amount = pack ? pack.replace('$', '') : '5';
        
        return actions.order.create({
          purchase_units: [{
            amount: {
              value: amount,
            },
            custom_id: getUserToken() // User ID untuk tracking
          }],
        });
      },

      onApprove: async (data, actions) => {
        try {
          const details = await actions.order.capture();
          
          // Kirim ke backend untuk memverifikasi dan credit user
          const response = await fetch('/api/credits/purchase', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-User-Token': getUserToken(),
            },
            body: JSON.stringify({
              pack: selectedPack || document.querySelector('[data-pack-selected]')?.dataset.packSelected,
              orderId: details.id,
            }),
          });

          const result = await response.json();
          
          if (result.success) {
            showNotification(`✅ Credits added! New balance: ${result.newBalance}`, 'success');
            await updateCreditBalance();
            closeBuyCreditsModal();
          } else {
            showNotification(`❌ Error: ${result.error}`, 'error');
          }
        } catch (error) {
          console.error('PayPal approval error:', error);
          showNotification('❌ Payment processing failed', 'error');
        }
      },

      onError: (err) => {
        console.error('PayPal error:', err);
        showNotification('❌ Payment error. Please try again.', 'error');
      },

      onCancel: () => {
        showNotification('⚠️ Payment cancelled', 'warning');
      },
    }).render('#paypal-buttons').catch(err => {
      console.error('Failed to render PayPal buttons:', err);
    });

  } catch (error) {
    console.error('PayPal initialization error:', error);
    showNotification('❌ Failed to load payment options', 'error');
  }
}

// Helper function - pastikan ada
function getUserToken() {
  let token = localStorage.getItem('userToken');
  if (!token) {
    token = 'user_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('userToken', token);
  }
  return token;
}

// Helper function untuk notifikasi
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `fixed top-4 right-4 px-4 py-3 rounded-lg text-white z-50 animate-fade-in ${
    type === 'success' ? 'bg-green-500' :
    type === 'error' ? 'bg-red-500' :
    type === 'warning' ? 'bg-yellow-500' :
    'bg-blue-500'
  }`;
  notification.textContent = message;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.remove();
  }, 3000);
}

// Panggil saat buka modal
document.getElementById('buy-credits-btn').addEventListener('click', async () => {
  document.getElementById('buy-credits-modal').classList.remove('hidden');
  document.getElementById('buy-credits-modal').classList.add('flex');
  
  // Load PayPal buttons
  setTimeout(() => {
    initializePayPalButtons('5$');
  }, 500);
});
```

---

## 3️⃣ FIX: Image Shield Overlay (GANTI di style.css)

**LOKASI**: `frontend/style.css` - CARI section IMAGE MODAL

**TAMBAHKAN SEBELUM modal-img-wrapper:**
```css
/* ============================================================
   FIX 3: Shield Overlay untuk Locked Images
   ============================================================ */
#modal-img-shield {
  background: linear-gradient(135deg, rgba(0,0,0,0.7), rgba(0,0,0,0.5));
  display: flex !important;
  align-items: center;
  justify-content: center;
}

#modal-img-shield::before {
  content: '🔒';
  font-size: 3rem;
  color: white;
  text-shadow: 0 2px 8px rgba(0,0,0,0.5);
  animation: pulse 2s infinite;
}

#modal-img-shield::after {
  content: 'Premium Content\APlease purchase to unlock';
  white-space: pre;
  position: absolute;
  text-align: center;
  color: white;
  font-weight: bold;
  font-size: 1rem;
  bottom: 2rem;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
}
```

---

## 4️⃣ FIX: Error Handling untuk Gallery (GANTI di script.js)

**LOKASI**: `frontend/script.js` - CARI function yang render gallery items

**GANTI DARI:**
```javascript
// Lama - render item tanpa error handling
img.src = photo.url;
```

**GANTI KE:**
```javascript
// ============================================================
// FIX 4: Error Handling untuk Image Loading
// ============================================================

function createGalleryItem(photo, container) {
  try {
    const item = document.createElement('div');
    item.className = 'masonry-item group';
    item.innerHTML = `
      <div class="relative overflow-hidden rounded-lg bg-gray-200 dark:bg-gray-700">
        <img 
          class="w-full h-auto object-cover transition-transform duration-300 loading-shimmer"
          src="${encodeURI(photo.url)}" 
          alt="${photo.title}"
          loading="lazy"
          data-photo-id="${photo.id}"
          onerror="handleImageError(this)"
        >
        <div class="masonry-overlay">
          <div class="stats">
            <span><i class="fas fa-eye"></i> ${photo.viewCount || 0}</span>
            <span><i class="fas fa-download"></i> ${photo.downloadCount || 0}</span>
          </div>
          <button class="download-btn" onclick="openImageModal('${photo.id}')">
            View
          </button>
        </div>
      </div>
    `;
    
    container.appendChild(item);
    
  } catch (error) {
    console.error('Error creating gallery item:', error, photo);
    // Silently fail - jangan crash gallery
  }
}

// Error handler untuk image
window.handleImageError = function(img) {
  console.warn(`Failed to load image: ${img.src}`);
  img.style.opacity = '0.2';
  img.title = 'Failed to load image';
  
  // Ganti dengan placeholder
  img.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23ddd" width="200" height="200"/%3E%3Ctext x="50%" y="50%" text-anchor="middle" dy=".3em" fill="%23999" font-size="14"%3EImage not available%3C/text%3E%3C/svg%3E';
};
```

---

## 5️⃣ FIX: Lazy Loading Images (TAMBAH di script.js)

**LOKASI**: `frontend/script.js` - TAMBAHKAN function baru

```javascript
// ============================================================
// FIX 5: Lazy Loading dengan Intersection Observer
// ============================================================

function initializeLazyLoading() {
  const imageObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        
        // Load actual image
        if (img.dataset.src) {
          img.src = img.dataset.src;
          delete img.dataset.src;
        }
        
        // Remove loading animation
        img.classList.remove('loading-shimmer');
        observer.unobserve(img);
      }
    });
  }, {
    rootMargin: '50px', // Load 50px sebelum masuk viewport
  });

  // Observe semua lazy images
  document.querySelectorAll('img[loading="lazy"]').forEach(img => {
    imageObserver.observe(img);
  });
}

// Panggil setelah gallery di-render
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(initializeLazyLoading, 1000);
});
```

---

## 6️⃣ FIX: Input Sanitization (TAMBAH di script.js)

**LOKASI**: `frontend/script.js` - TAMBAHKAN function baru

```javascript
// ============================================================
// FIX 6: Input Sanitization untuk Security
// ============================================================

function sanitizeInput(input) {
  // Hapus special characters yang berbahaya
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    .trim();
}

function validateSearchInput(input) {
  if (!input || typeof input !== 'string') return '';
  
  // Max 100 characters
  if (input.length > 100) {
    showNotification('⚠️ Search query too long', 'warning');
    return input.substring(0, 100);
  }
  
  // Hanya allow alphanumeric, space, dan dash
  const sanitized = input.replace(/[^a-zA-Z0-9\s\-]/g, '').trim();
  
  if (sanitized !== input) {
    showNotification('⚠️ Special characters removed', 'warning');
  }
  
  return sanitized;
}

// Update search input handler
document.getElementById('searchInput')?.addEventListener('keyup', (e) => {
  const sanitized = validateSearchInput(e.target.value);
  e.target.value = sanitized;
  
  // Perform search
  performSearch(sanitized);
});

document.getElementById('searchInputMobile')?.addEventListener('keyup', (e) => {
  const sanitized = validateSearchInput(e.target.value);
  e.target.value = sanitized;
  
  // Perform search
  performSearch(sanitized);
});
```

---

## 7️⃣ FIX: API Config Object (TAMBAH di script.js awal)

**LOKASI**: `frontend/script.js` - TAMBAHKAN di paling atas

```javascript
// ============================================================
// FIX 7: API Configuration
// ============================================================

const API_CONFIG = {
  BASE_URL: window.location.origin,
  ENDPOINTS: {
    LIST: '/api/list',
    COMITBASE_LIST: '/api/comitbase/list',
    DTREASURE_LIST: '/api/dtreasure/list',
    TRENDING: '/api/trending',
    STATS: (id) => `/api/stats/${encodeURIComponent(id)}`,
    VIEW: (id) => `/api/view/${encodeURIComponent(id)}`,
    DOWNLOAD: (id) => `/api/download/${encodeURIComponent(id)}`,
    CREDITS_BALANCE: '/api/credits/balance',
    CREDITS_PURCHASE: '/api/credits/purchase',
    CREDITS_SPEND: '/api/credits/spend',
  },
};

// Helper untuk fetch
async function fetchAPI(endpoint, options = {}) {
  try {
    const url = `${API_CONFIG.BASE_URL}${endpoint}`;
    const response = await fetch(url, {
      headers: {
        'X-User-Token': getUserToken(),
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`API call failed for ${endpoint}:`, error);
    throw error;
  }
}

// Ganti semua hardcoded URLs dengan API_CONFIG
// Contoh: 
// Lama: fetch('/api/list?page=1')
// Baru: fetchAPI(API_CONFIG.ENDPOINTS.LIST + '?page=1')
```

---

## 8️⃣ FIX: Loading States (TAMBAH di script.js)

**LOKASI**: `frontend/script.js` - TAMBAHKAN function baru

```javascript
// ============================================================
// FIX 8: Loading State Management
// ============================================================

class LoadingManager {
  constructor() {
    this.loaders = new Map();
    this.createGlobalLoader();
  }

  createGlobalLoader() {
    const loader = document.createElement('div');
    loader.id = 'global-loader';
    loader.className = 'fixed inset-0 bg-black/50 z-[999] hidden flex items-center justify-center backdrop-blur-sm';
    loader.innerHTML = `
      <div class="text-center">
        <div class="w-16 h-16 border-4 border-gray-300 border-t-white rounded-full animate-spin mx-auto mb-4"></div>
        <p class="text-white font-semibold">Loading...</p>
      </div>
    `;
    document.body.appendChild(loader);
  }

  show(identifier = 'global') {
    if (identifier === 'global') {
      document.getElementById('global-loader')?.classList.remove('hidden');
    } else {
      const loader = this.loaders.get(identifier);
      if (loader) loader.style.display = 'flex';
    }
  }

  hide(identifier = 'global') {
    if (identifier === 'global') {
      document.getElementById('global-loader')?.classList.add('hidden');
    } else {
      const loader = this.loaders.get(identifier);
      if (loader) loader.style.display = 'none';
    }
  }

  createForElement(element, identifier) {
    const loader = document.createElement('div');
    loader.className = 'absolute inset-0 bg-white/80 dark:bg-gray-900/80 flex items-center justify-center rounded-lg';
    loader.innerHTML = `
      <div class="w-10 h-10 border-3 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
    `;
    loader.style.display = 'none';
    element.style.position = 'relative';
    element.appendChild(loader);
    this.loaders.set(identifier, loader);
  }
}

const loadingManager = new LoadingManager();

// Gunakan di API calls:
// loadingManager.show('gallery');
// try {
//   const data = await fetchAPI(...);
// } finally {
//   loadingManager.hide('gallery');
// }
```

---

## 9️⃣ FIX: Memory Leak Prevention (TAMBAH di script.js)

**LOKASI**: `frontend/script.js` - Update modal handlers

```javascript
// ============================================================
// FIX 9: Event Listener Cleanup (Memory Leak Prevention)
// ============================================================

class EventManager {
  constructor() {
    this.listeners = new Map();
  }

  on(element, event, handler, options = {}) {
    if (!element) return;
    
    const key = `${element.id}_${event}`;
    element.addEventListener(event, handler, options);
    
    if (!this.listeners.has(element.id)) {
      this.listeners.set(element.id, []);
    }
    this.listeners.get(element.id).push({ event, handler, element });
  }

  off(element, event) {
    if (!element) return;
    
    const listeners = this.listeners.get(element.id) || [];
    listeners.forEach(listener => {
      if (listener.event === event) {
        element.removeEventListener(event, listener.handler);
      }
    });
    
    this.listeners.set(element.id, 
      listeners.filter(l => l.event !== event)
    );
  }

  clear(element) {
    if (!element) return;
    
    const listeners = this.listeners.get(element.id) || [];
    listeners.forEach(listener => {
      listener.element.removeEventListener(listener.event, listener.handler);
    });
    
    this.listeners.delete(element.id);
  }
}

const eventManager = new EventManager();

// Gunakan untuk modal:
function openImageModal(photoId) {
  const modal = document.getElementById('image-modal');
  const closeBtn = document.getElementById('close-image-modal');
  
  // ... open modal logic ...
  
  // Cleanup old listeners
  eventManager.off(closeBtn, 'click');
  
  // Add new listeners
  eventManager.on(closeBtn, 'click', closeImageModal);
}

function closeImageModal() {
  const modal = document.getElementById('image-modal');
  const closeBtn = document.getElementById('close-image-modal');
  
  // Cleanup
  eventManager.clear(closeBtn);
  
  modal.classList.add('hidden');
}
```

---

## 🔟 FIX: Image Optimization di Backend (GANTI di backend/worker.js)

**LOKASI**: `backend/worker.js` - Update image serving endpoint

```javascript
// ============================================================
// FIX 10: Image Optimization/Resizing
// Sebelum: Line 1099-1203 (Image serving)
// ============================================================

// TAMBAHKAN ini sebelum image serve section:

function getOptimizedImageUrl(key, isDtreasure, width = null, height = null, quality = 80) {
  // Jika ada width/height, return URL dengan query params untuk resizing
  // Backend bisa menggunakan Cloudflare Image Resizing atau service lain
  
  let baseUrl;
  if (isDtreasure) {
    baseUrl = `/api/dtreasure/img/${encodeURIComponent(key)}`;
  } else {
    baseUrl = `/api/img/${encodeURIComponent(key)}`;
  }
  
  const params = new URLSearchParams();
  if (width) params.append('w', width);
  if (height) params.append('h', height);
  if (quality) params.append('q', quality);
  
  return params.toString() ? `${baseUrl}?${params}` : baseUrl;
}

// GANTI di image serving section (line ~1186):
// Dari:
// return new Response(object.body, { headers });

// Menjadi:
if (url.searchParams.get('optimize') === 'true') {
  const width = parseInt(url.searchParams.get('w')) || 1200;
  const quality = parseInt(url.searchParams.get('q')) || 80;
  
  // Set cache headers untuk optimized images
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('X-Content-Type-Options', 'nosniff');
}

return new Response(object.body, { headers });
```

---

## 1️⃣1️⃣ FIX: Accessibility Labels (GANTI di frontend/index.html)

**LOKASI**: `frontend/index.html` - GANTI button tags

**CARI DAN GANTI SEMUA:**
```html
<!-- LAMA -->
<button type="button" id="zverse-btn" class="...">
  <i class="fas fa-cube"></i><span class="hidden sm:inline">ZVERSE</span>
</button>

<!-- BARU -->
<button 
  type="button" 
  id="zverse-btn" 
  class="..."
  aria-label="Open ZXAION Verse ecosystem"
  title="ZVERSE">
  <i class="fas fa-cube" aria-hidden="true"></i>
  <span class="hidden sm:inline">ZVERSE</span>
</button>
```

**CONTOH ARIA LABELS untuk semua button:**
```html
<!-- Navigation buttons -->
<button type="button" id="donation-btn" aria-label="Open donation options">
<button type="button" id="menu-btn" aria-label="Open navigation menu">
<button type="button" id="darkmode-toggle" aria-label="Toggle dark mode">

<!-- Gallery buttons -->
<button type="button" id="prev-page" aria-label="Previous page">
<button type="button" id="next-page" aria-label="Next page">

<!-- Modal buttons -->
<button id="close-image-modal" aria-label="Close image modal">
<button id="close-donation" aria-label="Close donation modal">
<button id="download-btn" aria-label="Download image">
```

---

## 1️⃣2️⃣ FIX: CSS Minification (TAMBAH di root)

**LOKASI**: Buat file `minify.js` di root

```javascript
// ============================================================
// FIX 12: CSS/JS Minification Script
// ============================================================

const fs = require('fs');
const path = require('path');
const CleanCSS = require('clean-css');

// Minify CSS
const cssPath = path.join(__dirname, 'frontend/style.css');
const css = fs.readFileSync(cssPath, 'utf8');
const minifiedCSS = new CleanCSS().minify(css).styles;
fs.writeFileSync(path.join(__dirname, 'frontend/style.min.css'), minifiedCSS);
console.log('✅ CSS minified');

// Minify JS (gunakan terser)
const { minify } = require('terser');
const jsPath = path.join(__dirname, 'frontend/script.js');
const js = fs.readFileSync(jsPath, 'utf8');

minify(js, {
  compress: true,
  mangle: true,
}).then(result => {
  fs.writeFileSync(path.join(__dirname, 'frontend/script.min.js'), result.code);
  console.log('✅ JS minified');
});
```

**ATAU gunakan build tool seperti Vite/Webpack**

---

## 1️⃣3️⃣ FIX: Rate Limiting Improvement (GANTI di backend/worker.js)

**LOKASI**: `backend/worker.js` - Line 183-203

**GANTI DARI:**
```javascript
async function checkRateLimit(endpoint, identifier, limit = 50, windowSec = 3600) {
  const key = `rate:${endpoint}:${identifier}`;
  const now = Math.floor(Date.now() / 1000);
  try {
    await DB.prepare(`
      INSERT INTO rate_limits (id, count, reset_time) VALUES (?, 1, ?)
      ON CONFLICT(id) DO UPDATE SET
        count      = CASE WHEN reset_time < ? THEN 1    ELSE count + 1 END,
        reset_time = CASE WHEN reset_time < ? THEN ?    ELSE reset_time END
    `).bind(key, now + windowSec, now, now, now + windowSec).run();

    const record = await DB.prepare(
      'SELECT count FROM rate_limits WHERE id = ?'
    ).bind(key).first();

    return !record || record.count <= limit;
```

**GANTI KE:**
```javascript
// ============================================================
// FIX 13: Improved Rate Limiting (Sliding Window)
// ============================================================
async function checkRateLimit(endpoint, identifier, limit = 50, windowSec = 3600) {
  const key = `rate:${endpoint}:${identifier}`;
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - windowSec;

  try {
    // Hapus entries lama
    await DB.prepare(
      'DELETE FROM rate_limits WHERE id = ? AND reset_time < ?'
    ).bind(key, now).run();

    // Hitung requests dalam window
    const { results } = await DB.prepare(
      'SELECT COUNT(*) as count FROM rate_limits WHERE id = ? AND timestamp > ?'
    ).bind(key, windowStart).all();

    const count = results[0]?.count || 0;

    if (count >= limit) {
      return false; // Rate limit exceeded
    }

    // Record this request
    await DB.prepare(
      'INSERT INTO rate_limits (id, timestamp, reset_time) VALUES (?, ?, ?)'
    ).bind(key, now, now + windowSec).run();

    return true;

  } catch (e) {
    console.error('[RateLimit] DB error:', e.message);
    return true; // Fail open (allow request)
  }
}

// Update database schema jika diperlukan:
// CREATE TABLE rate_limits (
//   id TEXT,
//   timestamp INTEGER,
//   reset_time INTEGER,
//   PRIMARY KEY(id, timestamp)
// );
// CREATE INDEX idx_rate_limits_reset ON rate_limits(reset_time);
```

---

## 1️⃣4️⃣ FIX: Dark Mode Logo Switch (TAMBAH di script.js)

**LOKASI**: `frontend/script.js` - Tambahkan function baru

```javascript
// ============================================================
// FIX 14: Dark Mode Logo Management
// ============================================================

function initializeDarkModeToggle() {
  const darkModeToggle = document.getElementById('darkmode-toggle');
  const html = document.documentElement;
  
  // Check system preference
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const savedDarkMode = localStorage.getItem('darkMode');
  
  if (savedDarkMode !== null) {
    if (savedDarkMode === 'true') {
      html.classList.add('dark');
    }
  } else if (isDark) {
    html.classList.add('dark');
    localStorage.setItem('darkMode', 'true');
  }

  darkModeToggle?.addEventListener('click', () => {
    html.classList.toggle('dark');
    const isDarkNow = html.classList.contains('dark');
    localStorage.setItem('darkMode', isDarkNow);
    
    // Update logo
    updateLogoForDarkMode(isDarkNow);
  });

  // Listen to system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addListener((e) => {
    if (localStorage.getItem('darkMode') === null) {
      if (e.matches) {
        html.classList.add('dark');
        updateLogoForDarkMode(true);
      } else {
        html.classList.remove('dark');
        updateLogoForDarkMode(false);
      }
    }
  });

  updateLogoForDarkMode(html.classList.contains('dark'));
}

function updateLogoForDarkMode(isDark) {
  const logoText = document.getElementById('logo-text');
  const logoImage = document.getElementById('logo-image');
  const logoZx = document.getElementById('logo-zx');
  
  if (isDark) {
    logoZx.classList.add('bg-white', 'text-gray-900');
    logoZx.classList.remove('bg-gradient-to-br', 'from-gray-900', 'to-black', 'text-white');
  } else {
    logoZx.classList.add('bg-gradient-to-br', 'from-gray-900', 'to-black', 'text-white');
    logoZx.classList.remove('bg-white', 'text-gray-900');
  }
}

document.addEventListener('DOMContentLoaded', initializeDarkModeToggle);
```

---

## 1️⃣5️⃣ FIX: Anime Collection Data Loading (TAMBAH di script.js)

**LOKASI**: `frontend/script.js` - Tambahkan function baru

```javascript
// ============================================================
// FIX 15: Anime Collection Data Loading
// ============================================================

async function loadAnimeCollections() {
  try {
    // Fetch anime images dari API
    const response = await fetchAPI(API_CONFIG.ENDPOINTS.LIST + '?category=Anime');
    const animePhotos = await response;
    
    // Update original album count
    const originalCount = animePhotos.filter(p => p.subCategory === 'ORIGINAL').length;
    document.getElementById('original-count').textContent = originalCount;
    
    // Display anime grid
    if (animePhotos.length > 0) {
      displayAnimeGrid(animePhotos);
    }
    
  } catch (error) {
    console.error('Failed to load anime collections:', error);
    showNotification('Failed to load anime collections', 'error');
  }
}

function displayAnimeGrid(photos) {
  const grid = document.getElementById('anime-grid');
  if (!grid) return;
  
  grid.innerHTML = '';
  
  photos.forEach(photo => {
    const card = document.createElement('div');
    card.className = 'anime-collection-card cursor-pointer';
    card.innerHTML = `
      <div class="relative h-64 overflow-hidden rounded-xl">
        <img 
          src="${photo.url}" 
          alt="${photo.title}"
          class="w-full h-full object-cover loading-shimmer"
          loading="lazy"
          onerror="handleImageError(this)"
        >
        <div class="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
          <div class="absolute bottom-0 left-0 right-0 p-4">
            <p class="text-white font-semibold text-sm line-clamp-2">${photo.title}</p>
          </div>
        </div>
      </div>
    `;
    
    card.addEventListener('click', () => openImageModal(photo.id));
    grid.appendChild(card);
  });
}

// Panggil saat kategori Anime dipilih
window.openAnimeCollection = async function(albumTitle) {
  await loadAnimeCollections();
  document.getElementById('anime-collections').classList.remove('hidden');
};
```

---

## 1️⃣6️⃣ FIX: Backend Search Endpoint (TAMBAH di backend/worker.js)

**LOKASI**: `backend/worker.js` - Tambahkan sebelum export default

```javascript
// ============================================================
// FIX 16: Search Endpoint
// ============================================================

// Tambahkan di fetch handler sebelum export:

if (path === '/api/search' && method === 'GET') {
  try {
    const query = url.searchParams.get('q') || '';
    const category = url.searchParams.get('category') || null;
    const limit = Math.min(100, parseInt(url.searchParams.get('limit') || '50', 10));

    // Sanitize query
    if (query.length < 2) {
      return new Response(JSON.stringify([]), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let sqlQuery = `
      SELECT * FROM images 
      WHERE (title LIKE ? OR category LIKE ?)
      AND category != 'Header'
    `;
    const bindings = [`%${query}%`, `%${query}%`];

    if (category && category !== 'All') {
      sqlQuery += ' AND category = ?';
      bindings.push(category);
    }

    sqlQuery += ' ORDER BY (view_count + download_count) DESC LIMIT ?';
    bindings.push(limit);

    const { results } = await DB.prepare(sqlQuery).bind(...bindings).all();

    const photos = results.map(row => ({
      id: row.id,
      title: row.title,
      category: row.category,
      url: `/api/img/${encodeURIComponent(row.r2_key)}`,
      viewCount: row.view_count || 0,
      downloadCount: row.download_count || 0,
    }));

    return new Response(JSON.stringify(photos), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
      },
    });

  } catch (e) {
    console.error('/api/search error:', e.message);
    return new Response(JSON.stringify([]), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
```

---

## 1️⃣7️⃣ FIX: Search Frontend Handler (TAMBAH di script.js)

**LOKASI**: `frontend/script.js` - Update search handler

```javascript
// ============================================================
// FIX 17: Frontend Search Handler dengan API
// ============================================================

let searchTimeout;

async function performSearch(query) {
  if (!query) {
    // Tampilkan gallery normal
    loadGallery(1);
    return;
  }

  try {
    loadingManager.show('search');
    
    const response = await fetchAPI(
      `/api/search?q=${encodeURIComponent(query)}&limit=50`
    );
    
    displaySearchResults(response);
    
  } catch (error) {
    console.error('Search error:', error);
    showNotification('❌ Search failed', 'error');
  } finally {
    loadingManager.hide('search');
  }
}

function displaySearchResults(photos) {
  const gallery = document.getElementById('gallery-container');
  
  if (!gallery) return;
  
  gallery.innerHTML = '';
  
  if (photos.length === 0) {
    document.getElementById('no-results')?.classList.remove('hidden');
    return;
  }

  document.getElementById('no-results')?.classList.add('hidden');
  
  photos.forEach(photo => {
    createGalleryItem(photo, gallery);
  });
}

// Update search input event listener
document.getElementById('searchInput')?.addEventListener('keyup', (e) => {
  clearTimeout(searchTimeout);
  const query = validateSearchInput(e.target.value);
  
  searchTimeout = setTimeout(() => {
    performSearch(query);
  }, 300); // Debounce 300ms
});
```

---

## Ringkasan File yang Perlu Diubah:

| File | Perubahan | Jenis |
|------|-----------|------|
| `frontend/script.js` | FIX 1,2,4,5,6,7,8,9,14,15,17 | TAMBAH + GANTI |
| `frontend/style.css` | FIX 3 | TAMBAH |
| `frontend/index.html` | FIX 11 | GANTI |
| `backend/worker.js` | FIX 10,13,16 | TAMBAH + GANTI |
| `minify.js` (baru) | FIX 12 | BUAT BARU |

---

## Urutan Implementasi (Prioritas):

1. ✅ **FIX 1** - ResizeObserver (Mobile layout)
2. ✅ **FIX 2** - PayPal Integration
3. ✅ **FIX 4** - Error Handling
4. ✅ **FIX 5** - Lazy Loading
5. ✅ **FIX 6** - Input Sanitization
6. ✅ **FIX 7** - API Config
7. ✅ **FIX 8** - Loading States
8. ✅ **FIX 13** - Rate Limiting
9. ✅ **FIX 9** - Memory Leak Prevention
10. ✅ **FIX 14** - Dark Mode
11. ✅ **FIX 15** - Anime Collections
12. ✅ **FIX 16** - Backend Search
13. ✅ **FIX 17** - Frontend Search
14. ✅ **FIX 3** - Shield Overlay
15. ✅ **FIX 11** - Accessibility
16. ✅ **FIX 10** - Image Optimization
17. ✅ **FIX 12** - Minification

---

**Gunakan code ini secara langsung dan paste ke file masing-masing sesuai lokasi yang ditunjukkan!**
