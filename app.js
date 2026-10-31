/* Parrfums Vault — storefront logic
   Catalogue, pricing and contact details verified against @parrfums.vault (Oct 2026).
   See BRAND.md for the full source of truth. Vanilla JS, no dependencies. */

const BRAND = {
  phoneDisplay: '+91 85919 35352',
  phoneHref: 'tel:+918591935352',
  whatsapp: 'https://chat.whatsapp.com/LGYOr1IxhvgEX4HIp7J5Ts',
  whatsappDirect: 'https://wa.me/918591935352',
  instagram: 'https://www.instagram.com/parrfums.vault/',
  instagramDm: 'https://ig.me/m/parrfums.vault',
  email: 'quillsandcologne@gmail.com',
  city: 'Mumbai'
};

/* Owner-confirmed prices, shipping and media, 22 October 2026. */
const CATALOGUE_REVISION = '2026-10-22-commerce';
const SIZE_PRICES = { 30: 400, 50: 750, 100: 1250 };
const DEFAULT_SIZE = 50;
const HERO_SIZE = 50;
const SHIPPING = { mumbai: 100, outside: 120 };
const shippingZone = city => /^(mumbai|bombay)$/i.test(String(city || '').trim()) ? 'mumbai' : 'outside';
const shippingFee = city => SHIPPING[shippingZone(city)];
let catalogueReady = false;
let catalogueLoading=true;
let catalogueRefreshInFlight = false;
let catalogueSignature = "";

// Publishable key is designed for browser use; RLS and SELECT-only grants are
// the security boundary. Never replace this with a secret/service-role key.
const CATALOGUE_API = 'https://lshwmudskeeknmcxlffe.supabase.co/rest/v1';
const CATALOGUE_KEY = 'sb_publishable_wpkP3QTopRIY1V-yLUgx6Q_JNFC_p3B';
const SUPABASE_URL = 'https://lshwmudskeeknmcxlffe.supabase.co';
const supabaseClient = window.supabase?.createClient(SUPABASE_URL, CATALOGUE_KEY, {
  auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true, storageKey: 'pv-auth-v1' }
});

/* Owner-supplied artwork, optimized without cropping the product or its labels. */
const media = slug => `assets/media/${slug}-1080.webp`;
const IMG = {
  angel: [media('angel-share')], oud: [media('lavender-oud')],
  candy: [media('candy')], leather: [media('leather')],
  guilty: [media('guilty-man')], vanilla: [media('vanilla-28')],
  hero: media('editorial-essentials'), botanicals: media('editorial-ritual'),
  offerFestive: media('combo-festive'), offerDuo: media('combo-duo')
};
const COMBO_SLIDES = [
  { image: media('combo-festive'), offer: 'festive-four', label: 'The Festive Four' },
  { image: media('combo-duo'), offer: 'duo-plus', label: 'The Duo Plus' },
  { image: media('combo-festive-diwali'), offer: 'festive-four', label: 'The Diwali gift edit' },
  { image: media('combo-duo-gift'), offer: 'duo-plus', label: 'One for you. One for them.' },
  { image: media('combo-duo-diwali'), offer: 'duo-plus', label: 'A little more to give' }
];

const products = [
  {
    id: 'angel-share', name: 'Angel Share', category: 'Soft', gender: 'Unisex',
    notes: 'cinnamon · vanilla · amber',
    desc: 'A warm, spicy signature with woody sweetness, vanilla, cinnamon and amber. A little warmth for your everyday ritual.',
    img: IMG.angel[0], gallery: IMG.angel, sizes: [30, 50, 100]
  },
  {
    id: 'lavender-oud', name: 'Lavender Oud', category: 'Oud', gender: 'Unisex',
    notes: 'citrus · oud · warm spice',
    desc: 'Citrus and oud meet warm spice, woody depth and a fresh, leathery finish. Refined and ready for the occasions worth remembering.',
    img: IMG.oud[0], gallery: IMG.oud, sizes: [30, 50, 100]
  },
  {
    id: 'candy', name: 'Candy', category: 'Sweet', gender: 'Women',
    notes: 'vanilla · fruit · amber',
    desc: 'Playful fruit and vanilla, with amber, aromatic woods and a soft spicy finish. Sweet, smooth and made to be remembered.',
    img: IMG.candy[0], gallery: IMG.candy, sizes: [30, 50, 100]
  },
  {
    id: 'leather', name: 'Leather', category: 'Bold', gender: 'Unisex',
    notes: 'leather · vanilla · amber',
    desc: 'Leather, vanilla and warm spice, softened with amber and white florals. Bold, sophisticated and made for everyone.',
    img: IMG.leather[0], gallery: IMG.leather, sizes: [30, 50, 100]
  },
  {
    id: 'guilty-man', name: 'Guilty Man', category: 'Bold', gender: 'Men',
    notes: 'woods · citrus · fresh spice',
    desc: 'Woody and fresh spicy, with aromatic citrus, lavender and white florals. A composed, quietly magnetic signature.',
    img: IMG.guilty[0], gallery: IMG.guilty, sizes: [30, 50, 100]
  },
  {
    id: 'vanilla-28', name: 'Vanilla 28', category: 'Sweet', gender: 'Unisex',
    notes: 'vanilla · sweet woods · amber',
    desc: 'Sweet vanilla and warm woods, with powdery musk, amber and a soft spicy finish. Comfort with a signature.',
    img: IMG.vanilla[0], gallery: IMG.vanilla, sizes: [30, 50, 100]
  }
];

/* The two offers the brand actually runs. */
const combos = [
  {
    id: 'festive-four', name: 'The Festive Four', kind: 'combo', price: 2600,
    badge: 'Buy 2 × 100ml, get 2 × 30ml FREE',
    notes: 'Choose your free fragrances: Guilty Man or Vanilla 28',
    desc: 'Four full fragrances — two 100ml bottles and two 30ml on the house. The festive edit, ready to gift.',
    img: IMG.offerFestive
  },
  {
    id: 'duo-plus', name: 'The Duo Plus', kind: 'combo', price: 1600,
    badge: 'Buy 2 × 50ml, get 1 × 30ml FREE',
    notes: 'Choose your free fragrance: Guilty Man or Vanilla 28',
    desc: 'The everyday trio. Two 50ml bottles and a 30ml you did not pay for — the easiest way to find your signature.',
    img: IMG.offerDuo
  }
];

const categories = ['All', 'Soft', 'Sweet', 'Bold', 'Oud'];

const readStore = (key, fallback) => {
  try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return Array.isArray(v) ? v : fallback; }
  catch { return fallback; }
};

let state = {
  cart: readStore('am-cart', []),
  wish: readStore('am-wish', []),
  query: '', category: 'All', sort: 'featured',
  galleryIndex: {}, finderAnswers: [], selectedSize: {}
};
let authUser = null;
let authReady = !supabaseClient;
let authNotice = '';
let accountProfile = null;
let savedAddresses = [];
let accountOrders = [];
let accountLoading = false;
let accountTab = 'addresses';
let guestWishlist = [...state.wish];

const app = document.querySelector('#app');
const announcer = document.querySelector('#route-announcer');
let catalogueUserInteracted = false;
for (const event of ['pointerdown', 'keydown', 'wheel', 'touchstart']) {
  document.addEventListener(event, () => { catalogueUserInteracted = true; }, { once: true, passive: true });
}
const money = n => `₹${Number(n).toLocaleString('en-IN')}`;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const get = id => products.find(p => p.id === id) || combos.find(c => c.id === id);
const isCombo = p => !!p && p.kind === 'combo';

const FALLBACK_IMG = IMG.hero;
const imgTag = (src, alt, cls = '', eager = false) => {
  const responsive = /^assets\/media\/[a-z0-9-]+-1080\.webp$/.test(src);
  const base = responsive ? src.replace('-1080.webp', '') : '';
  const portrait = !base.includes('combo-');
  return `<img src="${esc(responsive ? `${base}-720.webp` : src)}" ${responsive ? `srcset="${base}-400.webp 400w, ${base}-720.webp 720w, ${base}-1080.webp 1080w" sizes="(max-width: 600px) 92vw, (max-width: 1000px) 50vw, 38vw" width="1080" height="${portrait ? 1440 : 1080}"` : ''} alt="${esc(alt)}" loading="${eager ? 'eager' : 'lazy'}" ${eager ? 'fetchpriority="high"' : ''} decoding="async" class="${cls}" data-image-fallback="${FALLBACK_IMG}">`;
};

const heartSvg = filled =>
  `<svg class="heart-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`;

/* Official brand marks (Simple Icons geometry) */
const waSvg =
  `<svg class="wa-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>`;

const igSvg =
  `<svg class="ig-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.741 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.741 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.585-.074-4.85c-.061-1.17-.256-1.805-.421-2.227-.224-.562-.479-.96-.899-1.381-.419-.419-.824-.679-1.38-.896-.42-.164-1.065-.361-2.221-.421-1.275-.045-1.65-.06-4.859-.06l.045.03zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm7.846-10.405a1.441 1.441 0 0 1-2.88 0 1.44 1.44 0 0 1 2.88 0z"/></svg>`;

const phoneSvg =
  `<svg class="ph-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l2.27-2.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`;

const waLink = (message, label, cls = 'btn wa-btn') => {
  const url = `${BRAND.whatsappDirect}?text=${encodeURIComponent(message)}`;
  return `<a class="${cls}" href="${esc(url)}" target="_blank" rel="noreferrer">${waSvg}<span>${esc(label)}</span></a>`;
};
const availabilityInquiryLink = (item, size, cls = 'btn wa-btn') => {
  const itemLabel = isCombo(item) ? `${item.name} (${item.badge})` : `${item.name}${size ? `, ${size}ml` : ''}`;
  return waLink(`Hi Parrfums Vault! Please check current availability for ${itemLabel} and help me order if available.`, isCombo(item) ? 'Check combo on WhatsApp' : 'Ask about availability', cls);
};
const comboAvailabilityLink = (item, cls = 'btn wa-btn full') => availabilityInquiryLink(item, 0, cls);

const phoneLink = (label = 'Call us') =>
  `<a class="contact-link phone-link" href="${BRAND.phoneHref}">${esc(BRAND.phoneDisplay)}</a>`;

const igLink = (label = 'Instagram') =>
  `<a class="text-link ig-link" href="${BRAND.instagram}" target="_blank" rel="noreferrer">${igSvg}<span>${esc(label)}</span></a>`;
const formatAccords = value => String(value || '').split(/[·,]/).map(part => part.trim()).filter(Boolean).map(part => part.replace(/\b([a-z])/g, letter => letter.toUpperCase())).join(' · ');

const defaultSize=p=>{
  const sizes=p?.sizes||[];
  if(sizes.includes(DEFAULT_SIZE)&&Commerce.available(p,DEFAULT_SIZE))return DEFAULT_SIZE;
  return sizes.find(size=>Commerce.available(p,size))||(sizes.includes(DEFAULT_SIZE)?DEFAULT_SIZE:(sizes[0]||0));
};
const priceFor = (p, size) => isCombo(p) ? p.price : (p.prices?.[size] || SIZE_PRICES[size] || SIZE_PRICES[DEFAULT_SIZE]);
const priceLabel = (p, size) => isCombo(p) ? 'Combo' : `${size}ml`;

