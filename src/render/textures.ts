import * as THREE from 'three';
import { Rng } from '../game/math';

const createCanvas = (width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas is unavailable');
  return [canvas, context];
};

export const createGlowTexture = (
  color = '#ffffff',
  inner = 0.15,
  size = 128,
): THREE.CanvasTexture => {
  const [canvas, ctx] = createCanvas(size, size);
  const center = size * 0.5;
  const gradient = ctx.createRadialGradient(center, center, size * inner, center, center, center);
  gradient.addColorStop(0, color);
  gradient.addColorStop(0.22, color);
  gradient.addColorStop(0.5, 'rgba(120,220,255,0.32)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
};

const drawNebula = (
  ctx: CanvasRenderingContext2D,
  size: number,
  rng: Rng,
  hue: number,
  opacity: number,
): void => {
  const x = rng.range(size * 0.15, size * 0.85);
  const y = rng.range(size * 0.15, size * 0.85);
  const radius = rng.range(size * 0.18, size * 0.5);
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, `hsla(${hue}, 82%, 55%, ${opacity})`);
  gradient.addColorStop(0.35, `hsla(${hue + 20}, 70%, 35%, ${opacity * 0.5})`);
  gradient.addColorStop(1, 'hsla(230, 60%, 4%, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
};

const drawStar = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  alpha: number,
  color: string,
): void => {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, `rgba(255,255,255,${alpha})`);
  gradient.addColorStop(0.28, color);
  gradient.addColorStop(1, 'rgba(120,180,255,0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
};

export const createDeepSpaceCubemap = (quality: 'low' | 'medium' | 'high'): THREE.CubeTexture => {
  const size = quality === 'low' ? 384 : quality === 'high' ? 768 : 512;
  const rng = new Rng(0x51a4f11);
  const faces: HTMLCanvasElement[] = [];

  for (let face = 0; face < 6; face += 1) {
    const [canvas, ctx] = createCanvas(size, size);
    const base = ctx.createLinearGradient(0, 0, size, size);
    base.addColorStop(0, '#020309');
    base.addColorStop(0.55, '#050814');
    base.addColorStop(1, '#01020a');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);

    const hue = rng.pick([192, 218, 270, 304, 174]);
    drawNebula(ctx, size, rng, hue, 0.13);
    drawNebula(ctx, size, rng, hue + 42, 0.08);

    ctx.globalCompositeOperation = 'screen';
    const starCount = Math.floor(size * 1.55);
    for (let i = 0; i < starCount; i += 1) {
      const x = rng.range(0, size);
      const y = rng.range(0, size);
      const bright = rng.next();
      const radius = bright > 0.985 ? rng.range(2.2, 4) : rng.range(0.35, 1.5);
      const alpha = bright > 0.985 ? 0.95 : rng.range(0.18, 0.7);
      const color =
        bright > 0.97
          ? 'rgba(207,239,255,0.9)'
          : rng.next() > 0.7
            ? 'rgba(255,200,160,0.35)'
            : 'rgba(150,205,255,0.28)';
      drawStar(ctx, x, y, radius, alpha, color);
    }
    ctx.globalCompositeOperation = 'source-over';
    faces.push(canvas);
  }

  const texture = new THREE.CubeTexture(faces);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
};

export const createGalaxyTexture = (): THREE.CanvasTexture => {
  const width = 2048;
  const height = 1024;
  const [canvas, ctx] = createCanvas(width, height);
  const rng = new Rng(0x6a1a5ce);
  ctx.clearRect(0, 0, width, height);

  const centerX = width * 0.54;
  const centerY = height * 0.48;

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(-0.32);
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, width * 0.4);
  glow.addColorStop(0, 'rgba(180,225,255,0.28)');
  glow.addColorStop(0.12, 'rgba(120,160,255,0.12)');
  glow.addColorStop(0.38, 'rgba(80,95,220,0.05)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(-width * 0.55, -height * 0.55, width * 1.1, height * 1.1);

  for (let i = 0; i < 7; i += 1) {
    const radiusX = width * rng.range(0.1, 0.39);
    const radiusY = radiusX * rng.range(0.18, 0.34);
    const start = rng.range(0, Math.PI * 2);
    ctx.beginPath();
    ctx.ellipse(0, 0, radiusX, radiusY, 0, start, start + Math.PI * rng.range(1.35, 2.2));
    ctx.strokeStyle = `rgba(${rng.int(120, 210)}, ${rng.int(150, 235)}, 255, ${rng.range(0.035, 0.11)})`;
    ctx.lineWidth = rng.range(6, 28);
    ctx.filter = 'blur(8px)';
    ctx.stroke();
  }
  ctx.filter = 'none';

  ctx.globalCompositeOperation = 'screen';
  for (let arm = 0; arm < 2; arm += 1) {
    for (let i = 0; i < 260; i += 1) {
      const t = i / 260;
      const angle = t * Math.PI * 4.2 + arm * Math.PI + rng.range(-0.18, 0.18);
      const radius = t * width * 0.38;
      const x = Math.cos(angle) * radius + rng.range(-20, 20);
      const y = Math.sin(angle) * radius * 0.42 + rng.range(-12, 12);
      const alpha = (1 - t) * rng.range(0.15, 0.72);
      drawStar(ctx, x, y, rng.range(1, 5.2), alpha, 'rgba(140,190,255,0.4)');
    }
  }

  for (let i = 0; i < 1800; i += 1) {
    const angle = rng.range(0, Math.PI * 2);
    const radius = Math.sqrt(rng.next()) * width * 0.42;
    const x = Math.cos(angle) * radius + rng.range(-60, 60);
    const y = Math.sin(angle) * radius * 0.36 + rng.range(-60, 60);
    drawStar(
      ctx,
      x,
      y,
      rng.range(0.5, 2.2),
      rng.range(0.15, 0.8) * (1 - radius / (width * 0.5)),
      'rgba(170,215,255,0.3)',
    );
  }
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
};

export const createPlanetNoiseTexture = (): THREE.CanvasTexture => {
  const size = 256;
  const [canvas, ctx] = createCanvas(size, size);
  const image = ctx.createImageData(size, size);
  const rng = new Rng(0x1d0e57);
  for (let i = 0; i < image.data.length; i += 4) {
    const value = rng.range(30, 210);
    image.data[i] = value * 0.7;
    image.data[i + 1] = value * 0.9;
    image.data[i + 2] = value;
    image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
};
