// Isolated browser fixtures. Counts and optional facts below never enter production.
const PRODUCTS = [
  { id: "angel-share", name: "Angel Share", category: "Soft", gender: "Unisex", notes: "cinnamon · vanilla · amber", description: "A warm, spicy signature.", image_path: "assets/media/angel-share-1080.webp", gallery_paths: ["assets/media/angel-share-1080.webp"], sizes_ml: [30, 50, 100], sort_order: 10, active: true },
  { id: "lavender-oud", name: "Lavender Oud", category: "Oud", gender: "Unisex", notes: "citrus · oud · warm spice", description: "Citrus and oud meet warm spice.", image_path: "assets/media/lavender-oud-1080.webp", gallery_paths: ["assets/media/lavender-oud-1080.webp"], sizes_ml: [30, 50, 100], sort_order: 20, active: true },
  { id: "candy", name: "Candy", category: "Sweet", gender: "Women", notes: "vanilla · fruit · amber", description: "Playful fruit and vanilla.", image_path: "assets/media/candy-1080.webp", gallery_paths: ["assets/media/candy-1080.webp"], sizes_ml: [30, 50, 100], sort_order: 30, active: true },
  { id: "leather", name: "Leather", category: "Bold", gender: "Unisex", notes: "leather · vanilla · amber", description: "Leather, vanilla and warm spice.", image_path: "assets/media/leather-1080.webp", gallery_paths: ["assets/media/leather-1080.webp"], sizes_ml: [30, 50, 100], sort_order: 40, active: true },
  { id: "guilty-man", name: "Guilty Man", category: "Bold", gender: "Men", notes: "woods · citrus · fresh spice", description: "Woody and fresh spicy.", image_path: "assets/media/guilty-man-1080.webp", gallery_paths: ["assets/media/guilty-man-1080.webp"], sizes_ml: [30, 50, 100], sort_order: 50, active: true },
  { id: "vanilla-28", name: "Vanilla 28", category: "Sweet", gender: "Unisex", notes: "vanilla · sweet woods · amber", description: "Sweet vanilla and warm woods.", image_path: "assets/media/vanilla-28-1080.webp", gallery_paths: ["assets/media/vanilla-28-1080.webp"], sizes_ml: [30, 50, 100], sort_order: 60, active: true },
];
const PRICES = PRODUCTS.flatMap((p) =>
  [30, 50, 100].map((s) => ({
    product_id: p.id,
    size_ml: s,
    price_inr: s === 30 ? 400 : s === 50 ? 750 : 1250,
    available_quantity: 100,
    active: true,
    low_stock_threshold: 2,
    sku: `UNIT-${p.id}-${s}`,
  })),
);
const OFFERS = [
  { id: "festive-four", name: "The Festive Four", price_inr: 2600, badge: "Buy 2 x 100ml, get 2 x 30ml FREE", notes: "Choose your free fragrances: Guilty Man or Vanilla 28", description: "Four full fragrances.", image_path: "assets/media/combo-festive-1080.webp", sort_order: 10, active: true },
  { id: "duo-plus", name: "The Duo Plus", price_inr: 1600, badge: "Buy 2 x 50ml, get 1 x 30ml FREE", notes: "Choose your free fragrance: Guilty Man or Vanilla 28", description: "The everyday trio.", image_path: "assets/media/combo-duo-1080.webp", sort_order: 20, active: true },
];
module.exports = async function fixture(page) {
  await page.route("https://lshwmudskeeknmcxlffe.supabase.co/rest/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const table = url.pathname.split("/").pop();
    if (table === "storefront_settings") return route.fulfill({ json: [{ revision: "2026-10-22-commerce" }] });
    if (["offer_components", "product_review_summary", "product_popularity", "public_reviews"].includes(table)) return route.fulfill({ json: [] });
    if (table === "products") return route.fulfill({ json: PRODUCTS.map((r, i) => ({ ...r, fragrance_family: i < 2 ? "Test family" : null, created_at: `2026-10-${String(i + 1).padStart(2, "0")}T00:00:00Z` })) });
    if (table === "product_prices") return route.fulfill({ json: PRICES });
    if (table === "offers") return route.fulfill({ json: OFFERS });
    return route.continue();
  });
};