import { Canvas, SKRSContext2D, createCanvas, loadImage } from '@napi-rs/canvas';

const WIDTH = 1200;
const HEIGHT = 675;

export const CARD_FONTS = {
  modern: {
    label: 'Modern Sans',
    description: 'Clean, calm and versatile',
    family: '"Arial", "Helvetica", sans-serif',
    weight: 500,
  },
  editorial: {
    label: 'Editorial Serif',
    description: 'Elegant magazine-style lettering',
    family: '"Georgia", "Times New Roman", serif',
    weight: 400,
  },
  rounded: {
    label: 'Soft Rounded',
    description: 'Friendly and conversational',
    family: '"Trebuchet MS", "Arial Rounded MT Bold", sans-serif',
    weight: 500,
  },
  mono: {
    label: 'Typewriter Mono',
    description: 'Personal, raw and understated',
    family: '"Courier New", monospace',
    weight: 500,
  },
  display: {
    label: 'Bold Display',
    description: 'Loud poster-like impact',
    family: '"Impact", "Arial Black", sans-serif',
    weight: 700,
  },
} as const;

export const CARD_SIZES = {
  auto: {
    label: 'Smart fit',
    description: 'Balances the size around the quote',
    pixels: 66,
  },
  compact: {
    label: 'Compact · 44px',
    description: 'Best for longer messages',
    pixels: 44,
  },
  medium: {
    label: 'Medium · 58px',
    description: 'A balanced everyday size',
    pixels: 58,
  },
  large: {
    label: 'Large · 76px',
    description: 'Strong and expressive',
    pixels: 76,
  },
  huge: {
    label: 'Huge · 96px',
    description: 'For very short quotes',
    pixels: 96,
  },
} as const;

export const CARD_COLOURS = {
  auto: {
    label: 'Automatic',
    description: 'Adapts to the selected look',
    value: 'auto',
  },
  pearl: {
    label: 'Pearl',
    description: 'Soft white',
    value: '#f7f3ec',
  },
  ink: {
    label: 'Ink',
    description: 'Deep near-black',
    value: '#16161a',
  },
  rose: {
    label: 'Rose',
    description: 'Warm muted pink',
    value: '#ffb4c8',
  },
  sky: {
    label: 'Electric Sky',
    description: 'Bright cool blue',
    value: '#8bd5ff',
  },
  citrus: {
    label: 'Citrus',
    description: 'Fresh golden yellow',
    value: '#ffd76a',
  },
  mint: {
    label: 'Mint',
    description: 'Soft vivid green',
    value: '#9fffc5',
  },
  violet: {
    label: 'Violet',
    description: 'Dreamy lavender',
    value: '#c9b6ff',
  },
} as const;

export const CARD_LOOKS = {
  'split-original': {
    label: 'Cinematic Split',
    description: 'Image left, quote right · original',
    layout: 'split',
    effect: 'original',
  },
  'split-mono': {
    label: 'Noir Split',
    description: 'Image left, quote right · grayscale',
    layout: 'split',
    effect: 'grayscale',
  },
  'split-warm': {
    label: 'Golden Hour',
    description: 'Cinematic split · warm film',
    layout: 'split',
    effect: 'warm',
  },
  'spotlight-original': {
    label: 'Full-Bleed Spotlight',
    description: 'Immersive background · original',
    layout: 'spotlight',
    effect: 'original',
  },
  'spotlight-dream': {
    label: 'Dream Sequence',
    description: 'Immersive background · soft blur',
    layout: 'spotlight',
    effect: 'blur',
  },
  'spotlight-cool': {
    label: 'Midnight Blue',
    description: 'Immersive background · cool grade',
    layout: 'spotlight',
    effect: 'cool',
  },
  'poster-duotone': {
    label: 'Duotone Poster',
    description: 'Graphic cyan and violet treatment',
    layout: 'poster',
    effect: 'duotone',
  },
  'poster-pixel': {
    label: 'Pixel Memory',
    description: 'Chunky retro image treatment',
    layout: 'poster',
    effect: 'pixel',
  },
  'editorial-paper': {
    label: 'Sunday Editorial',
    description: 'Warm paper and restrained image',
    layout: 'editorial',
    effect: 'grayscale',
  },
  'minimal-ink': {
    label: 'Quiet Ink',
    description: 'Dark, minimal and image-free',
    layout: 'minimal',
    effect: 'original',
  },
  'minimal-paper': {
    label: 'Quiet Paper',
    description: 'Light, minimal and image-free',
    layout: 'paper',
    effect: 'original',
  },
} as const;

