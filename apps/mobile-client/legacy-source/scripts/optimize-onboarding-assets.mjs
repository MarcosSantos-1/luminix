import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(__dirname, '..', 'assets');
const rootLogo = path.join(__dirname, '..', '..', 'assets', 'logo.png');
const heroIn = path.join(assets, 'hero-autocuidado.png');

async function logoTransparent() {
  const { data, info } = await sharp(rootLogo)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    // Fundo preto (baixa luminância + baixa saturação) → transparente
    if (lum < 40 && sat < 25) {
      data[i + 3] = 0;
    }
  }

  await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toFile(path.join(assets, 'logo-transparent.png'));

  console.log('logo-transparent.png ok');
}

async function compressHero() {
  const meta = await sharp(heroIn).metadata();
  console.log('hero before', meta.width, meta.height);

  // Versão de tela (~2x de um phone largo), JPEG bem comprimido
  await sharp(heroIn)
    .resize(1440, null, { withoutEnlargement: true })
    .jpeg({ quality: 78, mozjpeg: true })
    .toFile(path.join(assets, 'hero-autocuidado.jpg'));

  const fs = await import('fs');
  const before = fs.statSync(heroIn).size;
  const after = fs.statSync(path.join(assets, 'hero-autocuidado.jpg')).size;
  console.log(
    'hero after',
    (after / 1024).toFixed(0) + 'KB',
    '(was',
    (before / 1024).toFixed(0) + 'KB)'
  );
}

await logoTransparent();
await compressHero();
console.log('done');
