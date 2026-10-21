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
  city: 'Mumbai'
};

/* Price ladder — derived from the live offers:
   2 x Rs 799 = Rs 1,598 ~ "Rs 1,600" combo.  2 x Rs 1,299 = Rs 2,598 ~ "Rs 2,600" combo. */
const SIZE_PRICES = { 30: 399, 50: 799, 100: 1299 };
const DEFAULT_SIZE = 50;
const HERO_SIZE = 100;
const FREE_SHIP_THRESHOLD = 999;
const SHIPPING_FEE = 79;

// Publishable key is designed for browser use; RLS and SELECT-only grants are
// the security boundary. Never replace this with a secret/service-role key.
const CATALOGUE_API = 'https://atxvfmvhnidknnhgwgaq.supabase.co/rest/v1';
const CATALOGUE_KEY = 'sb_publishable_fG_F6QyyAtg7hcSp9y2rMw_bJS2ZLYk';

/* Photography — Unsplash perfume imagery, self-hosted under assets/ */
const IMG = {
  angel: ['assets/angel-1.jpg', 'assets/angel-2.jpg', 'assets/angel-3.jpg'],
  oud: ['assets/oud-1.jpg', 'assets/oud-2.jpg', 'assets/oud-3.jpg'],
  candy: ['assets/candy-1.jpg', 'assets/candy-2.jpg', 'assets/candy-3.jpg'],
  leather: ['assets/leather-1.jpg', 'assets/leather-2.jpg', 'assets/leather-3.jpg'],
  guilty: ['assets/guilty-1.jpg', 'assets/guilty-2.jpg', 'assets/guilty-3.jpg'],
  vanilla: ['assets/vanilla-1.jpg', 'assets/vanilla-2.jpg', 'assets/vanilla-3.jpg'],
  hero: 'assets/hero.jpg',
  botanicals: 'assets/botanicals.jpg',
  offerFestive: 'assets/offer-festive.jpg',
  offerDuo: 'assets/offer-duo.jpg'
};

const products = [
  {
    id: 'angel-share', name: 'Angel Share', category: 'Soft', gender: 'Unisex',
    notes: 'skin musk · soft florals · amber',
    desc: 'The finishing touch to your everyday essentials. Angel Share is soft, warm and close to the skin — a signature scent that says more than words ever could.',
    img: IMG.angel[0], gallery: IMG.angel, sizes: [30, 50, 100]
  },
  {
    id: 'lavender-oud', name: 'Lavender Oud', category: 'Oud', gender: 'Unisex',
    notes: 'lavender · oud · amber',
    desc: 'A refined fragrance that brings elegance to every occasion. Cool lavender over a deep oud base — composed for celebrations, and for the ones worth remembering.',
    img: IMG.oud[0], gallery: IMG.oud, sizes: [30, 50, 100]
  },
  {
    id: 'candy', name: 'Candy', category: 'Sweet', gender: 'Women',
    notes: 'sugar · caramel · vanilla',
    desc: 'Playful, premium and unforgettable. Candy opens sweet and stays smooth — the kind of scent that gets remembered every day.',
    img: IMG.candy[0], gallery: IMG.candy, sizes: [30, 50, 100]
  },
  {
    id: 'leather', name: 'Leather', category: 'Bold', gender: 'Men',
    notes: 'leather · smoke · spice',
    desc: 'Bold and sophisticated. Worn leather over a warm smoky base — built for the man who does not need to announce himself.',
    img: IMG.leather[0], gallery: IMG.leather, sizes: [30, 50, 100]
  },
  {
    id: 'guilty-man', name: 'Guilty Man', category: 'Bold', gender: 'Men',
    notes: 'bergamot · vetiver · leather',
    desc: 'A composed, quietly magnetic scent. Bright bergamot and green vetiver over worn leather — sophisticated without trying too hard.',
    img: IMG.guilty[0], gallery: IMG.guilty, sizes: [30, 50, 100]
  },
  {
    id: 'vanilla-28', name: 'Vanilla 28', category: 'Sweet', gender: 'Women',
    notes: 'vanilla · tonka · amber',
    desc: 'Sweet. Smooth. Unforgettable. Vanilla 28 layers tonka and amber over a deep vanilla pod — comfort with a signature.',
    img: IMG.vanilla[0], gallery: IMG.vanilla, sizes: [30, 50, 100]
  }
];