type FontKey = keyof typeof CARD_FONTS;
type SizeKey = keyof typeof CARD_SIZES;
type ColourKey = keyof typeof CARD_COLOURS;
type LookKey = keyof typeof CARD_LOOKS;
type Layout = (typeof CARD_LOOKS)[LookKey]['layout'];
type Effect = (typeof CARD_LOOKS)[LookKey]['effect'];

export type CardOptions = {
  quote: string;
  credit: string;
  font: FontKey;
  size: SizeKey;
  colour: ColourKey;
  look: LookKey;
};

export type RenderQuoteCardOptions = CardOptions & {
  primaryImage?: Buffer;
  avatarImage?: Buffer;
};

type TextArea = {
  x: number;
  y: number;
  width: number;
  height: number;
  align: CanvasTextAlign;
  vertical: 'top' | 'middle' | 'bottom';
};

export async function renderQuoteCard(options: RenderQuoteCardOptions): Promise<Buffer> {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  const look = CARD_LOOKS[options.look];
  const [primary, avatar] = await Promise.all([
    options.primaryImage ? safeLoadImage(options.primaryImage) : undefined,
    options.avatarImage ? safeLoadImage(options.avatarImage) : undefined,
  ]);
  const image = primary || avatar;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const textArea = drawLayout(ctx, canvas, look.layout, look.effect, image, avatar);
  const colour = resolveTextColour(options.colour, look.layout);

  drawQuote(ctx, options, textArea, colour);
  drawBrandMark(ctx, look.layout, colour);

  return canvas.encode('png');
}

async function safeLoadImage(data: Buffer) {
  try {
    return await loadImage(data);
  } catch {
    return undefined;
  }
}

