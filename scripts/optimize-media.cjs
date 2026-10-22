/* Run with `node scripts/optimize-media.cjs <source directory>` after installing sharp.
   Originals stay outside the repository; output preserves each complete artwork. */
const sharp = require('sharp');
const fs = require('node:fs');
const path = require('node:path');
const source = process.argv[2];
if (!source) throw new Error('Supply the Parrfum vault media directory.');
const output = path.join(__dirname, '..', 'assets', 'media');
const files = {
  'angel-share': 'real products/11.png', 'lavender-oud': 'real products/14.png',
  candy: 'real products/12.png', leather: 'real products/9.png',
  'guilty-man': 'real products/13.png', 'vanilla-28': 'real products/10.png',
  'combo-duo-gift': 'combos/Elegant three-bottle perfume gift set.png',
  'combo-duo-diwali': 'combos/Luxury Diwali perfume trio offer.png',
  'combo-festive-diwali': 'combos/Parrfums Vault Diwali Gift Collection.png',
  'combo-festive': 'combos/Parrfums Vault_ Buy 2, get 2 free.png',
  'combo-duo': 'combos/Premium perfume trio, free 30 ml.png',
  'editorial-evening': 'if need use this/1.png',
  'editorial-lasting': 'if need use this/2.png',
  'editorial-gifting': 'if need use this/3.png',
  'editorial-discover': 'if need use this/4.png',
  'editorial-essentials': 'if need use this/5.png',
  'editorial-story': 'if need use this/6.png',
  'editorial-ritual': 'if need use this/7.png'
};
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const manifest = {};
  let originalBytes = 0, optimizedBytes = 0;
  for (const [slug, relative] of Object.entries(files)) {
    const input = path.join(source, relative);
    originalBytes += fs.statSync(input).size;
    const meta = await sharp(input).metadata();
    for (const width of [400, 720, 1080]) {
      const dest = path.join(output, `${slug}-${width}.webp`);
      await sharp(input).rotate().resize({width, withoutEnlargement:true}).webp({quality:85, effort:6}).toFile(dest);
      optimizedBytes += fs.statSync(dest).size;
    }
    manifest[slug] = { width: meta.width, height: meta.height, source:relative };
  }
  fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify({images:Object.keys(files).length, originalBytes, optimizedBytes}));
})();