/* The two offers the brand actually runs. */
const combos = [
  {
    id: 'festive-four', name: 'The Festive Four', kind: 'combo', price: 2600,
    badge: 'Buy 2 × 100ml, get 2 × 30ml FREE',
    notes: 'Lavender Oud · Leather · Guilty Man · Vanilla 28',
    desc: 'Four full fragrances — two 100ml bottles and two 30ml on the house. The festive edit, ready to gift.',
    img: IMG.offerFestive
  },
  {
    id: 'duo-plus', name: 'The Duo Plus', kind: 'combo', price: 1600,
    badge: 'Buy 2 × 50ml, get 1 × 30ml FREE',
    notes: 'Two 50ml bottles + one 30ml on the house',
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
const imgTag = (src, alt, cls = '') =>
  `<img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" decoding="async" class="${cls}" data-image-fallback="${FALLBACK_IMG}">`;

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

const phoneLink = (label = 'Call us') =>
  `<a class="contact-link phone-link" href="${BRAND.phoneHref}">${esc(BRAND.phoneDisplay)}</a>`;

const igLink = (label = 'Instagram') =>
  `<a class="text-link ig-link" href="${BRAND.instagram}" target="_blank" rel="noreferrer">${igSvg}<span>${esc(label)}</span></a>`;

const priceFor = (p, size) => isCombo(p) ? p.price : (p.prices?.[size] || SIZE_PRICES[size] || SIZE_PRICES[DEFAULT_SIZE]);
const priceLabel = (p, size) => isCombo(p) ? 'Combo' : `${size}ml`;

async function loadCatalogue() {
  const read = async (resource, select) => {
    const url = `${CATALOGUE_API}/${resource}?select=${select}`;
    const response = await fetch(url, { headers: { apikey: CATALOGUE_KEY }, cache: 'no-store' });
    if (!response.ok) throw new Error(`Catalogue request failed (${response.status})`);
    return response.json();
  };
  const safeImage = path => typeof path === 'string' && /^assets\/[a-zA-Z0-9._/-]+$/.test(path) && !path.includes('..');

  try {
    const [rows, prices, offersRows] = await Promise.all([
      read('products', 'id,name,category,gender,notes,description,image_path,gallery_paths,sizes_ml,sort_order&active=eq.true&order=sort_order'),
      read('product_prices', 'product_id,size_ml,price_inr&order=product_id,size_ml'),
      read('offers', 'id,name,price_inr,badge,notes,description,image_path,sort_order&active=eq.true&order=sort_order')
    ]);
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
      if (!sizes.length) throw new Error('Product has no priced sizes');
      return { id: row.id, name: row.name, category: row.category, gender: row.gender, notes: row.notes, desc: row.description, img: row.image_path, gallery: row.gallery_paths, sizes, prices: productPrices };
    });
    const nextOffers = offersRows.map(row => {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.id) || !safeImage(row.image_path) || !Number.isSafeInteger(row.price_inr) || row.price_inr <= 0) throw new Error('Invalid offer row');
      return { id: row.id, name: row.name, kind: 'combo', price: row.price_inr, badge: row.badge, notes: row.notes, desc: row.description, img: row.image_path };
    });

    products.splice(0, products.length, ...nextProducts);
    combos.splice(0, combos.length, ...nextOffers);
    const firstPrices = nextProducts[0].prices;
    Object.assign(SIZE_PRICES, firstPrices);
    // A database change can invalidate a stored variant choice; normalize it.
    for (const product of nextProducts) {
      if (!product.sizes.includes(state.selectedSize[product.id])) state.selectedSize[product.id] = product.sizes.includes(DEFAULT_SIZE) ? DEFAULT_SIZE : product.sizes[0];
    }
    // Do not interrupt an in-progress gesture/scroll if the network responds late.
    if (!catalogueUserInteracted) render(location.hash.slice(1) || 'landing', { keepScroll: true });
  } catch {
    // Keep the bundled catalogue available if the network/API is unavailable.
    console.warn('Using the built-in catalogue because the live catalogue could not be loaded.');
  }
}

const save = () => {
  try {
    localStorage.setItem('am-cart', JSON.stringify(state.cart));
    localStorage.setItem('am-wish', JSON.stringify(state.wish));
  } catch { toast('Your changes will last for this visit only'); }
  updateCounts();
};

const updateCounts = () => {
  const c = document.querySelector('.cart-count');
  const w = document.querySelector('.wish-count');
  if (c) c.textContent = state.cart.reduce((n, i) => n + i.qty, 0);
  if (w) w.textContent = state.wish.length;
};

const toast = t => {
  const x = document.querySelector('#toast');
  if (!x) return;
  x.textContent = t;
  x.classList.add('show');
  clearTimeout(x._t);
  x._t = setTimeout(() => x.classList.remove('show'), 2200);
};

const announce = msg => { if (announcer) announcer.textContent = msg; };