function drawLayout(
  ctx: SKRSContext2D,
  canvas: Canvas,
  layout: Layout,
  effect: Effect,
  image: Awaited<ReturnType<typeof loadImage>> | undefined,
  avatar: Awaited<ReturnType<typeof loadImage>> | undefined,
): TextArea {
  if (layout === 'split') {
    fillGradient(ctx, ['#090b12', '#030305'], 0);
    const imageWidth = 590;
    if (image) drawImageCover(ctx, image, 0, 0, imageWidth, HEIGHT, effect);
    else drawAbstractBackdrop(ctx, 0, 0, imageWidth, HEIGHT);

    const fade = ctx.createLinearGradient(330, 0, 640, 0);
    fade.addColorStop(0, 'rgba(3, 3, 5, 0)');
    fade.addColorStop(1, '#030305');
    ctx.fillStyle = fade;
    ctx.fillRect(330, 0, 310, HEIGHT);

    return { x: 570, y: 92, width: 550, height: 485, align: 'center', vertical: 'middle' };
  }

  if (layout === 'spotlight') {
    if (image) drawImageCover(ctx, image, 0, 0, WIDTH, HEIGHT, effect);
    else drawAbstractBackdrop(ctx, 0, 0, WIDTH, HEIGHT);

    const shade = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    shade.addColorStop(0, 'rgba(5, 7, 15, .2)');
    shade.addColorStop(0.45, 'rgba(5, 7, 15, .45)');
    shade.addColorStop(1, 'rgba(3, 3, 7, .94)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const lowerShade = ctx.createLinearGradient(0, 220, 0, HEIGHT);
    lowerShade.addColorStop(0, 'rgba(0,0,0,0)');
    lowerShade.addColorStop(1, 'rgba(0,0,0,.65)');
    ctx.fillStyle = lowerShade;
    ctx.fillRect(0, 220, WIDTH, HEIGHT - 220);

    return { x: 90, y: 110, width: 840, height: 440, align: 'left', vertical: 'bottom' };
  }

  if (layout === 'poster') {
    fillGradient(ctx, ['#12122b', '#5b2c83', '#00a8a8'], 0.35);
    addFilmGrain(ctx, 0.06);

    ctx.fillStyle = 'rgba(255,255,255,.07)';
    ctx.beginPath();
    ctx.arc(1010, 115, 270, 0, Math.PI * 2);
    ctx.fill();

    if (image) {
      ctx.save();
      roundedRect(ctx, 730, 78, 390, 519, 28);
      ctx.clip();
      drawImageCover(ctx, image, 730, 78, 390, 519, effect);
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,.3)';
      ctx.lineWidth = 2;
      roundedRect(ctx, 730, 78, 390, 519, 28);
      ctx.stroke();
    }

    return { x: 78, y: 88, width: image ? 590 : 950, height: 500, align: 'left', vertical: 'middle' };
  }

  if (layout === 'editorial') {
    ctx.fillStyle = '#eee7dc';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = '#dfd4c4';
    ctx.fillRect(0, 0, 28, HEIGHT);
    addFilmGrain(ctx, 0.035);

    if (image) {
      ctx.save();
      roundedRect(ctx, 760, 52, 384, 571, 4);
      ctx.clip();
      drawImageCover(ctx, image, 760, 52, 384, 571, effect);
      ctx.fillStyle = 'rgba(155, 116, 73, .13)';
      ctx.fillRect(760, 52, 384, 571);
      ctx.restore();
    }

    ctx.fillStyle = '#b19b7d';
    ctx.fillRect(76, 66, 64, 5);
    return { x: 76, y: 105, width: image ? 610 : 1020, height: 460, align: 'left', vertical: 'middle' };
  }

  if (layout === 'paper') {
    ctx.fillStyle = '#f2eee7';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    addFilmGrain(ctx, 0.028);
    drawAvatarMedallion(ctx, avatar, 600, 112, '#2d2925');
    return { x: 145, y: 180, width: 910, height: 360, align: 'center', vertical: 'middle' };
  }

  fillGradient(ctx, ['#0a0b10', '#171524', '#08090e'], 0.2);
  addFilmGrain(ctx, 0.045);
  drawAvatarMedallion(ctx, avatar, 600, 112, '#d2c8ff');
  return { x: 145, y: 180, width: 910, height: 360, align: 'center', vertical: 'middle' };
}

function drawQuote(
  ctx: SKRSContext2D,
  options: RenderQuoteCardOptions,
  area: TextArea,
  colour: string,
): void {
  const font = CARD_FONTS[options.font];
  let fontSize = options.size === 'auto'
    ? smartFontSize(options.quote)
    : CARD_SIZES[options.size].pixels;

  const maxLines = 7;
  let lines: string[] = [];

  while (fontSize >= 30) {
    ctx.font = `${font.weight} ${fontSize}px ${font.family}`;
    lines = wrapText(ctx, options.quote, area.width);
    const lineHeight = fontSize * 1.16;
    if (lines.length <= maxLines && lines.length * lineHeight <= area.height - 72) break;
    fontSize -= 3;
  }

  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    lines[maxLines - 1] = `${lines[maxLines - 1]!.replace(/[.…]+$/, '')}…`;
  }

  const lineHeight = fontSize * 1.16;
  const creditSize = Math.max(22, Math.min(30, fontSize * 0.42));
  const creditGap = options.credit ? 30 + creditSize : 0;
  const contentHeight = lines.length * lineHeight + creditGap;

  let startY = area.y;
  if (area.vertical === 'middle') startY += (area.height - contentHeight) / 2;
  if (area.vertical === 'bottom') startY += area.height - contentHeight;

  ctx.textAlign = area.align;
  ctx.textBaseline = 'top';
  ctx.fillStyle = colour;
  ctx.font = `${font.weight} ${fontSize}px ${font.family}`;
  ctx.shadowColor = isLightColour(colour) ? 'rgba(0,0,0,.48)' : 'rgba(255,255,255,.12)';
  ctx.shadowBlur = area.align === 'left' ? 12 : 8;
  ctx.shadowOffsetY = 2;

  const drawX =
    area.align === 'center'
      ? area.x + area.width / 2
      : area.align === 'right'
        ? area.x + area.width
        : area.x;

  for (const [index, line] of lines.entries()) {
    ctx.fillText(line, drawX, startY + index * lineHeight);
  }

  ctx.shadowColor = 'transparent';
  if (!options.credit) return;

  const creditY = startY + lines.length * lineHeight + 21;
  ctx.font = `600 ${creditSize}px ${CARD_FONTS.modern.family}`;
  ctx.globalAlpha = 0.8;
  ctx.fillText(`— ${options.credit}`, drawX, creditY);
  ctx.globalAlpha = 1;
}

