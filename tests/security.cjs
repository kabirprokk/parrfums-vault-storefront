const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  crypto = require("node:crypto"),
  path = require("node:path");
const root = path.resolve(__dirname, ".."),
  read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const config = JSON.parse(read("vercel.json"));
const adminHeaders = Object.fromEntries(
  config.headers.find((r) => r.source === "/admin/:path*").headers.map((h) => [h.key, h.value]),
);
assert.match(adminHeaders["Cache-Control"], /no-store/);
assert.match(adminHeaders["X-Robots-Tag"], /noindex/);
assert.match(read("robots.txt"), /Disallow: \/admin/);
const headers = Object.fromEntries(
  config.headers
    .find((r) => r.source === "/(.*)")
    .headers.map((h) => [h.key, h.value]),
);
const csp = headers["Content-Security-Policy"];
for (const rule of [
  "default-src 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
])
  assert.ok(csp.includes(rule), rule);
const scripts = csp.split(";").find((s) => s.includes("script-src"));
assert.ok(
  !scripts.includes("unsafe-inline") &&
    !scripts.includes("unsafe-eval") &&
    !scripts.includes("*"),
);
const styles = csp.split(";").find((s) => s.includes("style-src"));
assert.ok(
  styles?.includes("unsafe-inline"),
  "Razorpay Checkout requires inline styles for its hosted modal",
);
assert.ok(csp.includes("wss://lshwmudskeeknmcxlffe.supabase.co"), "CSP allows the Supabase realtime WebSocket used for global storefront updates");
assert.equal(headers["X-Content-Type-Options"], "nosniff");
assert.equal(headers["X-Frame-Options"], "DENY");
assert.ok(headers["Strict-Transport-Security"].includes("max-age="));
assert.match(headers["Permissions-Policy"], /geolocation=\(\)/,
  "geolocation is disabled when location autofill is not offered");
const bundle = fs
  .readFileSync(path.join(root, "vendor/supabase-js-2.118.0.js"), "utf8")
  .replace(/\r\n/g, "\n");
assert.equal(
  crypto.createHash("sha256").update(bundle).digest("hex").toUpperCase(),
  "EE3BE8DE192B97CB1D73D1E95D6B82BB1F6B658C0F97C4EF757FC331996ED3D3",
);
for (const file of [
  "app.js",
  "commerce.js",
  "commerce-views.js",
  "admin.js",
  "seo.js",
  "edit-mode.js",
  "index.html",
]) {
  const source = read(file);
  assert.doesNotMatch(
    source,
    /sb_secret_[A-Za-z0-9]+|service_role["']\s*[:=]\s*["'][^"']{20}/,
    file + " contains secret material",
  );
  assert.doesNotMatch(
    source,
    /\beval\s*\(|new Function\s*\(|document\.write\s*\(/,
    file + " dynamic execution",
  );
}
assert.doesNotMatch(read("app.js"), /\sstyle\s*=/i, "Storefront markup avoids inline style attributes");
assert.doesNotMatch(read("admin.js"), /\sstyle\s*=/i, "Admin markup avoids inline style attributes");
const securityTxt = read(".well-known/security.txt");
assert.match(securityTxt, /^Contact: mailto:quillsandcologne@gmail\.com$/m);
assert.match(securityTxt, /^Expires: 2027-10-23T00:00:00\.000Z$/m);
assert.match(securityTxt, /^Canonical: https:\/\/parrfumsvault.in\/.well-known\/security\.txt$/m);
assert.ok(read(".gitignore").includes(".env.*"));
assert.ok(!read("app.js").includes("rpc('create_customer_order'"));
const adminAuth = read(
  "supabase/migrations/20261031180000_email_authenticated_admin_access.sql",
);
assert.ok(adminAuth.includes("public.admin_users"));
assert.doesNotMatch(adminAuth, /auth\.jwt\(\).*aal/i);
assert.ok(read("admin.js").includes("signInWithOtp"));
assert.ok(read("admin.js").includes('verifyOtp({ email: model.otpEmail'));
const foundation = read("supabase/migrations/20261022105858_commerce_foundation.sql");
assert.ok(foundation.includes("revoke create on schema public"));
for (const match of [
  ...read(
    "supabase/migrations/20261022105905_checkout_inventory_admin.sql",
  ).matchAll(/security definer/gi),
])
  assert.ok(match.index >= 0);
console.log(
  "PASS: restrictive CSP and security.txt, vendored SDK integrity, frontend secret/dynamic-code checks, ignored secrets, legacy checkout removal and membership-based admin authorization.",
);
