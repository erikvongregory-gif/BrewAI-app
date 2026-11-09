import sharp, { type Sharp } from "sharp";

export type AiWatermarkCorner = "bottom-right" | "bottom-left";

const METADATA_DESCRIPTION = "AI-generated image (EU AI Act Art. 50 transparency marking)";

/**
 * „AI“ als Pfade — kein System-Font (librsvg rendert `<text>` auf Serverless oft als leeren Kasten).
 * Dünne Striche, dezent — nur so sichtbar wie Art. 50 verlangt.
 * viewBox 0 0 100 56.
 */
function aiLabelGlyphPaths(): string {
  return `
  <g fill="none" stroke="#ffffff" stroke-linecap="round" stroke-linejoin="round">
    <path stroke-width="3.6" d="M16 44 L32 12 L48 44"/>
    <path stroke-width="3" d="M23 30 H41"/>
    <path stroke-width="3.8" d="M70 14 V42"/>
  </g>`;
}

/** Dezentes „AI“-Label unten — erkennbar, nicht dominant. */
export function buildAiWatermarkOverlay(width: number, height: number, corner: AiWatermarkCorner = "bottom-right") {
  const scale = Math.min(width, height);
  // ~2% der kürzeren Kante — klein, aber noch lesbar
  const fontSize = Math.max(14, Math.round(scale * 0.02));
  const padX = Math.round(fontSize * 0.42);
  const padY = Math.round(fontSize * 0.28);
  const margin = Math.max(10, Math.round(scale * 0.014));
  const glyphW = Math.round(fontSize * 1.85);
  const glyphH = Math.round(fontSize * 1.05);
  const boxWidth = glyphW + padX * 2;
  const boxHeight = glyphH + padY * 2;
  const radius = Math.round(fontSize * 0.22);

  const x = corner === "bottom-right" ? width - boxWidth - margin : margin;
  const y = height - boxHeight - margin;

  const svg = `<svg width="${boxWidth}" height="${boxHeight}" viewBox="0 0 ${boxWidth} ${boxHeight}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${boxWidth}" height="${boxHeight}" rx="${radius}"
    fill="rgba(20,18,14,0.4)" stroke="rgba(255,255,255,0.2)" stroke-width="0.75"/>
  <svg x="${padX}" y="${padY}" width="${glyphW}" height="${glyphH}" viewBox="0 0 100 56" preserveAspectRatio="xMidYMid meet">
    ${aiLabelGlyphPaths()}
  </svg>
</svg>`;

  return { svg: Buffer.from(svg), boxWidth, boxHeight, x, y, fontSize };
}

/** IPTC-Vokabular „Created using Generative AI“ (cv.iptc.org/newscodes/digitalsourcetype). */
export const AI_DIGITAL_SOURCE_TYPE = "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia";

/**
 * XMP-Paket mit IPTC DigitalSourceType – das Feld, das u. a. Plattformen zur Erkennung
 * KI-generierter Bilder auswerten. Ergänzt die EXIF-Beschreibung um einen Standardwert.
 */
export function buildAiProvenanceXmp(): string {
  return [
    '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>',
    '<x:xmpmeta xmlns:x="adobe:ns:meta/">',
    '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
    '<rdf:Description rdf:about="" xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/" xmlns:dc="http://purl.org/dc/elements/1.1/">',
    `<Iptc4xmpExt:DigitalSourceType>${AI_DIGITAL_SOURCE_TYPE}</Iptc4xmpExt:DigitalSourceType>`,
    `<dc:description><rdf:Alt><rdf:li xml:lang="x-default">${METADATA_DESCRIPTION}</rdf:li></rdf:Alt></dc:description>`,
    "</rdf:Description>",
    "</rdf:RDF>",
    "</x:xmpmeta>",
    '<?xpacket end="w"?>',
  ].join("");
}

function withAiProvenance(image: Sharp): Sharp {
  return image
    .withMetadata({
      exif: {
        IFD0: {
          ImageDescription: METADATA_DESCRIPTION,
          Copyright: "AI-generated",
        },
      },
    })
    .withXmp(buildAiProvenanceXmp());
}

function encode(pipeline: Sharp, outputFormat: "png" | "jpg"): Promise<Buffer> {
  return outputFormat === "jpg" ? pipeline.jpeg({ quality: 92 }).toBuffer() : pipeline.png().toBuffer();
}

/**
 * Nur maschinenlesbare KI-Kennzeichnung (EXIF + XMP), ohne sichtbares Label.
 * Für Bilder ohne sichtbares „AI“-Badge gedacht, damit die Kennzeichnung nicht vom
 * Nutzerschalter abhängt (vgl. Art. 50 Abs. 2 KI-VO).
 */
export async function applyAiProvenanceMetadata(buffer: Buffer, outputFormat: "png" | "jpg" = "png"): Promise<Buffer> {
  return encode(withAiProvenance(sharp(buffer)), outputFormat);
}

/** Sichtbares AI-Label + maschinenlesbare Metadaten (EXIF-Beschreibung und IPTC-XMP). */
export async function applyAiWatermark(
  buffer: Buffer,
  outputFormat: "png" | "jpg" = "png",
  corner: AiWatermarkCorner = "bottom-right",
): Promise<Buffer> {
  const image = sharp(buffer);
  const meta = await image.metadata();
  const width = meta.width ?? 1024;
  const height = meta.height ?? 1024;
  const overlay = buildAiWatermarkOverlay(width, height, corner);

  const badgePng = await sharp(overlay.svg).png().toBuffer();

  const pipeline = withAiProvenance(image.composite([{ input: badgePng, top: overlay.y, left: overlay.x }]));

  return encode(pipeline, outputFormat);
}