document.addEventListener('error', event => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement) || !image.dataset.imageFallback || image.dataset.fallbackTried) return;
  image.dataset.fallbackTried = 'true';
  image.src = image.dataset.imageFallback;
}, true);

/* ---------- shared fragments ---------- */

const icon = name => {
  const P = {
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
    truck: '<path d="M3 6h11v9H3zM14 9h3.6l2.4 3v3h-2"/><circle cx="7" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/>',
    box: '<path d="M21 8v8l-9 5-9-5V8l9-5 9 5Z"/><path d="m3 8 9 5 9-5M12 21v-8"/>',
    sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/>'
  };
  return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
};

const priceBlock = p => {
  if (isCombo(p)) {
    return `<div class="price"><span class="price-amount">${money(p.price)}</span><span class="price-size">combo</span></div>
            <div class="price-ladder"><span>${esc(p.badge)}</span></div>`;
  }
  const sizes = p.sizes || Object.keys(SIZE_PRICES).map(Number);
  const heroSize = sizes.includes(HERO_SIZE) ? HERO_SIZE : sizes[sizes.length - 1];
  return `<div class="price"><span class="price-amount">${money(priceFor(p, heroSize))}</span><span class="price-size">${heroSize}ml</span></div>
          <div class="price-ladder">${sizes.filter(s => s !== heroSize).map(s => `<span>${s}ml ${money(priceFor(p, s))}</span>`).join('<span aria-hidden="true">·</span>')}</div>`;
}

function card(p) {
  const wished = state.wish.includes(p.id);
  return `<article class="product-card">
    <div class="product-image"><a href="#product/${p.id}" aria-label="View ${esc(p.name)}">${imgTag(p.img, `${p.name} — Parrfums Vault fragrance`)}</a>
      <button class="heart ${wished ? 'active' : ''}" data-wish="${p.id}" aria-label="${wished ? 'Remove' : 'Add'} ${esc(p.name)} ${wished ? 'from' : 'to'} wishlist" aria-pressed="${wished}">${heartSvg(wished)}</button></div>
    <div class="product-meta"><a href="#product/${p.id}"><h3>${esc(p.name)}</h3><p>${esc(p.notes)}</p>${priceBlock(p)}</a>
      <button class="quick-add" data-add="${p.id}">Add to bag <span aria-hidden="true">+</span></button></div>
  </article>`;
}