function wrapText(ctx: SKRSContext2D, input: string, maxWidth: number): string[] {
  const paragraphs = input.replace(/\r/g, '').split('\n');
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      if (lines.length) lines.push('');
      continue;
    }

    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth) {
        current = candidate;
        continue;
      }

      if (current) lines.push(current);
      if (ctx.measureText(word).width <= maxWidth) {
        current = word;
      } else {
        const chunks = breakLongWord(ctx, word, maxWidth);
        lines.push(...chunks.slice(0, -1));
        current = chunks.at(-1) || '';
      }
    }
    if (current) lines.push(current);
  }

  return lines.length ? lines : [''];
}

function breakLongWord(
  ctx: SKRSContext2D,
  word: string,
  maxWidth: number,
): string[] {
  const characters = [...word];
  const chunks: string[] = [];
  let current = '';

  for (const character of characters) {
    if (current && ctx.measureText(current + character).width > maxWidth) {
      chunks.push(current);
      current = character;
    } else {
      current += character;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function smartFontSize(quote: string): number {
  const length = [...quote].length;
  if (length <= 45) return 86;
  if (length <= 90) return 70;
  if (length <= 170) return 56;
  if (length <= 280) return 46;
  return 38;
}

function resolveTextColour(colour: ColourKey, layout: Layout): string {
  if (colour !== 'auto') return CARD_COLOURS[colour].value;
  return layout === 'editorial' || layout === 'paper' ? '#1c1a18' : '#f5f2ec';
}

function drawImageCover(
  ctx: SKRSContext2D,
  image: Awaited<ReturnType<typeof loadImage>>,
  x: number,
  y: number,
  width: number,
  height: number,
  effect: Effect,
): void {
  const scale = Math.max(width / image.width, height / image.height);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (image.width - sourceWidth) / 2;
  const sourceY = (image.height - sourceHeight) / 2;

  if (effect === 'pixel') {
    const pixelCanvas = createCanvas(52, Math.max(30, Math.round((52 * height) / width)));
    const pixelCtx = pixelCanvas.getContext('2d');
    pixelCtx.imageSmoothingEnabled = true;
    pixelCtx.drawImage(
      image,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      pixelCanvas.width,
      pixelCanvas.height,
    );
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(pixelCanvas, x, y, width, height);
    ctx.restore();
    return;
  }

  ctx.save();
  if (effect === 'grayscale') ctx.filter = 'grayscale(1) contrast(1.06)';
  if (effect === 'warm') ctx.filter = 'sepia(.32) saturate(1.22) contrast(1.04)';
  if (effect === 'cool') ctx.filter = 'saturate(.82) hue-rotate(168deg) contrast(1.08)';
  if (effect === 'blur') ctx.filter = 'blur(10px) saturate(.8)';
  if (effect === 'duotone') ctx.filter = 'grayscale(1) contrast(1.28)';

  const overscan = effect === 'blur' ? 18 : 0;
  ctx.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    x - overscan,
    y - overscan,
    width + overscan * 2,
    height + overscan * 2,
  );
  ctx.restore();

  if (effect === 'warm') {
    ctx.fillStyle = 'rgba(255, 133, 62, .13)';
    ctx.fillRect(x, y, width, height);
  }
  if (effect === 'cool') {
    ctx.fillStyle = 'rgba(36, 76, 160, .2)';
    ctx.fillRect(x, y, width, height);
  }
  if (effect === 'duotone') {
    ctx.save();
    ctx.globalCompositeOperation = 'color';
    const duo = ctx.createLinearGradient(x, y, x + width, y + height);
    duo.addColorStop(0, '#23d5d5');
    duo.addColorStop(1, '#9b4dff');
    ctx.fillStyle = duo;
    ctx.fillRect(x, y, width, height);
    ctx.restore();
  }
}

function drawAvatarMedallion(
  ctx: SKRSContext2D,
  avatar: Awaited<ReturnType<typeof loadImage>> | undefined,
  centerX: number,
  centerY: number,
  ringColour: string,
): void {
  const radius = 46;
  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.clip();
  if (avatar) {
    drawImageCover(
      ctx,
      avatar,
      centerX - radius,
      centerY - radius,
      radius * 2,
      radius * 2,
      'original',
    );
  } else {
    ctx.fillStyle = '#34313d';
    ctx.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);
  }
  ctx.restore();

  ctx.beginPath();
  ctx.arc(centerX, centerY, radius + 5, 0, Math.PI * 2);
  ctx.strokeStyle = ringColour;
  ctx.lineWidth = 3;
  ctx.stroke();
}

function fillGradient(
  ctx: SKRSContext2D,
  colours: readonly string[],
  diagonal: number,
): void {
  const gradient = ctx.createLinearGradient(
    WIDTH * diagonal,
    0,
    WIDTH * (1 - diagonal),
    HEIGHT,
  );
  colours.forEach((colour, index) => {
    gradient.addColorStop(index / (colours.length - 1), colour);
  });
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function drawAbstractBackdrop(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
  gradient.addColorStop(0, '#23334e');
  gradient.addColorStop(0.52, '#4f315b');
  gradient.addColorStop(1, '#11121b');
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, width, height);

  ctx.fillStyle = 'rgba(113, 224, 255, .18)';
  ctx.beginPath();
  ctx.arc(x + width * 0.25, y + height * 0.25, width * 0.36, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 154, 211, .15)';
  ctx.beginPath();
  ctx.arc(x + width * 0.78, y + height * 0.72, width * 0.43, 0, Math.PI * 2);
  ctx.fill();
  addFilmGrain(ctx, 0.04, x, y, width, height);
}

function addFilmGrain(
  ctx: SKRSContext2D,
  opacity: number,
  x = 0,
  y = 0,
  width = WIDTH,
  height = HEIGHT,
): void {
  ctx.save();
  ctx.globalAlpha = opacity;
  for (let index = 0; index < 2_000; index += 1) {
    const shade = Math.random() > 0.5 ? 255 : 0;
    ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    const size = Math.random() > 0.92 ? 2 : 1;
    ctx.fillRect(x + Math.random() * width, y + Math.random() * height, size, size);
  }
  ctx.restore();
}

function drawBrandMark(
  ctx: SKRSContext2D,
  layout: Layout,
  textColour: string,
): void {
  const darkText = layout === 'editorial' || layout === 'paper';
  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = darkText ? '#201d19' : textColour;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `600 16px ${CARD_FONTS.modern.family}`;
  ctx.fillText('QUOTED', WIDTH - 34, HEIGHT - 28);
  ctx.restore();
}

function roundedRect(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function isLightColour(colour: string): boolean {
  if (!colour.startsWith('#') || colour.length !== 7) return true;
  const red = Number.parseInt(colour.slice(1, 3), 16);
  const green = Number.parseInt(colour.slice(3, 5), 16);
  const blue = Number.parseInt(colour.slice(5, 7), 16);
  return red * 0.299 + green * 0.587 + blue * 0.114 > 150;
}
