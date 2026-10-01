import { createCanvas } from 'canvas';
import fs from 'fs';
import path from 'path';

function drawIcon(size, options = {}) {
  const { isForeground = false, isRound = false } = options;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  const padding = size * 0.1;

  if (!isForeground) {
    // Draw background
    ctx.fillStyle = '#192019'; // Rich dark kitchen theme canvas
    if (isRound) {
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Rounded rectangle or full square
      const rx = size * 0.22;
      ctx.beginPath();
      ctx.roundRect(0, 0, size, size, rx);
      ctx.fill();
    }

    // Soft gradient overlay
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, '#1c281c');
    gradient.addColorStop(1, '#0f170f');
    ctx.fillStyle = gradient;
    if (isRound) {
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.roundRect(0, 0, size, size, size * 0.22);
      ctx.fill();
    }
  }

  // Center scale for chef hat + utensil design
  const centerX = size / 2;
  const centerY = size / 2;

  // Draw Chef Hat Icon
  ctx.save();
  ctx.translate(centerX, centerY);
  const scale = size / 512;
  ctx.scale(scale, scale);

  // Chef Hat - Top Puffs
  ctx.fillStyle = '#17cf54'; // Vibrant green brand accent
  
  // Left puff
  ctx.beginPath();
  ctx.arc(-70, -40, 75, 0, Math.PI * 2);
  ctx.fill();

  // Right puff
  ctx.beginPath();
  ctx.arc(70, -40, 75, 0, Math.PI * 2);
  ctx.fill();

  // Center top puff
  ctx.beginPath();
  ctx.arc(0, -90, 85, 0, Math.PI * 2);
  ctx.fill();

  // Base band of hat
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(-100, 30, 200, 70, 16);
  ctx.fill();

  // Subtle accent stripes on hat band
  ctx.fillStyle = '#17cf54';
  ctx.fillRect(-80, 52, 160, 10);

  // Spoon or Spatula accent underneath
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 14;
  ctx.lineCap = 'round';

  // Spoon handle
  ctx.beginPath();
  ctx.moveTo(0, 100);
  ctx.lineTo(0, 160);
  ctx.stroke();

  // Leaf accent
  ctx.fillStyle = '#86B371';
  ctx.beginPath();
  ctx.ellipse(50, 40, 22, 12, Math.PI / 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  return canvas.toBuffer('image/png');
}

const androidResDir = path.join(process.cwd(), 'android', 'app', 'src', 'main', 'res');
const publicDir = path.join(process.cwd(), 'public');

const mipmaps = [
  { dir: 'mipmap-mdpi', size: 48 },
  { dir: 'mipmap-hdpi', size: 72 },
  { dir: 'mipmap-xhdpi', size: 96 },
  { dir: 'mipmap-xxhdpi', size: 144 },
  { dir: 'mipmap-xxxhdpi', size: 192 },
];

console.log('Generating Android Mipmap Icons...');

mipmaps.forEach(({ dir, size }) => {
  const targetDir = path.join(androidResDir, dir);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // Standard ic_launcher
  fs.writeFileSync(path.join(targetDir, 'ic_launcher.png'), drawIcon(size));
  // Round ic_launcher
  fs.writeFileSync(path.join(targetDir, 'ic_launcher_round.png'), drawIcon(size, { isRound: true }));
  // Foreground ic_launcher
  fs.writeFileSync(path.join(targetDir, 'ic_launcher_foreground.png'), drawIcon(size, { isForeground: true }));

  console.log(`Saved ${dir} (${size}x${size})`);
});

console.log('Generating Web PWA and App Icons...');

fs.writeFileSync(path.join(publicDir, 'logo.png'), drawIcon(512));
fs.writeFileSync(path.join(publicDir, 'pwa-192.png'), drawIcon(192));
fs.writeFileSync(path.join(publicDir, 'pwa-512.png'), drawIcon(512));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), drawIcon(180));

console.log('Icons generated successfully!');