function offerCard(c) {
  return `<article class="offer-card">
    <div class="offer-img">${imgTag(c.img, `${c.name} — ${c.badge}`)}<span class="offer-badge">Limited stock</span></div>
    <div class="offer-body">
      <p class="eyebrow">The vault offer</p>
      <h3>${esc(c.name)}</h3>
      <p class="offer-per">${esc(c.badge)}</p>
      <p class="offer-notes">${esc(c.notes)}</p>
      <p class="offer-price">${money(c.price)}</p>
      <div class="offer-actions">
        <button class="btn primary" data-add="${c.id}">Add to bag</button>
        ${waLink(`Hi Parrfums Vault! I'd like to order the ${c.name} (${c.badge}) for ${money(c.price)}.`, 'Order on WhatsApp', 'btn ghost wa-btn')}
      </div>
    </div>
  </article>`;
}

function contactStrip() {
  return `<div class="contact-strip">
    <a class="contact-item" href="${BRAND.whatsapp}" target="_blank" rel="noreferrer">${waSvg}<span><strong>Order on WhatsApp</strong><small>Fastest way to order</small></span></a>
    <a class="contact-item" href="${BRAND.phoneHref}">${phoneSvg}<span><strong>${BRAND.phoneDisplay}</strong><small>Call to order</small></span></a>
    <a class="contact-item" href="${BRAND.instagramDm}" target="_blank" rel="noreferrer">${igSvg}<span><strong>DM @parrfums.vault</strong><small>Limited stock — DM now</small></span></a>
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
const arrowDownSvg = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>`;

/* ---------------------------------------------------------------- landing */
function landing() {
  return `<section class="landing">
    <div class="landing-bg" role="img" aria-label="Parrfums Vault fragrance photography"></div>
    <div class="landing-scrim" aria-hidden="true"></div>

    <div class="landing-top">
      <a class="brand landing-brand" href="#home" aria-label="Parrfums Vault — enter the store">
        ${brandMark}
      </a>
      <a class="landing-enter" href="#home">Shop now ${arrowSvg}</a>
    </div>

    <div class="landing-inner">
      <p class="landing-eyebrow">Luxury in a bottle</p>
      <h1 class="landing-brand-name">Parrfums Vault</h1>
      <p class="landing-sub">Handmade, long-lasting fragrance from ${BRAND.city}. Unique, timeless scents in limited batches, delivered across India.</p>
      <div class="landing-actions">
        <a class="btn primary lg" href="#home">Shop now</a>
        ${waLink('Hi Parrfums Vault! I would like to place an order.', 'Order on WhatsApp', 'btn ghost lg wa-btn')}
      </div>
    </div>

    <div class="landing-foot">
      <span>Handmade in ${BRAND.city}</span>
      <span>Pan-India delivery</span>
      <span>From ₹399</span>
      <button class="landing-scroll" type="button" data-scroll-to="the-vault" aria-label="Scroll down to the vault">${arrowDownSvg}</button>
    </div>
  </section>

  <section class="section band-cream" id="the-vault">
    <div class="section-head">
      <div><p class="eyebrow">The vault offer</p><h2>Four fragrances, ₹2,600.</h2></div>
      <a class="text-link" href="#offers">All offers</a>
    </div>
    ${offerHero(combos[0])}
  </section>

  <section class="section band-paper">
    <div class="section-head">
      <div><p class="eyebrow">The vault</p><h2>Six fragrances, three sizes</h2></div>
      <a class="text-link" href="#shop">Shop the vault</a>
    </div>
    <div class="landing-scent-grid">
      ${products.map(p => `<a class="landing-scent" href="#product/${p.id}">${imgTag(p.img, `${p.name} fragrance`)}<span class="landing-scent-meta"><strong>${esc(p.name)}</strong><small>${esc(p.notes)}</small><em>From ${money(Math.min(...p.sizes.map(s => priceFor(p, s))))}</em></span></a>`).join('')}
    </div>
  </section>

  ${contactBand('Ordering', 'Order on WhatsApp.', 'Send us your list and we will confirm stock, price and delivery personally — usually within a few hours.')}`;
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
        <button class="btn primary" data-add="${c.id}">Add to bag</button>
        ${waLink(`Hi Parrfums Vault! I'd like to order the ${c.name} (${c.badge}) for ${money(c.price)}.`, 'Order on WhatsApp', 'btn ghost wa-btn')}
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

function home() {
  return `<section class="hero">
    <div class="hero-copy">
      <p class="eyebrow">Parrfums Vault · ${BRAND.city}</p>
      <h1>Find your<br> fragrance identity.</h1>
      <p>Handmade, long-lasting fragrance from ${BRAND.city}. Luxury in a bottle — unique, timeless scents in limited batches, delivered across India.</p>
      <div class="hero-actions">
        <a class="btn primary" href="#shop">Shop the vault</a>
        ${waLink('Hi Parrfums Vault! I would like to place an order.', 'Order on WhatsApp', 'btn ghost wa-btn')}
      </div>
      <p class="hero-note">Six fragrances · 30ml / 50ml / 100ml · From ₹399</p>
    </div>
    <div class="hero-image" role="img" aria-label="Parrfums Vault fragrance photography" style="background-image:url('${IMG.hero}')"></div>
  </section>
  ${uspStrip()}
  <section class="section band-cream">
    <div class="section-head">
      <div><p class="eyebrow">Gifting that gets remembered</p><h2>Some gifts are opened once. The best ones are remembered every day.</h2></div>
      <a class="text-link" href="#offers">All offers</a>
    </div>
    ${offerHero(combos[0])}
    <div class="offer-row">${[combos[1]].map(offerCard).join('')}</div>
  </section>
  <section class="section band-paper">
    <div class="section-head">
      <div><p class="eyebrow">The vault</p><h2>A fragrance for every mood</h2></div>
      <a class="text-link" href="#shop">Shop all six</a>
    </div>
    ${moodChips('All')}
    <div class="product-grid">${products.map(card).join('')}</div>
  </section>
  <section class="band band-sage">
    <div class="finder-teaser">
      <div><p class="eyebrow">The scent finder</p><h2>Three questions, then a shortlist.</h2><p>Answer three quick questions and we will narrow the vault down to the scents that fit you.</p></div>
      <a class="btn" href="#finder">Find your scent</a>
    </div>
  </section>
  <section class="feature">
    <img src="${IMG.botanicals}" alt="Botanical ingredients used in Parrfums Vault fragrance">
    <div class="feature-copy">
      <p class="eyebrow">Luxury that smells like a steal</p>
      <h2>Who says smelling expensive has to be expensive?</h2>
      <p>Premium concentration, small-batch production and an honest price. This is fragrance that performs all day — without the luxury tax.</p>
      <div class="feature-actions"><a class="btn" href="#shop">Find your scent</a>${waLink('Hi Parrfums Vault! Can you help me pick a fragrance?', 'Ask on WhatsApp', 'btn ghost wa-btn')}</div>
    </div>
  </section>
  ${contactBand()}`;
}

function shop() {
  const q = state.query.trim().toLowerCase();
  let list = products.filter(p => (state.category === 'All' || p.category === state.category) &&
    (`${p.name} ${p.notes} ${p.category} ${p.gender}`).toLowerCase().includes(q));
  if (state.sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
  if (state.sort === 'name-desc') list = [...list].sort((a, b) => b.name.localeCompare(a.name));
  if (state.sort === 'category') list = [...list].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  const empty = list.length === 0;
  return `<section class="page-shell">
    <p class="eyebrow">The full collection</p><h1 class="page-title">Shop fragrance</h1>
    <p class="page-intro">Six fragrances in three sizes each. Handmade in Mumbai, delivered across India.</p>
    <div class="shop-toolbar">
      ${moodChips(state.category)}
      <select class="select" id="sort" aria-label="Sort products">
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

function offers() {
  return `<section class="page-shell">
    <p class="eyebrow">Gifting</p><h1 class="page-title">The vault offers</h1>
    <p class="page-intro">Two ways to build a fragrance shelf — and to gift something they will keep. Order in one tap on WhatsApp.</p>
    ${offerHero(combos[0])}
    <div class="offer-grid">${[combos[1]].map(offerCard).join('')}</div>
    ${contactStrip()}
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
  if (isCombo(p)) {
    return `<section class="page-shell"><div class="detail">
      <div class="detail-image"><div class="gallery-main">${imgTag(p.img, `${p.name} offer`, 'gallery-img')}</div></div>
      <div class="detail-copy">
        <p class="eyebrow">The vault offer</p><h1>${esc(p.name)}</h1><p class="sub">${esc(p.badge)}</p>
        <p class="large-price" id="detail-price">${money(p.price)}</p>
        <p>${esc(p.desc)}</p><p class="offer-notes">${esc(p.notes)}</p>
        <button class="btn primary full" data-add="${p.id}">Add to bag</button>
        ${waLink(`Hi Parrfums Vault! I'd like to order the ${p.name} — ${p.badge} for ${money(p.price)}.`, 'Order on WhatsApp', 'btn ghost full wa-btn')}
      </div>
    </div></section>`;
  }
  const gi = state.galleryIndex[p.id] || 0;
  const selSize = p.sizes.includes(state.selectedSize[p.id]) ? state.selectedSize[p.id] : (p.sizes.includes(DEFAULT_SIZE) ? DEFAULT_SIZE : p.sizes[0]);
  const sizeButtons = p.sizes.map(s => `<button class="variant ${s === selSize ? 'selected' : ''}" data-size="${s}" aria-pressed="${s === selSize}">${s}ml · ${money(priceFor(p, s))}</button>`).join('');
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
      <h1>${esc(p.name)}</h1><p class="sub">${esc(p.notes)}</p>
      <p class="large-price" id="detail-price">${money(priceFor(p, selSize))} <span class="price-size">${selSize}ml</span></p>
      <p>${esc(p.desc)}</p>
      <p class="variant-label">Choose size</p>
      <div class="variant-row" role="group" aria-label="Choose size">${sizeButtons}</div>
      <button class="btn primary full" data-add="${p.id}">Add to bag</button>
      <button class="btn ghost full" data-wish="${p.id}" style="margin-top:10px">${heartSvg(wished)} ${wished ? 'In wishlist' : 'Add to wishlist'}</button>
      ${waLink(`Hi Parrfums Vault! I'd like to order ${p.name} (${selSize}ml — ${money(priceFor(p, selSize))}).`, 'Order on WhatsApp', 'btn ghost full wa-btn')}
      <p class="sub" style="margin-top:18px">Pan-India delivery · Limited stock · ${BRAND.city}</p>
    </div></div>
    <div class="related"><h2>You may also like</h2><div class="product-grid">${relatedFill.map(card).join('')}</div></div>
  </section>`;
}

function notFound() {
  return `<section class="page-shell"><div class="empty" role="status"><h2>Page not found</h2><p>The scent you’re looking for has moved.</p><a class="btn" href="#home">Back home</a></div></section>`;
}

function cartSummary(total) {
  const ship = total >= FREE_SHIP_THRESHOLD || total === 0 ? 0 : SHIPPING_FEE;
  return `<aside class="summary"><h2>Summary</h2>
    <div class="sum-line"><span>Subtotal</span><span>${money(total)}</span></div>
    <div class="sum-line"><span>Shipping</span><span>${ship === 0 ? 'Complimentary' : money(ship)}</span></div>
    <div class="sum-line total"><span>Total</span><span>${money(total + ship)}</span></div>
    <a class="btn primary full" href="#checkout">Continue to checkout</a>
    ${waLink(`Hi Parrfums Vault! I'd like to order:\n${state.cart.map(i => `• ${i.name} (${i.combo ? i.badge : i.size + 'ml'}) × ${i.qty} — ${money(i.price * i.qty)}`).join('\n')}\nTotal: ${money(total + ship)}`, 'Send this order on WhatsApp', 'btn ghost full wa-btn')}
  </aside>`;
}

function cart() {
  if (!state.cart.length) return `<section class="page-shell"><p class="eyebrow">Your ritual, gathered</p><h1 class="page-title">Your bag</h1>
    <div class="empty" role="status"><h2>Your bag is waiting.</h2><p>Discover something new for your shelf.</p><a class="btn" href="#shop">Shop fragrance</a></div></section>`;
  const total = state.cart.reduce((n, i) => n + i.price * i.qty, 0);
  const gap = Math.max(0, FREE_SHIP_THRESHOLD - total);
  const progress = Math.min(100, total / FREE_SHIP_THRESHOLD * 100);
  return `<section class="page-shell">
    <p class="eyebrow">Your ritual, gathered</p><h1 class="page-title">Your bag</h1>
    <div class="shipping-progress">
      <div class="shipping-progress-head"><span>${gap ? `Add ${money(gap)} for complimentary shipping` : 'Complimentary shipping unlocked'}</span><span>${Math.round(progress)}%</span></div>
      <div class="progress-track"><span style="width:${progress}%"></span></div>
    </div>
    <div class="cart-layout">
      <div>${state.cart.map((i, n) => `<div class="cart-item">
        ${imgTag(i.img, i.name)}
        <div><h3>${esc(i.name)}</h3><p>${i.combo ? esc(i.badge) : `${i.size}ml · ${esc(i.notes)}`}</p>
          <div class="qty" role="group" aria-label="Quantity for ${esc(i.name)}">
            <button data-qty="${n}" data-delta="-1" aria-label="Decrease quantity">−</button>
            <span>${i.qty}</span>
            <button data-qty="${n}" data-delta="1" aria-label="Increase quantity">+</button>
          </div>
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
        <button class="btn small" data-add="${p.id}" style="margin-top:10px">Add to bag</button></div>
    </article>`).join('')}</div></section>`;
}

function checkout() {
  if (!state.cart.length) return `<section class="page-shell"><div class="empty" role="status"><h2>Your bag is empty.</h2><a class="btn" href="#shop">Shop fragrance</a></div></section>`;
  const total = state.cart.reduce((n, i) => n + i.price * i.qty, 0);
  const ship = total >= FREE_SHIP_THRESHOLD ? 0 : SHIPPING_FEE;
  const grand = total + ship;
  return `<section class="page-shell">
    <p class="eyebrow">Almost yours</p><h1 class="page-title">Checkout</h1>
    <div class="checkout">
      <form id="checkout-form" novalidate>
        <div class="form-grid">
          <div class="field"><label for="first">First name</label><input id="first" name="first" required autocomplete="given-name" aria-describedby="err-first"><span class="field-error" id="err-first"></span></div>
          <div class="field"><label for="last">Last name</label><input id="last" name="last" required autocomplete="family-name" aria-describedby="err-last"><span class="field-error" id="err-last"></span></div>
          <div class="field full-field"><label for="email">Email</label><input id="email" name="email" type="email" required autocomplete="email" aria-describedby="err-email"><span class="field-error" id="err-email"></span></div>
          <div class="field full-field"><label for="phone">Phone number</label><input id="phone" name="phone" type="tel" required inputmode="numeric" maxlength="10" placeholder="10-digit mobile number" autocomplete="tel-national" aria-describedby="err-phone"><span class="field-error" id="err-phone"></span></div>
          <div class="field full-field"><label for="address">Address</label><input id="address" name="address" required autocomplete="street-address" aria-describedby="err-address"><span class="field-error" id="err-address"></span></div>
          <div class="field"><label for="city">City</label><input id="city" name="city" required autocomplete="address-level2" aria-describedby="err-city"><span class="field-error" id="err-city"></span></div>
          <div class="field"><label for="pin">PIN code</label><input id="pin" name="pin" required inputmode="numeric" maxlength="6" pattern="[0-9]{6}" placeholder="6 digits" autocomplete="postal-code" aria-describedby="err-pin"><span class="field-error" id="err-pin"></span></div>
        </div>
        <p class="error" id="form-error" role="alert"></p>
        <div class="checkout-actions">
          <button class="btn primary" type="submit">Place order · ${money(grand)}</button>
          ${waLink(`Hi Parrfums Vault! I'd like to place an order for ${money(grand)}.\n${state.cart.map(i => `• ${i.name} (${i.combo ? i.badge : i.size + 'ml'}) × ${i.qty}`).join('\n')}\nPlease confirm availability and delivery.`, 'Order on WhatsApp instead', 'btn ghost wa-btn')}
        </div>
        <p class="sub">No payment is processed on this site. Orders are confirmed on WhatsApp or by phone.</p>
      </form>
      <aside class="summary">
        <h2>In your bag</h2>
        ${state.cart.map(i => `<div class="sum-line"><span>${esc(i.name)} × ${i.qty}<small>${i.combo ? esc(i.badge) : i.size + 'ml'}</small></span><span>${money(i.price * i.qty)}</span></div>`).join('')}
        <div class="sum-line"><span>Subtotal</span><span>${money(total)}</span></div>
        <div class="sum-line"><span>Shipping</span><span>${ship === 0 ? 'Complimentary' : money(ship)}</span></div>
        <div class="sum-line total"><span>Total</span><span>${money(grand)}</span></div>
      </aside>
    </div>
  </section>`;
}

function about() {
  return `<section class="page-shell">
    <div class="about-grid">
      ${imgTag(IMG.botanicals, 'Botanical ingredients used in Parrfums Vault fragrance', 'about-img')}
      <div><p class="eyebrow">Our story</p><h1>Luxury in a bottle.</h1>
        <p>Parrfums Vault was born in ${BRAND.city} from a simple idea: fragrance should feel personal — the kind that becomes part of how people remember you.</p>
        <p>We release in small batches. Every bottle is handmade, unique and made to stay with you — and priced so that smelling expensive does not have to be expensive.</p>
        <p>Some gifts are opened once. The best ones are remembered every day. That is what we are making.</p>
        <div class="feature-actions"><a class="btn" href="#shop">Find your scent</a>${waLink('Hi Parrfums Vault! I would like to know more about your fragrances.', 'Talk to us', 'btn ghost wa-btn')}</div>
      </div>
    </div>
    <div class="feed-block">
      <div class="section-head"><div><p class="eyebrow">From the feed</p><h2>As we post it</h2></div>${igLink('Follow @parrfums.vault')}</div>
      <div class="feed-grid">
        ${[IMG.oud[1], IMG.guilty[0], IMG.vanilla[0], IMG.hero].map((src, i) => `<a class="feed-tile" href="${BRAND.instagram}" target="_blank" rel="noreferrer" aria-label="See our Instagram post ${i + 1}">${imgTag(src, `Parrfums Vault Instagram post ${i + 1}`)}</a>`).join('')}
      </div>
    </div>
    ${contactStrip()}
  </section>`;
}

/* ---------- router ---------- */

let currentPath = null;

function setActiveNav(path) {
  const map = { shop: '#shop', collections: '#collections', finder: '#finder', about: '#about', offers: '#offers' };
  const active = path.startsWith('product/') ? '#shop' : (map[path] || (path === 'home' ? '#home' : ''));
  document.querySelectorAll('.main-nav a').forEach(a => {
    const href = a.getAttribute('href');
    if (active && href === active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

const ROUTES = new Set(['landing', 'home', 'shop', 'collections', 'finder', 'about', 'offers', 'cart', 'checkout', 'wishlist']);

function render(route, opts = {}) {
  const path = route || (location.hash.slice(1) || 'landing');

  /* An in-page anchor (e.g. #the-vault) is not a route. Scroll to it and keep
     the current view instead of rendering a 404. */
  if (!ROUTES.has(path) && !path.startsWith('product/')) {
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

  let view;
  if (isLanding) view = landing();
  else if (path === 'home') view = home();
  else if (path === 'shop') view = shop();
  else if (path === 'collections') view = collections();
  else if (path === 'finder') view = finder();
  else if (path === 'about') view = about();
  else if (path === 'offers') view = offers();
  else if (path === 'cart') view = cart();
  else if (path === 'checkout') view = checkout();
  else if (path === 'wishlist') view = wishlist();
  else if (path.startsWith('product/')) view = productView(get(path.split('/')[1]));
  else if (path === '404' || path === '') view = path === '' ? home() : notFound();
  else view = notFound();

  app.innerHTML = view;
  currentPath = path;
  updateCounts();
  setActiveNav(path);

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
  if (label) label.textContent = '✓';
  setTimeout(() => {
    btn.classList.remove('added');
    if (label && original !== null) label.textContent = original;
  }, 1500);
}

document.addEventListener('click', e => {
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
      size = Number((sel && sel.dataset.size) || state.selectedSize[p.id] || DEFAULT_SIZE);
      price = priceFor(p, size);
    }
    const existing = state.cart.find(i => i.id === p.id && i.size === size);
    if (existing) existing.qty++;
    else state.cart.push({ id: p.id, name: p.name, notes: p.notes, img: p.img, size, price, qty: 1, combo: isCombo(p), badge });
    save();
    flashAdded(add);
    toast(`${p.name} added to your bag`);
    return;
  }

  const qty = e.target.closest('[data-qty]');
  if (qty) {
    const i = state.cart[Number(qty.dataset.qty)];
    if (!i) return;
    i.qty += Number(qty.dataset.delta);
    if (i.qty < 1) state.cart.splice(Number(qty.dataset.qty), 1);
    save();
    render(null, { keepScroll: true });
    return;
  }

  const rem = e.target.closest('[data-remove]');
  if (rem) {
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
    state.category = 'All'; state.query = '';
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
    document.querySelectorAll('.variant').forEach(x => { x.classList.remove('selected'); x.setAttribute('aria-pressed', 'false'); });
    variant.classList.add('selected');
    variant.setAttribute('aria-pressed', 'true');
    const addBtn = variant.closest('.detail')?.querySelector('[data-add]');
    const p = get(addBtn ? addBtn.dataset.add : '');
    const size = Number(variant.dataset.size);
    if (p) {
      state.selectedSize[p.id] = size;
      const priceEl = document.querySelector('#detail-price');
      if (priceEl) priceEl.innerHTML = `${money(priceFor(p, size))} <span class="price-size">${size}ml</span>`;
    }
    return;
  }

  const openSearch = e.target.closest('[data-open-search]');
  if (openSearch) { openDrawer(openSearch); return; }

  const closeSearch = e.target.closest('.close-search');
  if (closeSearch) { closeDrawer(); return; }

  if (e.target.closest('.main-nav a')) {
    document.querySelector('.main-nav')?.classList.remove('open');
    document.querySelector('.menu-toggle')?.setAttribute('aria-expanded', 'false');
  }
});

document.addEventListener('change', e => {
  if (e.target.id === 'sort') { state.sort = e.target.value; render(null, { keepScroll: true }); }
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

document.addEventListener('submit', e => {
  if (!e.target.matches('#checkout-form')) return;
  e.preventDefault();
  const form = e.target;
  const fields = ['first', 'last', 'email', 'phone', 'address', 'city', 'pin'];
  let ok = true, firstBad = null;
  fields.forEach(id => {
    const input = document.getElementById(id);
    const err = document.getElementById('err-' + id);
    let msg = '';
    const v = (input.value || '').trim();
    if (!v) msg = 'Required';
    else if (id === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) msg = 'Enter a valid email';
    else if (id === 'phone' && !/^[6-9]\d{9}$/.test(v)) msg = 'Enter a valid 10-digit mobile number';
    else if (id === 'pin' && !/^\d{6}$/.test(v)) msg = 'Enter a valid 6-digit PIN code';
    if (err) err.textContent = msg;
    input.classList.toggle('invalid', Boolean(msg));
    input.setAttribute('aria-invalid', String(Boolean(msg)));
    if (msg) { ok = false; if (!firstBad) firstBad = input; }
  });
  const formErr = document.querySelector('#form-error');
  if (!ok) {
    formErr.textContent = 'Please complete all fields correctly.';
    if (firstBad) firstBad.focus();
    return;
  }
  formErr.textContent = '';
  const name = (document.getElementById('first').value || '').trim();
  state.cart = [];
  save();
  currentPath = null;
  app.innerHTML = `<section class="page-shell"><div class="success" role="status">
    <p class="eyebrow">Order received</p>
    <h1>Thank you, ${esc(name)}.</h1>
    <p class="sub">Your details are validated. We confirm every order personally on WhatsApp or by phone — usually within a few hours.</p>
    ${waLink(`Hi Parrfums Vault! I just placed an order for ${esc(name)}.`, 'Send order details on WhatsApp', 'btn primary wa-btn')}
    <a class="btn ghost" href="#shop" style="margin-top:10px">Continue shopping</a>
  </div></section>`;
  window.scrollTo(0, 0);
  updateCounts();
  announce('Order received');
});

/* ---------- init ---------- */

render();
updateCounts();
loadCatalogue();
