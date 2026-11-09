import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  AI_DIGITAL_SOURCE_TYPE,
  applyAiProvenanceMetadata,
  applyAiWatermark,
  buildAiProvenanceXmp,
  buildAiWatermarkOverlay,
} from "./aiWatermark";

describe("buildAiWatermarkOverlay", () => {
  it("places path-based AI badge in bottom-right with readable size", () => {
    const { svg, x, y, boxWidth, boxHeight, fontSize } = buildAiWatermarkOverlay(1024, 1280);
    const text = svg.toString("utf8");
    expect(text).toContain("<path");
    expect(text).not.toContain("<text");
    expect(x + boxWidth).toBeLessThanOrEqual(1024 - 10);
    expect(y + boxHeight).toBeLessThanOrEqual(1280 - 10);
    expect(fontSize).toBeGreaterThanOrEqual(14);
    expect(boxWidth).toBeGreaterThanOrEqual(36);
    expect(boxWidth).toBeLessThan(90);
  });

  it("supports bottom-left placement", () => {
    const { x } = buildAiWatermarkOverlay(864, 1536, "bottom-left");
    expect(x).toBeGreaterThanOrEqual(10);
    expect(x).toBeLessThan(200);
  });
});

describe("applyAiWatermark", () => {
  it("rasterizes bright AI glyph pixels in the bottom-right corner", async () => {
    const base = await sharp({
      create: { width: 400, height: 500, channels: 3, background: { r: 40, g: 40, b: 40 } },
    })
      .png()
      .toBuffer();

    const marked = await applyAiWatermark(base, "png");
    const { data, info } = await sharp(marked).raw().toBuffer({ resolveWithObject: true });

    const overlay = buildAiWatermarkOverlay(info.width, info.height);
    let bright = 0;
    for (let y = overlay.y; y < overlay.y + overlay.boxHeight; y++) {
      for (let x = overlay.x; x < overlay.x + overlay.boxWidth; x++) {
        const i = (y * info.width + x) * info.channels;
        // Glyph-Pixel: deutlich heller als der dunkle Badge-Hintergrund
        if (data[i]! > 140 && data[i + 1]! > 140 && data[i + 2]! > 140) bright += 1;
      }
    }
    expect(bright).toBeGreaterThan(20);
  });
});

describe("machine-readable AI marking", () => {
  async function baseImage() {
    return sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 200, g: 160, b: 60 } } })
      .png()
      .toBuffer();
  }

  it("builds an XMP packet with the IPTC trainedAlgorithmicMedia source type", () => {
    const xmp = buildAiProvenanceXmp();
    expect(xmp).toContain("<Iptc4xmpExt:DigitalSourceType>" + AI_DIGITAL_SOURCE_TYPE + "</Iptc4xmpExt:DigitalSourceType>");
    expect(AI_DIGITAL_SOURCE_TYPE).toBe("http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia");
  });

  it.each(["png", "jpg"] as const)("embeds XMP and EXIF without a visible badge (%s)", async (format) => {
    const base = await baseImage();
    const marked = await applyAiProvenanceMetadata(base, format);
    const meta = await sharp(marked).metadata();
    expect(meta.format).toBe(format === "jpg" ? "jpeg" : "png");
    expect(meta.xmp?.toString("utf8")).toContain("trainedAlgorithmicMedia");
    if (format === "jpg") expect(meta.exif?.toString("latin1")).toContain("AI-generated");
    const original = await sharp(base).raw().toBuffer();
    const pixels = await sharp(marked).raw().toBuffer();
    if (format === "png") expect(pixels.equals(original)).toBe(true);
  });

  it("keeps the XMP marking on visibly watermarked images", async () => {
    const marked = await applyAiWatermark(await baseImage(), "png");
    expect((await sharp(marked).metadata()).xmp?.toString("utf8")).toContain("trainedAlgorithmicMedia");
  });
});
