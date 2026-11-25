import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { prepareProductImage } from "./product-image-prep";

async function bottleOn(background: { r: number; g: number; b: number; alpha: number }) {
  const bottle = await sharp({
    create: { width: 60, height: 200, channels: 4, background: { r: 90, g: 50, b: 20, alpha: 1 } },
  })
    .png()
    .toBuffer();
  return sharp({ create: { width: 400, height: 400, channels: 4, background } })
    .composite([{ input: bottle, left: 170, top: 100 }])
    .png()
    .toBuffer();
}

async function pixel(buffer: Buffer, x: number, y: number) {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  const offset = (y * info.width + x) * info.channels;
  return [data[offset], data[offset + 1], data[offset + 2]];
}

describe("prepareProductImage", () => {
  it("stellt einen Packshot auf farbigem Hintergrund frei und schneidet eng zu", async () => {
    const prepared = await prepareProductImage(await bottleOn({ r: 230, g: 214, b: 190, alpha: 1 }));
    expect(prepared?.cutout).toBe(true);
    // 60 × 200 Flasche + 6 % Rand statt 400 × 400 Leinwand.
    expect(prepared!.width).toBeLessThan(100);
    expect(prepared!.height).toBeLessThan(240);
    expect(await pixel(prepared!.buffer, 2, 2)).toEqual([255, 255, 255]);
  });

  it("behält bis 2048 px Kantenlänge, damit Kleingedrucktes lesbar bleibt", async () => {
    const noise = Buffer.alloc(2400 * 600 * 3);
    for (let i = 0; i < noise.length; i++) noise[i] = (i * 7919) % 251;
    const photo = await sharp(noise, { raw: { width: 600, height: 2400, channels: 3 } }).jpeg().toBuffer();
    const prepared = await prepareProductImage(photo);
    expect(prepared?.height).toBe(2048);
    expect(prepared?.width).toBe(512);
  });

  it("legt transparente PNGs auf Weiß statt Schwarz", async () => {
    const prepared = await prepareProductImage(await bottleOn({ r: 0, g: 0, b: 0, alpha: 0 }));
    expect(prepared?.cutout).toBe(true);
    const [r, g, b] = await pixel(prepared!.buffer, 2, 2);
    expect(Math.min(r!, g!, b!)).toBeGreaterThan(245);
  });

  it("lässt echte Fotos mit unruhigem Hintergrund unverändert", async () => {
    const noise = Buffer.alloc(300 * 300 * 3);
    for (let i = 0; i < noise.length; i++) noise[i] = (i * 7919) % 251;
    const photo = await sharp(noise, { raw: { width: 300, height: 300, channels: 3 } }).png().toBuffer();
    const prepared = await prepareProductImage(photo);
    expect(prepared?.cutout).toBe(false);
    expect(prepared?.width).toBe(300);
  });

  it("schneidet bei zwei Flaschen auf einem Foto die passende Größe aus", async () => {
    const brown = { r: 90, g: 50, b: 20, alpha: 1 };
    const tall = await sharp({ create: { width: 60, height: 260, channels: 4, background: brown } }).png().toBuffer();
    const small = await sharp({ create: { width: 50, height: 180, channels: 4, background: brown } }).png().toBuffer();
    const photo = await sharp({ create: { width: 400, height: 400, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
      .composite([
        { input: tall, left: 80, top: 70 },
        { input: small, left: 240, top: 150 },
      ])
      .png()
      .toBuffer();
    const smallCut = await prepareProductImage(photo, { rank: 0, of: 2 });
    const tallCut = await prepareProductImage(photo, { rank: 1, of: 2 });
    expect(smallCut!.height).toBeLessThan(220);
    expect(smallCut!.width).toBeLessThan(80);
    expect(tallCut!.height).toBeGreaterThan(260);
    // Erwartet 3 Flaschen, Foto zeigt 2 → ganzes Bild behalten.
    expect((await prepareProductImage(photo, { rank: 0, of: 3 }))!.width).toBeGreaterThan(200);
  });

  it("liefert null für Dateien, die kein Bild sind", async () => {
    expect(await prepareProductImage(Buffer.from("<html>404</html>"))).toBeNull();
  });
});
