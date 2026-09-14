import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(__dirname, '..', 'assets');
const logo = path.join(assets, 'logo.png');

const bg = { r: 253, g: 247, b: 244, alpha: 1 };

async function compositeOnCanvas(size, logoSize, background, outFile) {
  const logoBuf = await sharp(logo)
    .resize(logoSize, logoSize, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  await sharp({
    create: { width: size, height: size, channels: 4, background },
  })
    .composite([{ input: logoBuf, gravity: 'centre' }])
    .png()
    .toFile(path.join(assets, outFile));
}

const meta = await sharp(logo).metadata();
console.log('logo', meta.width, meta.height);

await compositeOnCanvas(1024, 720, bg, 'icon.png');
await compositeOnCanvas(1024, 620, { r: 0, g: 0, b: 0, alpha: 0 }, 'adaptive-icon.png');

const splashLogo = await sharp(logo)
  .resize(520, 520, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();

await sharp({
  create: { width: 1284, height: 2778, channels: 4, background: bg },
})
  .composite([{ input: splashLogo, gravity: 'centre' }])
  .png()
  .toFile(path.join(assets, 'splash-icon.png'));

await sharp(logo)
  .resize(48, 48, { fit: 'contain', background: bg })
  .png()
  .toFile(path.join(assets, 'favicon.png'));

console.log('icons generated');