async function loadCatalogue() {
  if(catalogueRefreshInFlight)return;
  catalogueRefreshInFlight=true;
  const read = async (resource, select) => {
    const url = `${CATALOGUE_API}/${resource}?select=${select}`;
    const response = await fetch(url, { headers: { apikey: CATALOGUE_KEY }, cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Catalogue request failed (${response.status})`);
    return response.json();
  };
  const safeImage = path => typeof path === 'string' && /^assets\/[a-zA-Z0-9._/-]+$/.test(path) && !path.includes('..') || typeof path === 'string' && path.startsWith('https://lshwmudskeeknmcxlffe.supabase.co/storage/v1/object/public/catalogue-media/') && !path.includes('..');

  try {
    const settingsRequest = read('storefront_settings', 'revision,inventory_unlimited&id=eq.current')
      .catch(() => read('storefront_settings', 'revision&id=eq.current'));
    const [rows, prices, offersRows, settings, components, ratings, popularity] = await Promise.all([
      read('products', '*&active=eq.true&order=sort_order'),
      read('product_prices', 'product_id,size_ml,price_inr,sku,available_quantity,active,low_stock_threshold&order=product_id,size_ml'),
      read('offers', 'id,name,price_inr,badge,notes,description,image_path,sort_order&active=eq.true&order=sort_order'),
      settingsRequest,
      read('offer_components','*'),read('product_review_summary','*'),read('product_popularity','*')
    ]);
    if (settings?.[0]?.revision !== CATALOGUE_REVISION) throw new Error('Catalogue update pending');
    if (!Array.isArray(rows) || !rows.length || !Array.isArray(prices) || !Array.isArray(offersRows)) throw new Error('Invalid catalogue response');

    const priceMap = new Map();
    for (const row of prices) {
      if (typeof row.product_id !== 'string' || !Number.isSafeInteger(row.size_ml) || !Number.isSafeInteger(row.price_inr) || row.price_inr <= 0) throw new Error('Invalid price row');
      const sizes = priceMap.get(row.product_id) || {};
      sizes[row.size_ml] = row.price_inr;
      priceMap.set(row.product_id, sizes);
    }
    const nextProducts = rows.map(row => {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.id) || !safeImage(row.image_path) || !Array.isArray(row.gallery_paths) || !row.gallery_paths.every(safeImage) || !Array.isArray(row.sizes_ml)) throw new Error('Invalid product row');
      const productPrices = priceMap.get(row.id) || {};
      const sizes = row.sizes_ml.filter(size => Number.isSafeInteger(size) && size > 0 && Number.isSafeInteger(productPrices[size]));

      return { ...row, variants: prices.filter(v=>v.product_id===row.id), id: row.id, name: row.name, category: row.category, gender: row.gender, notes: row.notes, desc: row.description, img: row.image_path, gallery: row.gallery_paths.length?row.gallery_paths:[row.image_path], sizes, prices: productPrices };
    });
    const nextOffers = offersRows.map(row => {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.id) || !safeImage(row.image_path) || !Number.isSafeInteger(row.price_inr) || row.price_inr <= 0) throw new Error('Invalid offer row');
      return { ...row, variants: prices.filter(v=>v.product_id===row.id), id: row.id, name: row.name, kind: 'combo', price: row.price_inr, badge: row.badge, notes: row.notes, desc: row.description, img: row.image_path };
    });

    const inventoryUnlimited=settings?.[0]?.inventory_unlimited===true;
    const nextSignature=JSON.stringify({nextProducts,nextOffers,components,ratings,popularity,revision:settings?.[0]?.revision,inventoryUnlimited});
    const catalogueChanged=nextSignature!==catalogueSignature;
    catalogueSignature=nextSignature;

    Commerce.cache.components=components; Commerce.cache.summary=ratings; Commerce.cache.popularity=popularity; Commerce.cache.inventoryUnlimited=inventoryUnlimited;
    products.splice(0, products.length, ...nextProducts);
    combos.splice(0, combos.length, ...nextOffers);
    const firstPrices = nextProducts[0].prices;
    Object.assign(SIZE_PRICES, firstPrices);
    catalogueReady = true; catalogueLoading=false;
    normalizeCart();
    // A database change can invalidate a stored variant choice; normalize it.
    for (const product of nextProducts) {
      if (!product.sizes.includes(state.selectedSize[product.id])) state.selectedSize[product.id] = product.sizes.includes(DEFAULT_SIZE) ? DEFAULT_SIZE : product.sizes[0];
    }
    // Do not interrupt an in-progress gesture/scroll if the network responds late.
    // Re-render the route the app is actually showing, never the URL alone, so a
    // late catalogue response can never replace the admin console with another page.
    const target = currentPath || (location.hash.slice(1) || location.pathname.replace(/^\/+|\/+$/g, '') || 'landing');
    if (catalogueChanged && currentPath !== 'admin') {
      if (!catalogueUserInteracted) render(target, { keepScroll: true });
      else render(currentPath, { keepScroll: true });
    }
  } catch {
    // Keep the bundled catalogue available if the network/API is unavailable.
    catalogueLoading=false;console.warn('Using the built-in catalogue because the live catalogue could not be loaded.');
    render(currentPath, { keepScroll: true });
  } finally {
    catalogueRefreshInFlight=false;
  }
}

const save = () => {
  try {
    localStorage.setItem('am-cart', JSON.stringify(state.cart));
    if (!authUser) localStorage.setItem('am-wish', JSON.stringify(state.wish));
  } catch { toast('Your changes will last for this visit only'); }
  updateCounts();
};

const updateCounts = () => {
  const c = document.querySelector('.cart-count');
  const w = document.querySelector('.wish-count');
  if (c) c.textContent = state.cart.reduce((n, i) => n + i.qty, 0);
  if (w) w.textContent = state.wish.length;
};

const toast = (t, action = null) => {
  const x = document.querySelector('#toast');
  if (!x) return;
  x.replaceChildren(document.createTextNode(t));
  if (action) {
    const link = document.createElement('a');
    link.href = action.href;
    link.className = 'toast-action';
    link.textContent = action.label;
    x.append(' ', link);
  }
  x.classList.add('show');
  clearTimeout(x._t);
  x._t = setTimeout(() => x.classList.remove('show'), 2200);
};

window.PVLoader = (() => {
  const el = document.querySelector('#pv-loading');
  let timer;
  return {
    show(label = 'Opening your vault') {
      if (!el) return;
      clearTimeout(timer);
      el.querySelector('[data-loading-label]').textContent = label;
      el.hidden = false;
      requestAnimationFrame(() => el.classList.add('is-visible'));
    },
    hide() {
      if (!el) return;
      el.classList.remove('is-visible');
      clearTimeout(timer);
      timer = setTimeout(() => { el.hidden = true; }, 220);
    },
  };
})();

const announce = msg => { if (announcer) announcer.textContent = msg; };

document.addEventListener('error', event => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement) || !image.dataset.imageFallback || image.dataset.fallbackTried) return;
  image.dataset.fallbackTried = 'true';
  image.removeAttribute('srcset');
  image.src = image.dataset.imageFallback;
}, true);

/* ---------- shared fragments ---------- */

const icon = name => {
  const P = {
    bag: '<path d="M4 8h16l1.5 13h-19L4 8Z"/><path d="M8 8V6.5a4 4 0 0 1 8 0V8"/><path d="M10 12v5h4v-5M11 12v-2h2v2"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
    truck: '<path d="M3 6h11v9H3zM14 9h3.6l2.4 3v3h-2"/><circle cx="7" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/>',
    box: '<path d="M21 8v8l-9 5-9-5V8l9-5 9 5Z"/><path d="m3 8 9 5 9-5M12 21v-8"/>',
    sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/>',
    check: '<path d="m5 12 4.2 4.2L19 6.5"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>'
  };
  return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
};

const priceBlock = p => {
  if (isCombo(p)) {
    return `<div class="price"><span class="price-amount">${money(p.price)}</span><span class="price-size">combo</span></div>
            <div class="price-ladder"><span>${esc(p.badge)}</span></div>`;
  }
  const sizes = p.sizes || Object.keys(SIZE_PRICES).map(Number);
  if(!sizes.length)return '<p class="sub">Pricing awaiting confirmation</p>';
  const heroSize = sizes.includes(HERO_SIZE) ? HERO_SIZE : sizes[sizes.length - 1];
  return `<div class="price"><span class="price-amount">${money(priceFor(p, heroSize))}</span><span class="price-size">${heroSize}ml</span></div>
          <div class="price-ladder">${sizes.filter(s => s !== heroSize).map(s => `<span>${s}ml ${money(priceFor(p, s))}</span>`).join('<span aria-hidden="true">·</span>')}</div>`;
}

function cartQuantityControl(index, className = 'qty') {
  const item = state.cart[index];
  if (!item) return '';
  const availability = Commerce.stock(get(item.id), item.size);
  const max = availability.unlimited ? 20 : Math.min(20, availability.quantity || 0);
  return `<div class="${className}" role="group" aria-label="Quantity for ${esc(item.name)}">
    <button type="button" data-qty="${index}" data-delta="-1" aria-label="Decrease ${esc(item.name)} quantity">−</button>
    <output aria-live="polite">${item.qty}</output>
    <button type="button" data-qty="${index}" data-delta="1" aria-label="Increase ${esc(item.name)} quantity" ${item.qty >= max ? 'disabled' : ''}>+</button>
  </div>`;
}

function addedCartActions(index, className = 'added-cart-actions', qtyClass = 'qty') {
  return `<div class="${className}">${cartQuantityControl(index, qtyClass)}<a class="btn small added-cart-link" href="#cart">Go to bag</a></div>`;
}

function card(p) {
  const wished = state.wish.includes(p.id);
  const size = defaultSize(p), inStock = Commerce.available(p, size);
  const cartIndex = state.cart.findIndex(i => i.id === p.id && i.size === size);
  const addLabel = inStock ? `Add ${size}ml · ${money(priceFor(p, size))}` : Commerce.stock(p, size).label;
  return `<article class="product-card">
    <div class="product-image"><a href="#product/${p.id}" aria-label="View ${esc(p.name)}">${imgTag(p.img, `${p.name} — Parrfums Vault fragrance`)}</a>
      <button class="heart ${wished ? 'active' : ''}" data-wish="${p.id}" aria-label="${wished ? 'Remove' : 'Add'} ${esc(p.name)} ${wished ? 'from' : 'to'} wishlist" aria-pressed="${wished}">${heartSvg(wished)}</button></div>
    <div class="product-meta"><a href="#product/${p.id}"><h3>${esc(p.name)}</h3><p>${esc(formatAccords(p.notes))}</p>${priceBlock(p)}</a>
      ${cartIndex>=0?addedCartActions(cartIndex,'added-cart-actions quick-added','qty quick-qty'):inStock?`<button class="quick-add" data-add="${p.id}" data-size="${size}">${esc(addLabel)} <span aria-hidden="true">+</span></button>`:availabilityInquiryLink(p,size,'quick-add availability-inquiry')}</div>
  </article>`;
}

function offerCard(c) {
  const availability = Commerce.stock(c, 0);
  const cartIndex = state.cart.findIndex(i => i.id === c.id && i.size === 0);
  return `<article class="offer-card">
    <div class="offer-img">${imgTag(c.img, `${c.name} — ${c.badge}`)}<span class="offer-badge">Combo</span></div>
    <div class="offer-body">
      <p class="eyebrow">The vault offer</p>
      <h3>${esc(c.name)}</h3>
      <p class="offer-per">${esc(c.badge)}</p>
      <p class="offer-notes">${esc(c.notes)}</p>
      <p class="offer-price">${money(c.price)}</p>
      <div class="offer-actions">
        ${cartIndex>=0?addedCartActions(cartIndex):availability.available?`<button class="btn primary" data-add="${c.id}">Add to bag</button>`:availabilityInquiryLink(c,0,'btn wa-btn')}${availability.available?waLink(`Hi Parrfums Vault! I'd like to order the ${c.name} (${c.badge}) for ${money(c.price)}.`, 'Order on WhatsApp', 'btn ghost wa-btn'):''}
      </div>
    </div>
  </article>`;
}

function contactStrip() {
  return `<div class="contact-strip">
    <a class="contact-item" href="${BRAND.whatsapp}" target="_blank" rel="noreferrer">${waSvg}<span><strong>Order on WhatsApp</strong><small>Fastest way to order</small></span></a>
    <a class="contact-item" href="${BRAND.phoneHref}">${phoneSvg}<span><strong>${BRAND.phoneDisplay}</strong><small>Call to order</small></span></a>
    <a class="contact-item" href="${BRAND.instagramDm}" target="_blank" rel="noreferrer">${igSvg}<span><strong>DM @parrfums.vault</strong><small>Limited stock — DM now</small></span></a>
    <a class="contact-item" href="mailto:${encodeURIComponent(BRAND.email)}">${icon('mail')}<span><strong>Email us</strong><small>${esc(BRAND.email)}</small></span></a>
  </div>`;
}

const promiseBar = () => `<section class="promise-bar" aria-label="Parrfums Vault promises">
  <div><strong>Handmade</strong><span>Small-batch fragrance from ${BRAND.city}</span></div>
  <div><strong>Long-lasting</strong><span>Stays long after you leave</span></div>
  <div><strong>Pan-India delivery</strong><span>Ships across India</span></div>
  <div><strong>Limited stock</strong><span>Order on WhatsApp</span></div>
</section>`;

/* ---------- views ---------- */

const brandMark = `<span class="brand-mark" aria-hidden="true"><img class="logo-image" src="assets/parrfums-vault-logo.png" alt="" width="44" height="44"></span>`;

const arrowSvg = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`;
const prevSvg = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14.5 5-7 7 7 7"/></svg>`;
const nextSvg = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9.5 5 7 7-7 7"/></svg>`;
const pauseSvg = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>`;
const playSvg = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m8 5 11 7-11 7z"/></svg>`;
const arrowDownSvg = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>`;
const themeIcon = () => window.PVTheme?.icon() || '';

/* ---------------------------------------------------------------- landing */
function landing() {
  return `<section class="landing">
    <div class="landing-bg" role="img" aria-label="Parrfums Vault fragrance photography"></div>
    <div class="landing-scrim" aria-hidden="true"></div>
    <div class="landing-top"><span class="brand landing-brand" role="img" aria-label="Parrfums Vault">${brandMark}</span><div class="landing-top-actions"><button class="theme-toggle" type="button" data-theme-toggle aria-label="Switch to dark mode">${themeIcon()}</button></div></div>
    <div class="landing-inner"><p class="landing-eyebrow">Parrfums Vault · Handmade in ${BRAND.city}</p><h1 class="landing-brand-name">A fragrance.<br>A signature.<br><em>An impression.</em></h1><p class="landing-sub">Discover distinctive fragrances, thoughtfully crafted in Mumbai.</p><div class="landing-actions"><a class="landing-enter landing-primary" href="#shop">Fragrances ${arrowSvg}</a><a class="landing-enter landing-secondary" href="#finder">Find Your Scent ${arrowSvg}</a></div></div>
    <div class="landing-foot"><span>Handmade in ${BRAND.city}</span><span>Unique · Timeless</span><span>Six signature scents</span><button class="landing-scroll" type="button" data-scroll-to="landing-story" aria-label="Discover the Parrfums Vault story below">${arrowDownSvg}</button></div>
  </section>${landingShowcase()}`;
}

function landingShowcase() {
  return `<section class="section landing-story" id="landing-story"><p class="eyebrow">A little bottle. A lasting impression.</p><h2>Fragrance is a way<br>of being <em>remembered.</em></h2><p class="landing-story-copy">The everyday rituals. The celebrations. The people who make them special. Parrfums Vault brings a little intention to each one, with handmade fragrance from Mumbai.</p></section>
  <section class="section combo-section" id="the-vault"><div class="section-head"><div><p class="eyebrow">The gifting edit</p><h2>Some things are better <em>together.</em></h2></div></div>${comboSlideshow({ showcase: true })}</section>
  <section class="section landing-collection"><div class="section-head"><div><p class="eyebrow">Meet the collection</p><h2>Six scents. A world of <em>feeling.</em></h2></div></div><div class="landing-gallery">${products.map(p=>`<figure><a href="#product/${encodeURIComponent(p.id)}" aria-label="${esc(p.name)}">${imgTag(p.img,`${p.name} by Parrfums Vault`)}</a><figcaption><h3>${esc(p.name)}</h3><p>${esc(p.notes)}</p></figcaption></figure>`).join('')}</div></section>
  <section class="ritual-section"><div class="ritual-art">${imgTag(media('editorial-gifting'),'A fragrance, thoughtfully wrapped')}${imgTag(media('editorial-evening'),'Parrfums Vault, an evening ritual')}</div><div class="ritual-copy"><p class="eyebrow">Made for the moments</p><h2>Let the memory<br><em>linger.</em></h2><p>A familiar note. A favourite person. A moment that becomes a memory. This is our world of fragrance — personal, expressive, and made to stay with you.</p></div></section>
  <div class="landing-signoff"><img class="footer-logo" src="assets/parrfums-vault-logo.png" alt="Parrfums Vault" width="76" height="76"><p>Handmade in Mumbai. Worn everywhere.</p><small>© ${new Date().getFullYear()} Parrfums Vault</small></div>`;
}

function home() {
  return `<section class="vault-intro">
    <div class="intro-copy">
      <p class="eyebrow"><span class="live-dot" aria-hidden="true"></span> Handmade in Mumbai · Worn everywhere</p>
      <h1>A fragrance.<br>A signature.<br><em>An impression.</em></h1>
      <p class="intro-description">Discover distinctive fragrances, thoughtfully crafted in Mumbai.</p>
      <div class="intro-actions"><a class="btn primary" href="#shop">Fragrances ${arrowSvg}</a><a class="text-link" href="#finder">Find Your Scent ${arrowSvg}</a></div>
      <div class="intro-prices" aria-label="Fragrance prices"><span><strong>30<small>ml</small></strong>₹400</span><span><strong>50<small>ml</small></strong>₹750</span><span><strong>100<small>ml</small></strong>₹1,250</span></div>
      <p class="delivery-note">${icon('truck')} Delivery across India · Mumbai ₹100 / elsewhere ₹120</p>
    </div>
    <div class="intro-art">${imgTag(IMG.hero, 'Angel Share by Parrfums Vault, an everyday essential', '', true)}<span class="art-caption">Your everyday, a little extraordinary.</span></div>
  </section>${storefrontSections()}`;
}

function storefrontSections() {
  return `<div class="vault-ribbon" aria-label="Our promise"><span>Small batches. Lasting impressions.</span><span>Handmade with intention</span><span>${icon('sparkle')} Find your fragrance identity</span></div>
  <section class="section combo-section" id="the-vault">
    <div class="section-head"><div><p class="eyebrow">A little more to love</p><h2>Good things come <em>together.</em></h2></div><a class="text-link" href="#combos">All combos ${arrowSvg}</a></div>
    ${comboSlideshow()}
  </section>
  <section class="section band-paper">
    <div class="section-head">
      <div><p class="eyebrow">Meet the collection</p><h2>Find a little <em>you.</em></h2></div>
      <a class="text-link" href="#shop">Shop the vault</a>
    </div>
    <div class="product-grid">${products.map(card).join('')}</div>
  </section>
  <section class="ritual-section"><div class="ritual-art">${imgTag(media('editorial-gifting'), 'Lavender Oud wrapped as a gift')}${imgTag(media('editorial-evening'), 'A Parrfums Vault fragrance for an evening out')}</div><div class="ritual-copy"><p class="eyebrow">Made for the moments</p><h2>Some gifts stay<br>with <em>you.</em></h2><p>For the celebrations, the everyday rituals, and the people who make both special. Handmade in Mumbai. Always personal.</p><a class="btn" href="#combos">Find their next favourite ${arrowSvg}</a><a class="text-link" href="#finder">Or find your own scent</a></div></section>
  ${contactBand('Ordering', 'Order on WhatsApp.', 'Send us your list and we will confirm stock, price and delivery personally — usually within a few hours.')}`;
}

function comboSlideshow({ showcase = false } = {}) {
  return `<div class="combo-carousel" role="region" aria-roledescription="carousel" aria-label="Fragrance combos" tabindex="0">
    <div class="combo-stage">${COMBO_SLIDES.map((slide, index) => {
      const c = get(slide.offer);
      if (!c) return '';
      return `<article class="combo-slide" role="group" aria-roledescription="slide" aria-label="${index + 1} of ${COMBO_SLIDES.length}: ${esc(slide.label)}" ${index ? 'hidden' : ''}>
        ${showcase ? `<a class="combo-poster" href="#product/${c.id}" aria-label="Explore ${esc(c.name)}">${imgTag(slide.image,slide.label,'',index===0)}</a><div class="combo-copy"><p class="eyebrow">The gifting edit · ${String(index+1).padStart(2,'0')}</p><h3>${esc(c.name)}</h3><p class="showcase-caption">${esc(slide.label)}</p><p class="combo-choice">A little for you. A little for someone special. A collection of fragrances, gathered for the moments worth remembering.</p></div>` : `<a class="combo-poster" href="#product/${c.id}" aria-label="Explore ${esc(c.name)}">${imgTag(slide.image, `${slide.label}: ${c.badge} for ${money(c.price)}. Shipping extra.`, '', index === 0)}</a><div class="combo-copy"><p class="eyebrow">The gifting edit · ${String(index + 1).padStart(2, '0')}</p><h3>${esc(c.name)}</h3><p class="combo-inclusion">${esc(c.badge)}</p><p class="combo-choice">${esc(c.notes)}</p><p class="combo-price">${money(c.price)} <small>+ shipping</small></p><div class="offer-actions"><a class="btn primary" href="#product/${c.id}">Explore this combo ${arrowSvg}</a>${waLink(`Hi Parrfums Vault! I'd like the ${c.name} for ${money(c.price)} plus shipping. Please help me choose my fragrances.`, 'Ask on WhatsApp', 'text-link wa-btn')}</div><p class="delivery-note">Mumbai ₹100 · Outside Mumbai ₹120</p></div>`}
      </article>`;
    }).join('')}</div>
    <div class="carousel-controls"><span class="carousel-label">The combo collection</span><div class="carousel-dots" role="group" aria-label="Choose combo slide">${COMBO_SLIDES.map((s,i)=>`<button type="button" data-slide="${i}" aria-label="Show ${esc(s.label)}" aria-pressed="${i===0}"><span></span></button>`).join('')}</div><div class="carousel-buttons"><button type="button" data-carousel-prev aria-label="Previous combo">${prevSvg}</button><button type="button" data-carousel-pause aria-label="Pause slideshow" aria-pressed="false">${pauseSvg}</button><button type="button" data-carousel-next aria-label="Next combo">${nextSvg}</button></div><span class="sr-only" data-slide-status role="status" aria-live="polite"></span></div>
  </div>`;
}

function comboPage() {
  return `<section class="page-shell combos-page"><div class="section-head"><div><p class="eyebrow">More to gift. More to keep.</p><h1 class="page-title">The combo <em>collection.</em></h1></div><span class="collection-stamp">Made to be shared ${icon('sparkle')}</span></div><p class="page-intro">Two ways to build your fragrance wardrobe. Choose your scents with us on WhatsApp; your free fragrance can be Guilty Man or Vanilla 28.</p><div class="combo-grid">${combos.map(offerCard).join('')}</div><div class="shipping-notice">${icon('truck')} Shipping is extra on every order: Mumbai ₹100 · Outside Mumbai ₹120.</div><div class="section-head campaign-heading"><div><p class="eyebrow">From the gifting edit</p><h2>A little festive inspiration.</h2></div></div><div class="campaign-grid">${COMBO_SLIDES.filter(s=>s.image!==IMG.offerFestive&&s.image!==IMG.offerDuo).map(s=>`<a href="#product/${s.offer}">${imgTag(s.image,s.label)}<span>${esc(s.label)} ${arrowSvg}</span></a>`).join('')}</div>${contactStrip()}</section>`;
}

let carouselCleanup = () => {};
function setupCarousel() {
  carouselCleanup();
  const root = document.querySelector('.combo-carousel');
  if (!root) return;
  const stage = root.querySelector('.combo-stage');
  const slides = [...root.querySelectorAll('.combo-slide')];
  const dots = [...root.querySelectorAll('[data-slide]')];
  const pause = root.querySelector('[data-carousel-pause]');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const lowMotion = motion.matches || navigator.connection?.saveData || (navigator.deviceMemory && navigator.deviceMemory <= 2);
  let index = 0, paused = lowMotion, hovered = false, focused = false, visible = true, startX = null, fadeTimer, heightFrame;
  const finishTransition = () => {
    clearTimeout(fadeTimer);
    cancelAnimationFrame(heightFrame);
    root.querySelector('.combo-outgoing')?.remove();
    slides.forEach(slide => slide.classList.remove('combo-entering'));
    stage.style.height = '';
    stage.style.transition = '';
  };
  const setPause = () => {
    pause.innerHTML = paused ? playSvg : pauseSvg;
    pause.setAttribute('aria-label', paused ? 'Play slideshow' : 'Pause slideshow');
    pause.setAttribute('aria-pressed', String(paused));
  };
  const show = (next, manual = false) => {
    const nextIndex = (next + slides.length) % slides.length;
    if (nextIndex === index) return;
    // Settle an in-flight fade before starting another. Otherwise a rapid click
    // can leave a stale timeout resetting the height during the next transition.
    finishTransition();
    if (!lowMotion) {
      const currentHeight = stage.getBoundingClientRect().height;
      stage.style.transition = 'height .48s cubic-bezier(.2,.7,.2,1)';
      stage.style.height = `${currentHeight}px`;
      const outgoing = slides[index].cloneNode(true);
      outgoing.classList.add('combo-outgoing');
      outgoing.setAttribute('aria-hidden', 'true');
      outgoing.inert = true;
      stage.appendChild(outgoing);
    }
    index = nextIndex;
    slides.forEach((s,i)=>{s.hidden=i!==index;});
    if (!lowMotion) {
      slides[index].classList.add('combo-entering');
      const lockedHeight = stage.style.height;
      stage.style.height = 'auto';
      const nextHeight = stage.getBoundingClientRect().height;
      stage.style.height = lockedHeight;
      stage.getBoundingClientRect();
      heightFrame = requestAnimationFrame(() => { stage.style.height = `${nextHeight}px`; });
      fadeTimer = setTimeout(finishTransition, 550);
    }
    dots.forEach((d,i)=>d.setAttribute('aria-pressed',String(i===index)));
    if(manual) root.querySelector('[data-slide-status]').textContent=slides[index].getAttribute('aria-label');
  };
  root.addEventListener('click',e=>{
    const dot=e.target.closest('[data-slide]');
    if(dot) show(Number(dot.dataset.slide),true);
    if(e.target.closest('[data-carousel-next]')) show(index+1,true);
    if(e.target.closest('[data-carousel-prev]')) show(index-1,true);
    if(e.target.closest('[data-carousel-pause]')) {paused=!paused;setPause();}
  });
  root.addEventListener('keydown',e=>{
    if(e.target.matches('input,select,textarea'))return;
    if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();show(index+(e.key==='ArrowRight'?1:-1),true);}
  });
  root.addEventListener('mouseenter',()=>{hovered=true;});
  root.addEventListener('mouseleave',()=>{hovered=false;});
  root.addEventListener('focusin',()=>{focused=true;});
  root.addEventListener('focusout',e=>{focused=root.contains(e.relatedTarget);});
  root.addEventListener('touchstart',e=>{startX=e.touches[0].clientX;},{passive:true});
  root.addEventListener('touchend',e=>{if(startX!==null){const dx=e.changedTouches[0].clientX-startX;if(Math.abs(dx)>50)show(index+(dx<0?1:-1),true);startX=null;}},{passive:true});
  const observer = new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;});
  observer.observe(root);
  const reduce = () => { if(motion.matches) {paused=true;setPause();} };
  motion.addEventListener('change', reduce);
  const timer=setInterval(()=>{if(!paused&&!hovered&&!focused&&!document.hidden&&visible)show(index+1);},4000);
  setPause();
  carouselCleanup=()=>{clearInterval(timer);clearTimeout(fadeTimer);cancelAnimationFrame(heightFrame);observer.disconnect();motion.removeEventListener('change',reduce);stage.style.height='';stage.style.transition='';};
}

function uspStrip() {
  const items = [
    ['pin', 'Made in Mumbai', 'Small-batch, handmade'],
    ['clock', 'Long-lasting', 'Stays long after you leave'],
    ['truck', 'Pan-India delivery', 'Ships across India'],
    ['box', 'Limited stock', 'Order on WhatsApp']
  ];
  return `<section class="usp-strip" aria-label="Why Parrfums Vault">
    ${items.map(([ic, t, s]) => `<div class="usp-item">${icon(ic)}<span><strong>${t}</strong><small>${s}</small></span></div>`).join('')}
  </section>`;
}

function offerHero(c) {
  return `<article class="offer-feature">
    <div class="offer-feature-img">${imgTag(c.img, `${c.name} — ${c.badge}`)}<span class="offer-badge">Best value</span></div>
    <div class="offer-feature-copy">
      <p class="eyebrow">The vault offer</p>
      <h2>${esc(c.name)}</h2>
      <p class="offer-per">${esc(c.badge)}</p>
      <p class="offer-notes">${esc(c.notes)}</p>
      <p class="offer-price">${money(c.price)}</p>
      <p class="offer-save">Four full fragrances for less than the price of one premium bottle. Made to be gifted.</p>
      <div class="offer-actions">
        ${Commerce.available(c,0)?`<button class="btn primary" data-add="${c.id}">Add to bag</button>${waLink(`Hi Parrfums Vault! I'd like to order the ${c.name} (${c.badge}) for ${money(c.price)}.`, 'Order on WhatsApp', 'btn ghost wa-btn')}`:availabilityInquiryLink(c,0,'btn wa-btn')}
      </div>
    </div>
  </article>`;
}

function moodChips(active) {
  return `<div class="mood-chips" role="group" aria-label="Filter by mood">
    ${categories.map(c => `<button class="mood-chip ${active === c ? 'active' : ''}" data-category="${c}" aria-pressed="${active === c}">${c}</button>`).join('')}
  </div>`;
}

function contactBand(eyebrow = 'Ready when you are', heading = 'Two taps from your shelf.', sub = 'Every order is confirmed personally on WhatsApp or by phone — usually within a few hours.') {
  return `<section class="band band-ink contact-band">
    <div class="contact-band-head">
      <p class="eyebrow">${esc(eyebrow)}</p>
      <h2>${esc(heading)}</h2>
      <p class="sub">${esc(sub)}</p>
    </div>
    ${contactStrip()}
  </section>`;
}


function shop() {
  const list = Commerce.list(products);
  const empty = list.length === 0;
  return `<section class="page-shell">
    <p class="eyebrow">The full collection</p><h1 class="page-title">Shop fragrance</h1>
    <p class="page-intro">Explore the collection by scent, size and availability.</p>
    ${!catalogueReady?`<p class="shipping-notice" role="status">${catalogueLoading?'Checking current availability…':'Live availability is temporarily unavailable. You can browse the saved catalogue or enquire with the store.'}</p>`:''}${Commerce.filters()}<div class="shop-toolbar">
      ${moodChips(state.category)}
      <select class="select" id="sort" aria-label="Sort products">
        ${[['price-asc','Price: low to high'],['price-desc','Price: high to low'],['newest','Newest'],['popular','Popular']].map(([value,label])=>`<option value="${value}" ${state.sort===value?'selected':''}>${label}</option>`).join('')}
        <option value="featured" ${state.sort === 'featured' ? 'selected' : ''}>Sort: Featured</option>
        <option value="name" ${state.sort === 'name' ? 'selected' : ''}>Name: A–Z</option>
        <option value="name-desc" ${state.sort === 'name-desc' ? 'selected' : ''}>Name: Z–A</option>
        <option value="category" ${state.sort === 'category' ? 'selected' : ''}>Category: A–Z</option>
      </select>
    </div>
    ${empty ? `<div class="empty" role="status"><h2>No fragrances found</h2><p>Try a different search or clear your filters.</p><button class="btn" data-reset>Clear filters</button></div>`
      : `<div class="product-grid">${list.map(card).join('')}</div>`}
    <div class="shop-foot">
      <div><p class="eyebrow">Still deciding?</p><h2>Find your fragrance identity.</h2><p>Three questions, then a small edit chosen from the Parrfums Vault.</p></div>
      <a class="btn primary" href="#finder">Find your scent</a>
    </div>
  </section>`;
}

function collections() {
  const groups = ['Soft', 'Sweet', 'Bold', 'Oud'];
  const cover = { Soft: IMG.angel[0], Sweet: IMG.candy[0], Bold: IMG.leather[0], Oud: IMG.oud[0] };
  const blurb = {
    Soft: 'Skin-close and effortless — the everyday signature.',
    Sweet: 'Sugar, caramel and vanilla. Playful, and impossible to forget.',
    Bold: 'Leather, smoke and vetiver. Composed, not loud.',
    Oud: 'Lavender over oud. Refined enough for the biggest day of the year.'
  };
  return `<section class="page-shell">
    <p class="eyebrow">Curated by feeling</p><h1 class="page-title">Shop by mood</h1>
    <p class="page-intro">Four moods, six fragrances. Start with a feeling — we will point you at the scent.</p>
    <div class="collections-grid">
      ${groups.map(c => {
        const count = products.filter(x => x.category === c).length;
        return `<article class="collection-card"><a href="#shop" data-category="${c}">${imgTag(cover[c], `${c} collection`, 'collection-img')}<div class="collection-copy"><h3>${c}</h3><p>${blurb[c]}</p><span class="collection-count">${count} fragrance${count === 1 ? '' : 's'}</span></div></a></article>`;
      }).join('')}
    </div>
    <div class="shop-foot">
      <div><p class="eyebrow">Gifting?</p><h2>Four fragrances for ₹2,600.</h2><p>The Festive Four — 2 × 100ml with 2 × 30ml on the house.</p></div>
      <a class="btn primary" href="#offers">See the offers</a>
    </div>
  </section>`;
}


function finder() {
  const questions = [
    { label: 'What should your fragrance feel like?', answers: [['Bold and confident', 'Bold'], ['Soft and easy', 'Soft'], ['Sweet and warm', 'Sweet'], ['Exotic and refined', 'Oud']] },
    { label: 'Choose a scene.', answers: [['A late-night dinner', 'Bold'], ['Sunday morning at home', 'Soft'], ['A wedding in December', 'Oud'], ['Coffee with someone new', 'Sweet']] },
    { label: 'Which note keeps calling you back?', answers: [['Leather and smoke', 'Bold'], ['Musk and skin', 'Soft'], ['Vanilla and sugar', 'Sweet'], ['Oud and lavender', 'Oud']] }
  ];
  if (state.finderAnswers.length === questions.length) {
    const counts = state.finderAnswers.reduce((a, x) => (a[x] = (a[x] || 0) + 1, a), {});
    const category = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || 'Soft';
    const matches = products.filter(p => p.category === category);
    const fallback = products.filter(p => p.category !== category);
    const shown = (matches.length ? matches : fallback).slice(0, 3);
    return `<section class="page-shell finder-page">
      <p class="eyebrow">Your considered edit</p><h1 class="page-title">A feeling, bottled.</h1>
      <p class="finder-intro">Your answers point toward <strong>${category.toLowerCase()}</strong> fragrances — a little world of ${category.toLowerCase()} notes chosen for your ritual.</p>
      <div class="product-grid">${shown.map(card).join('')}</div>
      <div class="finder-actions"><button class="btn" data-finder-reset>Start over</button><a class="btn primary" href="#shop">Explore the full collection</a></div>
    </section>`;
  }
  const step = state.finderAnswers.length;
  const question = questions[step];
  return `<section class="page-shell finder-page">
    <p class="eyebrow">The Parrfums Vault scent finder · ${step + 1} of ${questions.length}</p>
    <h1 class="page-title">${esc(question.label)}</h1>
    <div class="finder-options">${question.answers.map(([label, value]) => `<button class="finder-option" data-finder-answer="${value}">${esc(label)}<span aria-hidden="true">→</span></button>`).join('')}</div>
    <a class="text-link" href="#shop">I’d rather browse the collection</a>
  </section>`;
}

function productView(p) {
  if (!p) return notFound();
  const addToBagButton = (item, size) => {
    const availability = Commerce.stock(item, size);
    const cartIndex = state.cart.findIndex(i => i.id === item.id && i.size === size);
    return cartIndex >= 0
      ? addedCartActions(cartIndex, 'added-cart-actions', 'qty product-qty')
      : availability.available
        ? `<button class="btn primary full" type="button" data-add="${esc(item.id)}" data-size="${size}">Add to bag</button>`
        : availabilityInquiryLink(item,size,'btn wa-btn full');
  };
  const mobileBuyBar = (item, size) => {
    const availability=Commerce.stock(item,size), label=availability.available?'Add to bag':availability.label;
    const value=isCombo(item)?item.price:priceFor(item,size);
    const cartIndex = state.cart.findIndex(i => i.id === item.id && i.size === size);
    const action=cartIndex >= 0
      ? `<div class="mobile-added-actions">${cartQuantityControl(cartIndex, 'qty mobile-buybar-qty')}<a class="btn small" href="#cart">Bag</a></div>`
      : availability.available
        ? `<button class="btn primary" type="button" data-add="${esc(item.id)}" data-size="${size}">${icon('bag')}<span>${label}</span></button>`
        : availabilityInquiryLink(item,size,'btn wa-btn');
    return `<aside class="mobile-buybar" aria-label="Quick purchase"><span class="mobile-buybar-price"><strong data-mobile-price>${money(value)}</strong>${size?`<small>${size}ml</small>`:''}</span>${action}</aside>`;
  };
  if (isCombo(p)) {
    const availability=Commerce.stock(p,0);
    return `<section class="page-shell"><div class="detail">
      <div class="detail-image"><div class="gallery-main">${imgTag(p.img, `${p.name} offer`, 'gallery-img')}</div></div>
      <div class="detail-copy">
        <p class="eyebrow">The vault offer</p><h1>${esc(p.name)}</h1><p class="sub">${esc(p.badge)}</p>
        <p class="large-price" id="detail-price">${money(p.price)}</p>
        <p>${esc(p.desc)}</p><p class="offer-notes">${esc(p.notes)}</p>
        ${Commerce.badge(p,0)}${availability.available?addToBagButton(p,0):comboAvailabilityLink(p,'btn wa-btn full')}
        ${availability.available?waLink(`Hi Parrfums Vault! I'd like to order the ${p.name} — ${p.badge} for ${money(p.price)}.`, 'Order on WhatsApp', 'btn ghost full wa-btn'):''}
      </div>
    </div></section>${mobileBuyBar(p,0)}`;
  }
  if(!p.sizes.length)return `<section class="page-shell"><h1 class="page-title">${esc(p.name)}</h1><p>${esc(p.desc)}</p><p role="status">This product has no available sizes yet.</p>${Commerce.share(p)}</section>`;
  const gi = state.galleryIndex[p.id] || 0;
  let selSize = state.selectedSize[p.id];
  if (!p.sizes.includes(selSize) || !Commerce.available(p, selSize)) {
    selSize = Commerce.available(p, DEFAULT_SIZE) ? DEFAULT_SIZE : (p.sizes.find(size => Commerce.available(p, size)) || (p.sizes.includes(DEFAULT_SIZE) ? DEFAULT_SIZE : p.sizes[0]));
  }
  const sizeButtons = p.sizes.map(s => `<button class="variant ${s === selSize ? 'selected' : ''}" data-size="${s}" data-product-variant="${esc(p.id)}" aria-pressed="${s === selSize}">${s}ml · ${money(priceFor(p, s))}</button>`).join('');
  const wished = state.wish.includes(p.id);
  const related = products.filter(x => x.id !== p.id && x.category === p.category).slice(0, 3);
  const relatedFill = related.length ? related : products.filter(x => x.id !== p.id).slice(0, 3);
  return `<section class="page-shell"><div class="detail">
    <div class="detail-image">
      <div class="gallery-main">${imgTag(p.gallery[gi], `${p.name} fragrance`, 'gallery-img')}</div>
      <div class="gallery-thumbs" role="group" aria-label="${esc(p.name)} images">
        ${p.gallery.map((im, i) => `<button class="thumb ${i === gi ? 'active' : ''}" data-gallery="${p.id}" data-idx="${i}" aria-label="Show image ${i + 1} of ${p.gallery.length}" aria-pressed="${i === gi}">${imgTag(im, `${p.name} view ${i + 1}`, 'thumb-img')}</button>`).join('')}
      </div>
      <p class="gallery-note">More shots from @parrfums.vault</p>
    </div>
    <div class="detail-copy">
        <p class="eyebrow">${esc(p.category)} fragrance · ${esc(p.gender)}</p>
        <h1>${esc(p.name)}</h1><p class="concentration-note">Concentration: Eau de Parfum</p><p class="product-accords"><span>Accords</span>${esc(formatAccords(p.notes))}</p>
      <p class="large-price" id="detail-price">${money(priceFor(p, selSize))} <span class="price-size">${selSize}ml</span></p>
      <p>${esc(p.desc)}</p>
      <p class="variant-label">Choose size</p>
      <div class="variant-row" role="group" aria-label="Choose size">${sizeButtons}</div>
        ${Commerce.badge(p,selSize)}${addToBagButton(p, selSize)}
      <button class="btn ghost full spaced-top-small" data-wish="${p.id}">${heartSvg(wished)} ${wished ? 'In wishlist' : 'Add to wishlist'}</button>
      ${waLink(`Hi Parrfums Vault! I'd like to order ${p.name} (${selSize}ml — ${money(priceFor(p, selSize))}).`, 'Order on WhatsApp', 'btn ghost full wa-btn')}
      <p class="sub spaced-top-medium">Pan-India delivery · ${BRAND.city}</p>
    </div></div>
    ${Commerce.facts(p)}${Commerce.share(p)}${Commerce.reviews(p)}${Commerce.recommendations(p)}
  </section>${mobileBuyBar(p,selSize)}`;
}

function notFound() {
  return `<section class="page-shell not-found-page"><div class="not-found-card"><span class="not-found-mark" aria-hidden="true">${icon('sparkle')}</span><p class="eyebrow">A little off the scent trail</p><h1 class="page-title">This page isn’t here.</h1><p class="page-intro">The link may be old, or the page may have moved. Let’s get you back to the collection.</p><div class="not-found-actions"><a class="btn primary" href="#shop">Explore the collection ${arrowSvg}</a><a class="text-link" href="#home">Return home</a></div></div></section>`;
}

function cartSummary(total) {
  return `<aside class="summary"><h2>Summary</h2>
    <div class="sum-line"><span>Subtotal</span><span>${money(total)}</span></div>
    <div class="sum-line"><span>Shipping</span><span>₹100–₹120</span></div>
    <p class="sub">Shipping is calculated from your delivery address.</p>
    <div class="sum-line total"><span>Total before address</span><span>${money(total)} + shipping</span></div>
    ${authUser ? '<a class="btn primary full" href="#checkout">Continue to checkout</a>' : '<button class="btn primary full" type="button" data-auth-sign-in>Sign in to checkout</button>'}
    ${waLink(orderMessage(total), 'Send this order on WhatsApp', 'btn ghost full wa-btn')}
  </aside>`;
}

function orderMessage(total, ship = null) {
  return `Hi Parrfums Vault! I'd like to order:\n${state.cart.map(i => `• ${i.name} (${i.combo ? i.badge : i.size + 'ml'}) × ${i.qty} — ${money(i.price * i.qty)}`).join('\n')}\nSubtotal: ${money(total)}\n${ship === null ? 'Shipping extra: Mumbai ₹100 / outside Mumbai ₹120.' : `Shipping: ${money(ship)}\nTotal: ${money(total + ship)}`}\nPlease confirm availability${state.cart.some(i=>i.combo) ? ' and my fragrance choices' : ''}.`;
}

function normalizeCart() {
  state.cart = state.cart.flatMap(item => {
    const p = get(item?.id);
    if (!p || !Number.isInteger(item.qty) || item.qty < 1 || (!isCombo(p) && !p.sizes.includes(item.size))) return [];
    return [{ ...item, name:p.name, notes:p.notes, img:p.img, combo:isCombo(p), badge:p.badge || '', qty:Math.min(20,item.qty), price:priceFor(p,item.size) }];
  });
}

function cart() {
  if (!state.cart.length) return `<section class="page-shell"><p class="eyebrow">Your ritual, gathered</p><h1 class="page-title">Your bag</h1>
    <div class="empty" role="status"><h2>Your bag is waiting.</h2><p>Discover something new for your shelf.</p><a class="btn" href="#shop">Shop fragrance</a></div></section>`;
  const total = state.cart.reduce((n, i) => n + i.price * i.qty, 0);
  return `<section class="page-shell">
    <p class="eyebrow">Your ritual, gathered</p><h1 class="page-title">Your bag</h1>
    <div class="shipping-notice">${icon('truck')} Shipping extra on every order · Mumbai ₹100 · Outside Mumbai ₹120</div>
    <div class="cart-layout">
      <div>${state.cart.map((i, n) => `<div class="cart-item">
        ${imgTag(i.img, i.name)}
        <div><h3>${esc(i.name)}</h3><p>${i.combo ? esc(i.badge) : `${i.size}ml · ${esc(i.notes)}`}</p>${Commerce.badge(get(i.id),i.size)}
          ${cartQuantityControl(n)}
        </div>
        <div><strong>${money(i.price * i.qty)}</strong><br><button class="remove" data-remove="${n}" aria-label="Remove ${esc(i.name)} from bag">Remove</button></div>
      </div>`).join('')}</div>
      ${cartSummary(total)}
    </div>
  </section>`;
}

function wishlist() {
  if (!state.wish.length) return `<section class="page-shell"><p class="eyebrow">Saved for later</p><h1 class="page-title">Wishlist</h1>
    <div class="empty" role="status"><h2>Nothing saved yet.</h2><p>Tap the heart on any fragrance to keep it here.</p><a class="btn" href="#shop">Shop fragrance</a></div></section>`;
  const items = state.wish.map(id => get(id)).filter(Boolean);
  return `<section class="page-shell"><p class="eyebrow">Saved for later</p><h1 class="page-title">Wishlist</h1>
    <div class="product-grid">${items.map(p => `<article class="product-card">
      <div class="product-image"><a href="#product/${p.id}" aria-label="View ${esc(p.name)}">${imgTag(p.img, `${esc(p.name)} fragrance`)}</a>
        <button class="heart active" data-wish="${p.id}" aria-label="Remove ${esc(p.name)} from wishlist" aria-pressed="true">${heartSvg(true)}</button></div>
      <div class="product-meta"><a href="#product/${p.id}"><h3>${esc(p.name)}</h3><p>${esc(p.notes)}</p>${priceBlock(p)}</a>
    ${Commerce.badge(p,defaultSize(p))}${Commerce.available(p,defaultSize(p))?`<button class="btn small spaced-top-small" data-add="${p.id}" data-move-wishlist>Move to bag</button>`:availabilityInquiryLink(p,defaultSize(p),'btn wa-btn small')}</div>
    </article>`).join('')}</div></section>`;
}

function account() {
  if (!supabaseClient) return `<section class="page-shell"><p class="eyebrow">Your account</p><h1 class="page-title">Accounts unavailable</h1><p class="sub">The sign-in client did not load. Please try again later.</p></section>`;
  if (!authReady) return `<section class="page-shell"><p class="eyebrow">Your account</p><h1 class="page-title">Checking your account…</h1></section>`;
  if (!authUser) return `<section class="page-shell"><p class="eyebrow">Your account</p><h1 class="page-title">Your account, your vault.</h1>
    <p class="sub">Sign in to sync your wishlist, save delivery addresses, and track orders you place while signed in.</p>
    ${authNotice ? `<p class="error" role="alert">${esc(authNotice)}</p>` : ''}
    <button class="btn primary" type="button" data-auth-sign-in>Continue with Google</button>
    <p class="sub spaced-top-medium">We store account details and order requests securely. Payments are marked paid only after secure provider verification. Online payment availability depends on the store configuration. <a href="#privacy">Read account data information</a>.</p>
  </section>`;

  const profileName = accountProfile?.full_name || authUser.user_metadata?.full_name || authUser.user_metadata?.name || '';
  const profilePhone = accountProfile?.phone || '';
  const addressCards = savedAddresses.length ? savedAddresses.map(a => `<article class="offer-card account-address-card">
    <strong>${esc(a.label)}${a.is_default ? ' · Default' : ''}</strong><p>${esc(a.recipient_name)} · ${esc(a.phone)}</p>
    <p>${esc(a.address_line1)}${a.address_line2 ? `, ${esc(a.address_line2)}` : ''}, ${esc(a.city)}, ${esc(a.state)} ${esc(a.postal_code)}</p>
    <div class="offer-actions">${a.is_default ? '' : `<button class="btn small" type="button" data-address-default="${esc(a.id)}">Make default</button>`}
      <button class="btn small" type="button" data-address-delete="${esc(a.id)}">Remove</button></div>
  </article>`).join('') : '<p class="sub">No saved addresses yet. Add one below.</p>';
  const ordersContent = Commerce.orderHistory(accountOrders);

  let checkoutReturn = false;
  try { checkoutReturn = sessionStorage.getItem('pv-checkout-return') === 'yes'; } catch {}
  return `<section class="page-shell account-page">
    <div class="section-head"><div><p class="eyebrow">Signed in as ${esc(authUser.email || 'Google account')}</p><h1 class="page-title">Your account</h1><a class="text-link" href="#admin">Administration</a></div></div>
    ${accountLoading ? '<p class="sub" role="status">Loading your account data…</p>' : ''}
    ${authNotice ? `<p class="error" role="alert">${esc(authNotice)}</p>` : ''}
    <nav class="account-tabs" aria-label="Account sections">
      <button type="button" class="btn ${accountTab === 'addresses' ? 'primary' : 'ghost'}" data-account-tab="addresses" aria-pressed="${accountTab === 'addresses'}">Delivery addresses</button>
      <button type="button" class="btn ${accountTab === 'orders' ? 'primary' : 'ghost'}" data-account-tab="orders" aria-pressed="${accountTab === 'orders'}">Order history</button>
    </nav>
    ${accountTab === 'addresses' ? `<section class="account-section account-tab-panel" aria-label="Delivery addresses">
      ${checkoutReturn ? '<p class="shipping-notice">Add or choose a delivery address, then continue to checkout.</p>' : ''}
      <h2>Profile</h2><form id="account-profile-form" class="form-grid">
        <div class="field"><label for="account-name">Full name</label><input id="account-name" name="full_name" maxlength="120" required value="${esc(profileName)}"></div>
        <div class="field"><label for="account-phone">Mobile number</label><input id="account-phone" name="phone" type="tel" inputmode="numeric" maxlength="10" required value="${esc(profilePhone)}"></div>
        <button class="btn primary" type="submit">Save profile</button>
      </form>
      <h2>Saved delivery addresses</h2>${addressCards}
      <form id="account-address-form" class="form-grid">
        <div class="field"><label for="address-label">Label</label><input id="address-label" name="label" maxlength="40" value="Home" required></div>
        <div class="field"><label for="address-recipient">Recipient name</label><input id="address-recipient" name="recipient_name" maxlength="120" required></div>
        <div class="field"><label for="address-phone">Mobile number</label><input id="address-phone" name="phone" type="tel" inputmode="numeric" maxlength="10" required value="${esc(profilePhone)}"></div>
        <div class="field full-field location-tools"><button class="btn ghost small" type="button" data-use-location="account">Use my location to fill address</button><span class="sub" data-location-status role="status">Only used after you allow location access.</span></div>
        <div class="field full-field"><label for="address-line1">Address</label><input id="address-line1" name="address_line1" maxlength="200" autocomplete="street-address" required></div>
        <div class="field full-field"><label for="address-line2">Apartment / area (optional)</label><input id="address-line2" name="address_line2" maxlength="200"></div>
        <div class="field"><label for="address-city">City</label><input id="address-city" name="city" maxlength="80" required></div>
        <div class="field"><label for="address-state">State</label><input id="address-state" name="state" maxlength="80" required></div>
        <div class="field"><label for="address-postal">PIN code</label><input id="address-postal" name="postal_code" inputmode="numeric" maxlength="6" required></div>
        <label class="field full-field check-row"><span><input type="checkbox" name="is_default"> Make this my default address</span></label>
        <button class="btn primary" type="submit">Save address</button>
      </form>
      ${checkoutReturn ? '<a class="btn ghost spaced-top-medium" href="#checkout">Continue to checkout</a>' : ''}
    </section>` : `<section class="account-section account-tab-panel" aria-label="Order history"><h2>Order history</h2>${ordersContent}</section>`}
    <div class="account-footer-actions"><p class="sub">Saved addresses and order details are visible only to your account. <a href="#privacy">Privacy information</a>.</p>${checkoutReturn ? '<a class="btn ghost" href="#checkout">Continue to checkout</a>' : ''}<button class="btn ghost account-signout" type="button" data-auth-sign-out>Sign out</button></div>
  </section>`;
}

function privacyNotice() {
  return `<section class="page-shell"><p class="eyebrow">Your information</p><h1 class="page-title">Privacy &amp; account data</h1>
    <p>This storefront uses Google sign-in through Supabase. If you create an account, Supabase stores your account identity. Details you choose to save include your name, phone number, wishlist, and delivery addresses. When you submit an order request while signed in, the store saves its items, server-calculated prices, delivery details, and pending/unpaid status so you can see its history.</p>
    <p>This storefront does not collect your Google password or payment-card details and does not process payments. If you choose WhatsApp ordering, you send that message to WhatsApp yourself. The Supabase project is hosted in Mumbai, India.</p>
    <p>To ask the store to correct or remove your account information, contact Parrfums Vault at <a href="tel:+918591935352">+91 85919 35352</a> or <a href="https://wa.me/918591935352" target="_blank" rel="noreferrer">WhatsApp</a>. Account deletion currently requires store-admin assistance.</p>
    <p class="sub">Owner review required before production: confirm this notice, data-retention period, and contact process with the client. This plain-language draft is not legal advice.</p>
    <a class="btn ghost" href="#account">Back to account</a>
  </section>`;
}

async function refreshAccountData(user) {
  if (!supabaseClient || !user) return;
  accountLoading = true;
  try {
    const [profileResult, addressResult, wishlistResult, ordersResult] = await Promise.all([
      supabaseClient.from('customer_profiles').select('full_name,phone').eq('user_id', user.id).maybeSingle(),
      supabaseClient.from('customer_addresses').select('id,label,recipient_name,phone,address_line1,address_line2,city,state,postal_code,is_default,created_at').eq('user_id', user.id).order('is_default', { ascending: false }).order('created_at', { ascending: false }),
      supabaseClient.from('wishlist_items').select('product_id').eq('user_id', user.id),
      supabaseClient.from('customer_orders').select('id,order_number,recipient_name,total_inr,status,payment_status,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(25)
    ]);
    if (authUser?.id !== user.id) return;
    if (profileResult.error || addressResult.error || wishlistResult.error || ordersResult.error) throw new Error('Account data request failed');
    accountProfile = profileResult.data;
    savedAddresses = addressResult.data || [];
    const remoteWish = (wishlistResult.data || []).map(row => row.product_id);
    const guestWish = guestWishlist.filter(id => products.some(p => p.id === id));
    const combinedWish = [...new Set([...remoteWish, ...guestWish])];
    const addWish = combinedWish.filter(id => !remoteWish.includes(id));
    if (addWish.length) {
      const { error } = await supabaseClient.from('wishlist_items').insert(addWish.map(product_id => ({ user_id: user.id, product_id })));
      if (error && error.code !== '23505') throw new Error('Wishlist sync failed');
    }
    // Guest wishlist is imported once, never replayed after a signed-in removal.
    guestWishlist = [];
    state.wish = combinedWish;
    const orders = ordersResult.data || [];
    if (orders.length) {
      const { data: lines, error } = await supabaseClient.from('customer_order_items')
        .select('order_id,product_id,offer_id,item_name,size_ml,quantity,line_total_inr').in('order_id', orders.map(o => o.id));
      if (error) throw new Error('Order history request failed');
      const byOrder = new Map();
      for (const line of lines || []) byOrder.set(line.order_id, [...(byOrder.get(line.order_id) || []), line]);
      accountOrders = orders.map(order => ({ ...order, customer_order_items: byOrder.get(order.id) || [] }));
    } else accountOrders = [];
    authNotice = '';
  } catch {
    authNotice = 'We could not load your account data. Please try again.';
  } finally {
    if (authUser?.id === user.id) {
      accountLoading = false;
      updateCounts();
      if (currentPath === 'account') render('account', { keepScroll: true });
      else if (currentPath === 'checkout') render('checkout', { keepScroll: true });
      else if (currentPath === 'wishlist') render('wishlist', { keepScroll: true });
    }
  }
}

async function startGoogleSignIn(returnTo = '#account') {
  if (!supabaseClient) return;
  authNotice = '';
  const adminLogin = location.pathname.replace(/\/+$/, '') === '/admin';
  try {
    sessionStorage.setItem('pv-auth-return', adminLogin ? '/admin' : returnTo);
    if (currentPath === 'checkout' || returnTo === '#checkout') sessionStorage.setItem('pv-checkout-return', 'yes');
  } catch {}
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${location.origin}${adminLogin ? '/admin' : location.pathname}`, queryParams: { prompt: 'select_account' } }
  });
  if (error) {
    try { sessionStorage.removeItem('pv-auth-return'); } catch {}
    authNotice = 'Google sign-in is not configured yet. Ask the store administrator to finish the Google OAuth setup.';
    render('account', { keepScroll: true });
  }
}

async function signOutAccount() {
  if (!supabaseClient) return;
  const { error } = await supabaseClient.auth.signOut();
  if (error) { authNotice = 'Could not sign out. Please try again.'; render('account', { keepScroll: true }); }
}

async function saveProfile(form) {
  if (!authUser) return;
  const data = new FormData(form);
  const full_name = String(data.get('full_name') || '').trim();
  const phone = String(data.get('phone') || '').trim();
  if (!full_name || !/^[6-9]\d{9}$/.test(phone)) {
    authNotice = 'Enter your name and a valid 10-digit Indian mobile number.';
    render('account', { keepScroll: true });
    return;
  }
  const { error } = await supabaseClient.from('customer_profiles').upsert({ user_id: authUser.id, full_name, phone, updated_at: new Date().toISOString() });
  authNotice = error ? 'Profile could not be saved. Please check your details and try again.' : 'Profile saved.';
  if (!error) { await refreshAccountData(authUser); authNotice = 'Profile saved.'; render('account', { keepScroll: true }); }
  else render('account', { keepScroll: true });
}

async function saveAddress(form) {
  if (!authUser) return;
  const data = new FormData(form);
  const address = Object.fromEntries(['label','recipient_name','phone','address_line1','address_line2','city','state','postal_code'].map(k => [k, String(data.get(k) || '').trim()]));
  address.user_id = authUser.id;
  address.is_default = data.get('is_default') === 'on' || savedAddresses.length === 0;
  if (!/^[6-9]\d{9}$/.test(address.phone) || !/^\d{6}$/.test(address.postal_code)) {
    authNotice = 'Enter a valid 10-digit mobile number and 6-digit PIN code.';
    render('account', { keepScroll: true });
    return;
  }
  if (address.is_default) {
    const { error: clearError } = await supabaseClient.from('customer_addresses').update({ is_default: false }).eq('user_id', authUser.id).eq('is_default', true);
    if (clearError) { authNotice = 'Address could not be saved. Please try again.'; render('account', { keepScroll: true }); return; }
  }
  const { error } = await supabaseClient.from('customer_addresses').insert(address);
  authNotice = error ? 'Address could not be saved. Please check the fields and try again.' : 'Address saved.';
  if (!error) {
    await refreshAccountData(authUser);
    let checkoutReturn = false;
    try { checkoutReturn = sessionStorage.getItem('pv-checkout-return') === 'yes'; } catch {}
    if (checkoutReturn) location.hash = '#checkout';
    else { authNotice = 'Address saved.'; render('account', { keepScroll: true }); }
  }
  else render('account', { keepScroll: true });
}

async function fillAddressFromLocation(button) {
  const status = button.closest('.location-tools')?.querySelector('[data-location-status]');
  const form = button.closest('form');
  const say = text => { if (status) status.textContent = text; };
  if (!navigator.geolocation) { say('Location is not available in this browser.'); return; }
  button.disabled = true;
  say('Waiting for your permission…');
  navigator.geolocation.getCurrentPosition(async position => {
    try {
      say('Finding your address…');
      const { latitude, longitude } = position.coords;
      const url = new URL('https://nominatim.openstreetmap.org/reverse');
      url.search = new URLSearchParams({ format: 'jsonv2', addressdetails: '1', lat: String(latitude), lon: String(longitude) });
      const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw Error('REVERSE_GEOCODE_FAILED');
      const data = await response.json(), a = data.address || {};
      const city = a.city || a.town || a.village || a.municipality || a.suburb || '';
      const road = [a.house_number, a.road].filter(Boolean).join(' ');
      const area = a.neighbourhood || a.suburb || a.residential || '';
      const values = {
        address: road,
        address_line1: road,
        address2: area,
        address_line2: area,
        city,
        state: a.state || '',
        pin: a.postcode || '',
        postal_code: a.postcode || '',
      };
      for (const [name, value] of Object.entries(values)) {
        const field = form?.elements[name];
        if (field && value) field.value = value;
      }
      say(road || city ? 'Address filled from your location. Check it before continuing.' : 'We could not find a street address here; please enter it manually.');
    } catch {
      say('We could not look up this location. Please enter your address manually.');
    } finally { button.disabled = false; }
  }, error => {
    say(error.code === 1 ? 'Location permission was not granted. You can enter the address manually.' : 'Location unavailable. Please enter the address manually.');
    button.disabled = false;
  }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 });
}

async function setDefaultAddress(id) {
  if (!authUser) return;
  const { error: clearError } = await supabaseClient.from('customer_addresses').update({ is_default: false }).eq('user_id', authUser.id).eq('is_default', true);
  let failed = Boolean(clearError);
  if (!clearError) {
    const { error } = await supabaseClient.from('customer_addresses').update({ is_default: true }).eq('id', id).eq('user_id', authUser.id);
    failed = Boolean(error);
  }
  await refreshAccountData(authUser);
  authNotice = failed ? 'Default address could not be changed.' : '';
  render('account', { keepScroll: true });
}

async function deleteAddress(id) {
  if (!authUser) return;
  const { error } = await supabaseClient.from('customer_addresses').delete().eq('id', id).eq('user_id', authUser.id);
  await refreshAccountData(authUser);
  authNotice = error ? 'Address could not be removed.' : '';
  render('account', { keepScroll: true });
}

async function persistWishlistItem(id, shouldSave) {
  if (!authUser || !supabaseClient) return;
  const ownerId = authUser.id;
  const result = shouldSave
    ? await supabaseClient.from('wishlist_items').insert({ user_id: ownerId, product_id: id })
    : await supabaseClient.from('wishlist_items').delete().eq('user_id', ownerId).eq('product_id', id);
  if (authUser?.id !== ownerId) return;
  if (result.error && !(shouldSave && result.error.code === '23505')) {
    state.wish = shouldSave ? state.wish.filter(item => item !== id) : [...state.wish, id];
    authNotice = 'Wishlist update failed. Please try again.';
    render(currentPath || 'wishlist', { keepScroll: true });
  }
}

function initializeAuth() {
  if (!supabaseClient) { authReady = true; authNotice = 'Account sign-in is unavailable right now.'; return; }
  supabaseClient.auth.onAuthStateChange((event, session) => {
    const previousId = authUser?.id || null;
    authUser = session?.user || null;
    setTimeout(async () => {
      await Commerce.onAuth(authUser);
      if (!Commerce.cache.admin && window.PVEdit?.isOn()) window.PVEdit.toggle(false);
    }, 0);
    authReady = true;
    if (previousId !== (authUser?.id || null)) {
      accountProfile = null; savedAddresses = []; accountOrders = []; authNotice = '';
      const protectedPath = currentPath;
      if (protectedPath === 'checkout' || protectedPath === 'tracking' || protectedPath === 'admin' || protectedPath.startsWith('orders/')) {
        setTimeout(() => {
          if (currentPath === protectedPath) render(protectedPath, { keepScroll: true });
        }, 0);
      }
    }
    if (!authUser) {
      state.wish = [...guestWishlist];
      save();
    }
    if (authUser) {
      let returnTo = '';
      try { returnTo = sessionStorage.getItem('pv-auth-return') || ''; sessionStorage.removeItem('pv-auth-return'); } catch {}
      if (returnTo === '/admin') {
        history.replaceState(history.state, '', '/admin');
        setTimeout(() => render('admin', { keepScroll: true }), 0);
      }
      if (returnTo.startsWith('#') && location.hash !== returnTo) location.hash = returnTo;
    }
    if (currentPath === 'account') render('account', { keepScroll: true });
    if (authUser && (previousId !== authUser.id || event === 'INITIAL_SESSION')) {
      setTimeout(() => { if(authUser)void refreshAccountData(authUser); }, 0);
    }
  });
}


function offers() { return comboPage(); }

function about() {
  const edit = [
    ['editorial-evening', 'For a lasting impression.'],
    ['editorial-lasting', 'Stays longer than you think.'],
    ['editorial-gifting', 'A little more to give.'],
    ['editorial-discover', 'Find your next favourite.'],
    ['editorial-essentials', 'Your everyday essentials.'],
    ['editorial-story', 'Tell a better story.'],
    ['editorial-ritual', 'Make it your ritual.']
  ];
  return `<section class="page-shell"><div class="section-head"><div><p class="eyebrow">Handmade in Mumbai</p><h1 class="page-title">A little bottle.<br>A lasting <em>impression.</em></h1></div></div><div class="story-copy"><p class="page-intro">Parrfums Vault is a fragrance house, handmade in Mumbai. We believe a scent can be personal, expressive and part of the everyday—not something saved only for a special occasion.</p><p>Our collection brings together six distinct fragrances, each with its own character and accords. We make in small batches and keep the experience simple: choose a scent that feels like you, find your size, and make it part of your daily ritual.</p><p>Fragrance is also one of the most personal gifts we can give. Whether you are choosing something for yourself or someone you love, we are here to help you find a scent worth remembering.</p><p>Thoughtfully crafted in Mumbai. Worn wherever your story takes you.</p></div><div class="campaign-grid story-grid">${edit.map(([slug,label])=>`<a href="#shop">${imgTag(media(slug),label)}<span>${esc(label)} ${arrowSvg}</span></a>`).join('')}</div>${contactStrip()}</section>`;
}

/* ---------- router ---------- */

let currentPath = null;

function setActiveNav(path) {
  const map = { shop: '#shop', combos: '#combos', collections: '#collections', finder: '#finder', about: '#about', offers: '#combos', account: '#account' };
  const active = path.startsWith('product/') ? '#shop' : (map[path] || (path === 'home' ? '#home' : ''));
  document.querySelectorAll('.main-nav a').forEach(a => {
    const href = a.getAttribute('href');
    if (active && href === active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

const ROUTES = new Set(['landing', 'home', 'shop', 'combos', 'collections', 'finder', 'about', 'offers', 'cart', 'checkout', 'checkout-review', 'wishlist', 'account', 'privacy', 'terms', 'shipping', 'returns', 'cancellation', 'contact', 'faq', 'tracking', 'admin']);

function render(route, opts = {}) {
  normalizeCart();
  const path = route || (location.hash.slice(1) || location.pathname.replace(/^\/+|\/+$/g, '') || 'landing');

  /* An in-page anchor (e.g. #the-vault) is not a route. Scroll to it and keep
     the current view instead of rendering a 404. */
  if (!ROUTES.has(path) && !path.startsWith('product/') && !path.startsWith('orders/')) {
    const anchor = document.getElementById(path);
    if (anchor) {
      anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
  }

  const routeChanged = path !== currentPath;
  const keepScroll = opts.keepScroll === true || (!routeChanged && !opts.forceTop);
  const prevY = window.scrollY;
  const isLanding = path === 'landing';

  document.body.classList.toggle('is-landing', isLanding);
  document.body.classList.toggle('is-admin', path === 'admin');

  let view;
  if (isLanding) view = landing();
  else if (path === 'home') view = home();
  else if (path === 'shop') view = shop();
  else if (path === 'combos') view = comboPage();
  else if (path === 'collections') view = collections();
  else if (path === 'finder') view = finder();
  else if (path === 'about') view = about();
  else if (path === 'offers') view = offers();
  else if (path === 'cart') view = cart();
  else if (path === 'checkout') view = Commerce.checkout();
  else if (path === 'checkout-review') view = Commerce.checkoutReview();
  else if (path === 'wishlist') view = wishlist();
  else if (path === 'account') view = account();
  else if (['privacy','terms','shipping','returns','cancellation','contact','faq'].includes(path)) view = Commerce.policy(path);
  else if(path==='tracking') view=Commerce.trackingPage();
  else if(path.startsWith('orders/')) view=Commerce.orderPage(path.split('/')[1]);
  else if(path==='admin') view=Commerce.admin();
  else if (path.startsWith('product/')) view = productView(get(path.split('/')[1]));
  else if (path === '404' || path === '') view = path === '' ? home() : notFound();
  else view = notFound();

  app.innerHTML = path === 'admin'
    ? `<div class="admin-console"><header class="admin-console-header"><a class="admin-console-brand" href="/" aria-label="Parrfums Vault storefront"><img src="assets/parrfums-vault-logo.png" width="42" height="42" alt=""><span>Parrfums <i>Vault</i></span></a><p class="admin-console-label">Secure administration</p><div class="admin-console-actions"><button class="icon-btn" type="button" data-theme-toggle aria-label="Switch theme"></button>${authUser ? '<button class="btn small" type="button" data-admin-menu>Menu</button><button class="btn small" type="button" data-auth-sign-out>Sign out</button>' : '<a class="btn small" href="/">Storefront</a>'}</div></header>${view}<div class="admin-console-footer">Private administrator workspace · Access is verified by Supabase for protected operations.</div></div>`
    : view;
  document.body.classList.toggle('is-product', path.startsWith('product/'));
  if (routeChanged && currentPath && !matchMedia('(prefers-reduced-motion: reduce)').matches && typeof app.animate === 'function') {
    app.animate([{ opacity: 0.94, transform: 'translateY(4px)' }, { opacity: 1, transform: 'translateY(0)' }], {
      duration: matchMedia('(max-width: 760px)').matches ? 170 : 200,
      easing: 'cubic-bezier(.2,.7,.2,1)',
    });
    window.PVLoader?.show('A little moment…');
    setTimeout(() => window.PVLoader?.hide(), 360);
  }
  if(routeChanged && path.startsWith('product/')){const p=get(path.split('/')[1]);if(p)Commerce.remember(p.id);}
  window.PVEdit?.afterRender();
  Commerce.seo?.(path);
  currentPath = path;
  updateCounts();
  setActiveNav(path);
  window.PVTheme?.sync();
  setupCarousel();

  if (keepScroll) {
    window.scrollTo({ top: prevY, behavior: 'instant' });
  } else {
    window.scrollTo({ top: 0, behavior: 'instant' });
    const h1 = app.querySelector('h1');
    if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
  }
  const h1 = app.querySelector('h1');
  const h2 = app.querySelector('h2');
  announce((h1 || h2) ? (h1 || h2).textContent.trim() : path);
}

/* ---------- events ---------- */

function flashAdded(btn) {
  if (!btn) return;
  btn.classList.add('added');
  const label = btn.querySelector('span');
  const original = label ? label.textContent : null;
  if (label) label.innerHTML = icon('check');
  setTimeout(() => {
    btn.classList.remove('added');
    if (label && original !== null) label.textContent = original;
  }, 1500);
}

document.addEventListener('click', e => {
  const useLocation = e.target.closest('[data-use-location]');
  if (useLocation) { fillAddressFromLocation(useLocation); return; }
  const signIn = e.target.closest('[data-auth-sign-in]');
  if (signIn) { void startGoogleSignIn(signIn.dataset.returnTo || '#account'); return; }
  if (e.target.closest('[data-auth-sign-out]')) {
    if (e.target.closest('#edit-toolbar') && window.PVEdit?.collect().length &&
      !window.confirm('You have unpublished website edits. Sign out without publishing them?')) return;
    if (!e.target.closest('#edit-toolbar') && !window.confirm('Sign out of your Parrfums Vault account?')) return;
    void signOutAccount();
    return;
  }
  const accountTabButton = e.target.closest('[data-account-tab]');
  if (accountTabButton) { accountTab = accountTabButton.dataset.accountTab; render('account', { keepScroll: true }); return; }
  const addressDefault = e.target.closest('[data-address-default]');
  if (addressDefault) { void setDefaultAddress(addressDefault.dataset.addressDefault); return; }
  const addressDelete = e.target.closest('[data-address-delete]');
  if (addressDelete) { void deleteAddress(addressDelete.dataset.addressDelete); return; }

  const scrollTo = e.target.closest('[data-scroll-to]');
  if (scrollTo) {
    const target = document.getElementById(scrollTo.dataset.scrollTo);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  const wish = e.target.closest('[data-wish]');
  if (wish) {
    const id = wish.dataset.wish;
    state.wish = state.wish.includes(id) ? state.wish.filter(x => x !== id) : [...state.wish, id];
    save();
    if (authUser) void persistWishlistItem(id, state.wish.includes(id));
    else guestWishlist = [...state.wish];
    render(null, { keepScroll: true });
    toast(state.wish.includes(id) ? 'Added to wishlist' : 'Removed from wishlist');
    return;
  }

  const cat = e.target.closest('[data-category]');
  if (cat) {
    e.preventDefault();
    state.category = cat.dataset.category;
    if (location.hash !== '#shop') { location.hash = '#shop'; return; }
    render('shop', { keepScroll: true });
    return;
  }

  const add = e.target.closest('[data-add]');
  if (add) {
    const p = get(add.dataset.add);
    if (!p) return;
    let price, size = 0, badge = '';
    if (isCombo(p)) {
      price = p.price; badge = p.badge;
    } else {
      const detailRoot = add.closest('.detail');
      const sel = detailRoot && detailRoot.querySelector('.variant.selected');
      size = Number((sel && sel.dataset.size) || add.dataset.size || state.selectedSize[p.id] || defaultSize(p));
      price = priceFor(p, size);
    }
    if(!Commerce.available(p,size)){toast('This item is currently unavailable. Please contact the store.');return;}
    const existing = state.cart.find(i => i.id === p.id && i.size === size);
    const availability=Commerce.stock(p,size);
    if(!availability.unlimited&&(existing?.qty||0)+1>availability.quantity){toast('The available quantity is already in your bag');return;}
    Commerce.analytics('add_to_cart',{product_id:p.id,size_ml:size,quantity:1});
    if (existing && existing.qty >= 20) { toast('You can order up to 20 of each item'); return; }
    if (existing) existing.qty++;
    else state.cart.push({ id: p.id, name: p.name, notes: p.notes, img: p.img, size, price, qty: 1, combo: isCombo(p), badge });
    save();
    if(add.hasAttribute('data-move-wishlist')){state.wish=state.wish.filter(id=>id!==p.id);save();if(authUser)void supabaseClient.from('wishlist_items').delete().eq('user_id',authUser.id).eq('product_id',p.id).then(({error})=>{if(error){state.wish.push(p.id);save();toast('Added to bag, but wishlist removal could not sync');}});render('wishlist',{keepScroll:true});}
     render(null, { keepScroll: true });
     toast(`${p.name} added to your bag.`, { href: '#cart', label: 'Go to bag' });
    return;
  }

  const qty = e.target.closest('[data-qty]');
  if (qty) {
    const i = state.cart[Number(qty.dataset.qty)];
    if (!i) return;
    const next=i.qty+Number(qty.dataset.delta);
    const availability=Commerce.stock(get(i.id),i.size);
    if(Number(qty.dataset.delta)>0&&!availability.unlimited&&next>availability.quantity){toast('That quantity is unavailable');return;}
    i.qty = Math.min(20, next);
    if (i.qty < 1) state.cart.splice(Number(qty.dataset.qty), 1);
    save();
    render(null, { keepScroll: true });
    return;
  }

  const rem = e.target.closest('[data-remove]');
  if (rem) {
    Commerce.analytics('remove_from_cart',{product_id:state.cart[Number(rem.dataset.remove)]?.id});
    state.cart.splice(Number(rem.dataset.remove), 1);
    save();
    render(null, { keepScroll: true });
    toast('Removed from your bag');
    return;
  }

  const gal = e.target.closest('[data-gallery]');
  if (gal) {
    state.galleryIndex[gal.dataset.gallery] = Number(gal.dataset.idx);
    render('product/' + gal.dataset.gallery, { keepScroll: true });
    return;
  }

  const reset = e.target.closest('[data-reset]');
  if (reset) {
    state.category = 'All'; state.filters={}; state.query = '';
    const si = document.querySelector('#search-input'); if (si) si.value = '';
    render('shop', { keepScroll: true });
    return;
  }

  const finderAnswer = e.target.closest('[data-finder-answer]');
  if (finderAnswer) {
    state.finderAnswers.push(finderAnswer.dataset.finderAnswer);
    render('finder', { keepScroll: true });
    return;
  }

  const finderReset = e.target.closest('[data-finder-reset]');
  if (finderReset) {
    state.finderAnswers = [];
    render('finder', { keepScroll: true });
    return;
  }

  const variant = e.target.closest('.variant');
  if (variant) {
    const p=get(variant.dataset.productVariant);
    const size = Number(variant.dataset.size);
    if(p){state.selectedSize[p.id]=size;render(`product/${p.id}`,{keepScroll:true});}
    return;
  }

  const openSearch = e.target.closest('[data-open-search]');
  if (openSearch) { openDrawer(openSearch); return; }

  const closeSearch = e.target.closest('.close-search');
  if (closeSearch) { closeDrawer(); return; }

  if (e.target.closest('.site-header a')) {
    document.querySelector('.main-nav')?.classList.remove('open');
    document.querySelector('.menu-toggle')?.setAttribute('aria-expanded', 'false');
    document.querySelector('.menu-toggle')?.setAttribute('aria-label', 'Open menu');
  }
});

document.addEventListener('change', e => {
  if (e.target.id === 'order-consent') {
    const button = document.querySelector('#checkout-form [type="submit"]');
    if (button) button.disabled = !e.target.checked;
    e.target.closest('.order-consent')?.classList.toggle('is-checked', e.target.checked);
  }
  if (e.target.id === 'sort') { state.sort = e.target.value; render(null, { keepScroll: true }); }
});

document.addEventListener('input', e => {
  if(true) return; // Checkout totals are provided by quote_checkout, never browser city logic.
  const total=state.cart.reduce((n,i)=>n+i.price*i.qty,0);
  const ship=e.target.value.trim() ? shippingFee(e.target.value) : null;
  document.querySelector('[data-checkout-shipping]').textContent=ship===null?'Enter your city':money(ship);
  document.querySelector('[data-checkout-total-label]').textContent=ship===null?'Before shipping':'Total';
  document.querySelector('[data-checkout-total]').textContent=money(total+(ship||0));
  document.querySelector('#checkout-form [type="submit"]').textContent=ship===null?'Save order request':`Save order request · ${money(total+ship)}`;
  document.querySelector('[data-checkout-whatsapp]').innerHTML=waLink(orderMessage(total,ship),'Order on WhatsApp instead','btn ghost wa-btn');
});

window.addEventListener('hashchange', () => render());

/* ---------- search drawer ---------- */

const drawer = document.querySelector('.search-drawer');
const searchInput = document.querySelector('#search-input');
let lastFocus = null;

function openDrawer(trigger) {
  if (!drawer) return;
  lastFocus = trigger || document.activeElement;
  drawer.hidden = false;
  document.body.classList.add('drawer-open');
  searchInput.focus();
  document.addEventListener('keydown', trapFocus);
}

function closeDrawer() {
  if (!drawer || drawer.hidden) return;
  drawer.hidden = true;
  document.body.classList.remove('drawer-open');
  document.removeEventListener('keydown', trapFocus);
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}

function trapFocus(e) {
  if (e.key === 'Escape') { closeDrawer(); return; }
  if (e.key !== 'Tab') return;
  const focusables = drawer.querySelectorAll('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])');
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

if (searchInput) {
  searchInput.addEventListener('input', e => {
    state.query = e.target.value;
    const q = state.query.trim().toLowerCase();
    const results = document.querySelector('#search-results');
    if (!results) return;
    if (!q) { results.innerHTML = ''; return; }
    const found = [...products, ...combos].filter(p => `${p.name} ${p.notes} ${p.category || 'offer'}`.toLowerCase().includes(q));
    results.innerHTML = found.length
      ? found.map(p => `<a class="search-result" href="#product/${p.id}" data-close-search>${imgTag(p.img, p.name, 'sr-img')}<span><strong>${esc(p.name)}</strong><br><small>${esc(p.notes)}</small></span></a>`).join('')
      : '<p class="sub">No scents found.</p>';
  });
}

document.addEventListener('click', e => { if (e.target.closest('[data-close-search]')) closeDrawer(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (drawer && !drawer.hidden) closeDrawer();
    const nav = document.querySelector('.main-nav');
    if (nav && nav.classList.contains('open')) {
      nav.classList.remove('open');
      document.querySelector('.menu-toggle')?.setAttribute('aria-expanded', 'false');
      document.querySelector('.menu-toggle')?.setAttribute('aria-label', 'Open menu');
      document.querySelector('.menu-toggle')?.focus();
    }
  }
});

/* ---------- mobile menu ---------- */

const menuToggle = document.querySelector('.menu-toggle');
if (menuToggle) {
  menuToggle.addEventListener('click', e => {
    const nav = document.querySelector('.main-nav');
    if (!nav) return;
    const open = nav.classList.toggle('open');
    menuToggle.setAttribute('aria-expanded', String(open));
    menuToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  });
}

/* ---------- checkout validation ---------- */

document.addEventListener('submit', async e => {
  const form = e.target;
  if (!form.matches('#account-profile-form, #account-address-form, #checkout-form')) return;
  e.preventDefault();
  if (form.matches('#account-profile-form')) { await saveProfile(form); return; }
  if (form.matches('#account-address-form')) { await saveAddress(form); return; }
  if (!form.matches('#checkout-form')) return;
  await Commerce.submitCheckout(form);
});

/* ---------- Presence (online users) ---------- */
let presenceChannel = null;
const presenceTabId = (() => {
  try {
    let id = sessionStorage.getItem("pv-tab-id");
    if (!id) { id = "tab-" + Math.random().toString(36).slice(2); sessionStorage.setItem("pv-tab-id", id); }
    return id;
  } catch { return "tab-" + Math.random().toString(36).slice(2); }
})();
function startPresence() {
  if (!supabaseClient || presenceChannel) return;
  try {
    presenceChannel = supabaseClient.channel("site-presence", {
      config: { presence: { key: presenceTabId } },
    });
    presenceChannel.on("presence", { event: "sync" }, () => {
      const state = presenceChannel.presenceState();
      const count = Object.keys(state).length;
      const el = document.getElementById("admin-online-count");
      if (el) el.textContent = String(count);
      window.dispatchEvent(new CustomEvent("pv:presence", { detail: { count, state } }));
    });
    presenceChannel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        try { await presenceChannel.track({ path: location.hash || location.pathname, at: new Date().toISOString() }); } catch {}
      }
    });
  } catch (e) { console.warn("presence failed", e); }
}

function startLiveStorefrontUpdates() {
  let debounce;
  const refresh = () => {
    if (document.visibilityState !== "visible") return;
    void loadCatalogue();
    void window.PVEdit?.refresh?.();
  };
  const scheduleRefresh = () => {
    clearTimeout(debounce);
    debounce = setTimeout(refresh, 250);
  };
  try {
    if (supabaseClient) {
      supabaseClient.channel("storefront-live-updates")
        .on("postgres_changes", { event: "*", schema: "public", table: "product_prices" }, scheduleRefresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "products" }, scheduleRefresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "offers" }, scheduleRefresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "offer_components" }, scheduleRefresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "storefront_settings" }, scheduleRefresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "site_content" }, scheduleRefresh)
        .subscribe();
    }
  } catch (error) { console.warn("Live updates unavailable; periodic refresh remains active.", error); }
  window.setInterval(refresh, 30000);
  document.addEventListener("visibilitychange", refresh);
}

/* ---------- Admin edit mode ----------
   The edit mode lives in edit-mode.js so the owner can edit text, drag blocks
   and publish the result to every visitor from a fixed bottom-left toolbar. */
/* ---------- init ---------- */

render();
updateCounts();
loadCatalogue();
initializeAuth();
startPresence();
window.PVEdit?.init();
startLiveStorefrontUpdates();
// Semantic brand cursor: each common interaction gets its own shape + label.
(function(){
  const cursor=document.getElementById('custom-cursor');if(!cursor)return;
  if(!matchMedia('(hover: hover) and (pointer: fine)').matches)return;
  document.body.classList.add('custom-cursor-active');
  let visible=false;
  function update(target){
    if(!target?.closest)return;
    let type='default';
    if(document.querySelector('#app .is-dragging'))type='grabbing';
    else if(document.body.classList.contains('is-edit-mode')&&target.closest('[data-pv-editable]'))type='edit';
    else if(document.body.classList.contains('is-edit-mode')&&target.closest('[data-pv-drag]'))type='grab';
    else if(target.closest('[aria-busy="true"],.is-loading,[data-busy]'))type='wait';
    else if(target.closest(':disabled,[aria-disabled="true"]'))type='disabled';
    else if(target.closest('[aria-label*="close" i],[data-close],.close-search'))type='close';
    else if(target.closest('[aria-label*="previous" i],[aria-label*="prev" i],[data-cursor="prev"]'))type='prev';
    else if(target.closest('[aria-label*="next" i],[data-cursor="next"]'))type='next';
    else if(target.closest('input:not([type="button"]),textarea,[contenteditable="true"]'))type='text';
    else if(target.closest('[data-wish],.heart'))type='save';
    else if(target.closest('[data-add],.quick-add'))type='bag';
    else if(target.closest('.theme-toggle,[data-theme-toggle]'))type='theme';
    else if(target.closest('a[href*="wa.me"],a[href*="whatsapp"],.wa-btn'))type='chat';
    else if(target.closest('a[href] img,.gallery-main img,.detail-image img'))type='view';
    else if(target.closest('a[href],button,[role="button"],summary'))type='link';
    cursor.dataset.state=type;
  }
  document.addEventListener('pointermove',e=>{cursor.style.left=e.clientX+'px';cursor.style.top=e.clientY+'px';if(!visible){visible=true;cursor.classList.add('is-visible');}update(e.target);},{passive:true});
  document.addEventListener('pointerover',e=>update(e.target),{passive:true});
  document.addEventListener('pointerdown',()=>cursor.classList.add('is-pressed'),{passive:true});
  document.addEventListener('pointerup',()=>cursor.classList.remove('is-pressed'),{passive:true});
})();
