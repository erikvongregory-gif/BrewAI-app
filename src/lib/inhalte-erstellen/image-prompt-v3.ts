import type { HyperrealisticInput } from "@/app/(dashboard)/inhalte-erstellen/lib/schemas";
import { BEER_STYLE_OPTIONS, correctAlcoholFreeStyle, inferBierstilFromName, resolveGlasTyp } from "@/app/(dashboard)/inhalte-erstellen/lib/beer-styles";
import { FLASCHEN_TYPEN, GLAS_TYPEN, containerMaterialPhrase, flascheVolumeMl, glassHasEichstrich, pouredGlassFillMl } from "@/app/(dashboard)/inhalte-erstellen/lib/brewing-knowledge";
// Only beverage data/resolvers are reused. No photographic locks or legacy builders.
import { customerSceneText, resolveBeerClarity, resolveBeerPhysics, lemonadeColorFromName, waterCarbonationFromName } from "@/app/(dashboard)/inhalte-erstellen/lib/prompt-builders/hyperrealism-blocks";

export type V3Reference = { index: number; role: "product" | "shape" | "glass" | "liquid" | "character" | "scene" | "look" };
export type ImagePromptV3Args = {
  beerAppearance?: import("@/lib/beverages/beer-appearance").BeerPhysicsProfile;
  input: HyperrealisticInput;
  references: V3Reference[];
  breweryName?: string;
  labelText?: string[];
  social?: boolean;
  character?: { name?: string; role?: string; appearanceLock?: string };
};

/** V3 direction for older free-form APIs; never invent a beer style or container. */
export function buildFreeformImagePromptV3(args: {
  scene: string;
  imageType: "hyperreal" | "product_cutout" | "product_studio" | "campaign_social";
  aspectRatio?: string;
  referenceCount?: number;
  brandContext?: string;
  strictLabel?: boolean;
}): string {
  const treatment = args.imageType === "campaign_social" ? V3_PHOTO_PRESETS.campaign : V3_PHOTO_PRESETS.premium;
  return [
    "IMAGE DIRECTION V3",
    `CUSTOMER SCENE (authoritative): ${args.scene}`,
    args.imageType === "product_cutout"
      ? "Isolate the referenced product. Preserve its original shape, artwork and material; no people, props or added scene. Use the requested background."
      : `PHOTOGRAPHY: ${treatment}`,
    "Customer instructions determine action, location, people, clothing, camera and light. Do not infer cultural dress, props, casting or setting from the brand or photographic preset. Explicit customer instructions override photographic defaults.",
    args.referenceCount ? `Use the ${args.referenceCount} supplied references only for the identities and roles the customer explicitly requests. Product artwork is not a source of people, wardrobe, setting or lighting.` : "Invent original identities and artwork only where requested.",
    args.strictLabel ? "Preserve the referenced product's exact logo, label words, typography and artwork, legible on its actual curved surface." : "",
    args.brandContext ? `BRAND CONTEXT (only brand identity and requested artwork, never scene or casting): ${args.brandContext}` : "",
    "All subjects share coherent exposure, lighting and optical depth. Preserve natural skin, plausible anatomy, real product scale, grips, reflections and material texture without synthetic glow or sharpening artifacts. Alcohol is held or consumed only by adults.",
    args.aspectRatio ? `Format: ${args.aspectRatio}.` : "",
  ].filter(Boolean).join("\n\n");
}

/** Presets define photographic technique only, never casting, wardrobe, location or action. */
export const V3_PHOTO_PRESETS = {
  reportage: "Candid snapshot photography: a spontaneous 35mm point-and-shoot flash photograph, taken from inside the moment rather than arranged for an advertisement. Direct on-camera flash is the dominant light on nearby subjects, including in daylight: small hard shadows behind objects, bright near-field highlights, rapid falloff and a darker ambient background. Crisp flash-frozen motion, blunt frontal illumination and natural unretouched skin. Handheld, slightly tilted and off-centre framing, with an imperfect crop and incidental foreground overlap when the existing customer scene allows it. When human subjects are requested, catch them mid-action, mid-laugh or mid-sentence rather than posed for the camera; partial figures may fall outside the frame. The product belongs naturally to the customer action, not an isolated hero product or a styled table arrangement. Restrained film-snapshot color, believable flash highlights and ambient shadows; no polished editorial color grade, beauty lighting or cinematic rim light unless the customer explicitly asks for them. Use the generous depth of field of a compact-camera snapshot. For environmental or full-body framing, use a moderately wide lens and sufficient depth of field to resolve the subjects and the ground around their feet together; do not apply portrait-mode background blur to nearby ground. If grass is already present, resolve irregular individual blades and tufts, uneven growth, subtle green and dry tones, small gaps and contact shadows at the visible scale. If gravel or stone is already present, resolve separate irregular stones, plausible edges, sizes, gaps and contact shadows, with detail decreasing naturally into the distance. Ground texture must remain coherent across the focal plane, without localized soft patches, melted grass, smeared gravel, repeated texture stamps or waxy denoising. Allow gradual optical softness only with real focus distance; preserve natural texture without crunchy sharpening or making every distant surface equally sharp. These rules describe existing surfaces only and must not add grass, gravel or scenery to the customer scene. Keep readable product artwork and coherent material detail, without turning the moment into studio photography. Snapshot character comes from flash, timing, framing and color, not low resolution, smeared textures or artificial blur. Do not add subjects, props or actions merely to demonstrate this treatment.",
  premium: "Natural, high-quality editorial photography with the texture and optical character of a real full-frame camera. Treat it as one frame from a commissioned on-location image shoot by a working photographer, not a stock or advertising render. Light it the way such a shoot is lit: one large soft key source from one side of the camera (open shade, a window, an overcast sky, or a single softbox imitating it), the far side of faces and objects about one stop darker, the background one to two stops below the subject, and no flat frontal fill. When human subjects are requested, they know the photographer is there and have been given simple direction: a settled, comfortable stance or seat, shoulders slightly turned, relaxed hands, a calm look or a small unforced smile toward the lens or just beside it, eyes in the focal plane with a single natural catchlight from the key source. Several subjects are staggered in depth and height rather than lined up, each with a different posture and expression. Frame at eye level with real headroom and a slightly off-centre subject, the surroundings still recognisable behind them. Choose one lens and aperture suited to the customer composition: an 85mm prime around f/2–f/2.8 for a close subject, a 50mm prime around f/2.8 for a medium view, or a 35mm lens around f/4 for an environmental view. Stop down to f/4–f/5.6 when the important subjects occupy different depths. Treat the image as one credible photographic exposure from one camera position, with consistent perspective, scale, focus and light throughout. Choose depth of field from the composition rather than automatically maximizing background blur: use a crisp main focal plane, smooth progressive focus falloff and optical bokeh only where lens, aperture and subject distance support it. In wider views, keep enough depth to resolve the important subjects and their immediate surroundings together. Never use cutout edges, portrait-mode blur masks or miniature-like selective focus. Keep the important product artwork readable within that focal plane; distant details soften according to their distance rather than a uniform blur mask. Light must come from plausible sources in the customer scene: preserve consistent shadow direction, contact shadows, occlusion and reflected color, with soft directional light and subtle fill where appropriate. Do not give every object its own beauty light. Glass must show plausible thickness, refraction, transparent overlaps and reflections of the same surroundings; liquid, foam and condensation retain their actual physical structure rather than ornamental perfection. Existing fabric follows gravity, seams and body movement; existing wood, stone and metal retain irregular texture at the camera-resolved scale. Product geometry and reference artwork stay intact; natural surface variation must not damage or rewrite labels. When human subjects are requested, use plausible posture, weight distribution, joints, fingers and grip, with believable eye alignment and expressions rather than identical smiles or mannequin poses. Preserve subtle natural facial asymmetry, individual hair strands and flyaways where resolved; do not fabricate extra body parts or fuse hands with products. When faces are visible, render individual, unretouched skin at the actual camera distance: visible pores in the focal plane, subtle uneven pigmentation, faint redness, fine expression lines and small ordinary skin irregularities. For newly invented identities, allow a few naturally placed freckles or small moles where appropriate; vary these details between individuals rather than applying the same marks to every face. Keep them subtle and anatomically plausible, never exaggerated blemishes or artificially sharpened pore patterns. For a selected character reference, preserve the existing facial features and identifying marks; do not invent new moles, scars or freckles that change that identity. Skin detail follows lighting, resolution and optical focus: do not force close-up pore detail onto distant faces or blur it away on in-focus faces. Preserve scene-consistent white balance, the selected liquid color and highlight detail, with believable tonal transitions and shadows that retain photographic depth. Use restrained photographic finishing without beauty retouching, skin smoothing, airbrushing, waxy skin, HDR halos or synthetic glow. Avoid excessive clarity, oversaturated colors, uniformly perfect surfaces, razor-sharp detail at every distance and synthetic microtexture. Any fine sensor grain must be subtle, exposure-dependent and consistent across the frame; do not add noise, scratches, light leaks or lens defects as a shortcut to authenticity. Premium quality comes from composition, light and credible optics, not immaculate retouching. These rules apply only to content requested in the customer scene; do not add subjects, props, blemishes on products or environmental clutter to demonstrate realism.",
  campaign: "Art-directed beverage advertising photography with a distinctive, memorable visual hierarchy. Translate the customer's scene into one clear visual idea through a deliberate hero framing, a purposeful camera angle, controlled foreground and background layers and clean negative space where the composition benefits from it. Direct attention to the selected product through composition, local contrast and focus while preserving its real size. Choose one full-frame lens suited to the framing: 35mm for an immersive wide view, 50mm for a natural medium view, or 85mm for a compressed close detail; use f/2.8–f/4 for selective focus and f/5.6 when more depth must stay readable. Use a shaped directional key light, controlled fill or negative fill for dimensional shadows, and a subtle edge light only when physically motivated by the scene. Sculpt believable highlights on glass and packaging while keeping the label readable and reflections coherent with the surroundings. A cohesive, restrained advertising color grade, rich tonal separation and protected highlights; skin tones and the selected beer color remain accurate. The result should feel deliberately photographed for a brand campaign, with tactile materials and optical depth, no artificial product glow, oversized packaging or composited lighting. Add no campaign text or extra props unless the customer requests them.",
} as const;

/**
 * Nur für die 4K-Stufe: Das Modell füllt die zusätzlichen Pixel sonst mit nachgeschärfter Textur
 * (helle Kantensäume, körnige Haut, verschmierte Unschärfe).
 */
export const LARGE_FORMAT_FINISHING =
  "LARGE-FORMAT FINISHING: This is a very large output that will be viewed at full size. Resolve detail the way a good lens and sensor do at this size, as an unsharpened camera file: edges are clean and slightly soft at pixel level, with no bright or dark outlines around hair, faces, glass rims or lettering. Fine texture such as skin, hair, fabric and wood is continuous and fine-grained, never gritty, crunchy or speckled. Anything outside the focal plane is smooth optical blur with soft gradual edges, not a smeared or painted surface with hard fragments in it. Where another instruction asks for crisp or sharp detail, read it as accurate focus, not added sharpening or contrast. Do not fill the extra resolution with invented micro-texture.";

const TIME: Record<HyperrealisticInput["tageszeit"], string> = {
  tageslicht: "daylight",
  goldene_stunde: "low late-afternoon sunlight",
  mittag: "midday sunlight",
  abend_warm: "evening ambient light and warm practical lamps",
  blaue_stunde: "cool twilight with practical lamps",
  nacht: "nighttime practical lighting",
};
const SHOT = {
  A: "a three-quarter view", B: "an eye-level frontal view", C: "a slight low angle",
  D: "a top-down view", E: "a close detail", F: "a wide environmental view",
  G: "an aerial view", H: "an over-the-shoulder view",
} as const;

export function normalizeV3Input<T extends HyperrealisticInput>(input: T, labelText: string[] = []): T {
  const styleKey = input.bierstil.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const aliases: Record<string, string> = {
    dunkles: "dunkel", dunkelbier: "dunkel", dunkles_bier: "dunkel", dunkel_lager: "dunkel",
    münchner_dunkel: "dunkel", munich_dunkel: "dunkel",
    helles_lager: "helles", pilsner: "pils", weizen: "hefeweizen", dunkel_weizen: "dunkles_weizen",
  };
  const catalogStyle = BEER_STYLE_OPTIONS.find((style) => style.label.toLowerCase().replace(/[\s-]+/g, "_") === styleKey)?.bierstil;
  const keepLabel = input.keepLabel ?? (input.etikettModus ? input.etikettModus === "marke" : input.stiltreue !== "frei");
  // A locked product explicitly named on its label must not pour a stale UI-default style.
  // Only recognizable style words count; the name inferencer otherwise defaults to Helles.
  const productWords = [input.beerName, ...labelText].filter(Boolean).join(" ");
  const namedStyle = keepLabel && (input.produktKategorie ?? "bier") === "bier" &&
    /\b(?:dunkel(?:es|bier)?|hell(?:es)?|pils(?:ner)?|hefeweizen|weizen|weißbier|weissbier|schwarzbier|kellerbier|zwickel|stout|porter|doppelbock|bock|märzen|maerzen|kölsch|koelsch|altbier|neipa|ipa|radler)\b/i.test(productWords)
      ? inferBierstilFromName(productWords) : undefined;
  const corrected = correctAlcoholFreeStyle(namedStyle ?? aliases[styleKey] ?? catalogStyle ?? styleKey, input.glasTyp, input.beerName);
  return { ...input, behaelter: input.behaelter ?? (input.glasTyp ? "B" : "F"), bierstil: corrected.bierstil, glasTyp: resolveGlasTyp(corrected.bierstil, corrected.glasTyp), etikettModus: keepLabel ? "marke" : "generisch", stiltreue: keepLabel ? input.stiltreue : "frei" };
}

function productDirection(input: HyperrealisticInput, appearance?: ImagePromptV3Args["beerAppearance"]): string {
  const category = input.produktKategorie ?? "bier";
  const mode = input.behaelter ?? (input.glasTyp ? "B" : "F");
  const bottle = FLASCHEN_TYPEN[input.flaschenTyp];
  const scene = customerSceneText(input.zusatzWunsch);
  const glassType = resolveGlasTyp(input.bierstil, input.glasTyp);
  const lines = [`Beverage: ${input.beerName || input.bierstil}.`];
  if (mode !== "G") {
    lines.push(`Container: ${bottle.display_name}, ${flascheVolumeMl(input.flaschenTyp)} ml. Geometry: ${bottle.geometry_profile}. Material: ${containerMaterialPhrase(input.flaschenTyp, input.flaschenfarbe)}. Keep real scale against hands and surroundings.`);
    const open = mode === "B" || /trink|einschenk|drink|pour|offen|geöffnet|opened|open bottle|open can|leer|empty/i.test(scene);
    const openClosure = {
      kronkorken: "crown cap removed, bare bottle mouth; never a cap still attached to the lip",
      buegel: "wire bail released and ceramic stopper hanging to the side, still attached to its mechanism",
      schraub: "screw cap removed from the mouth",
      ring_pull: "pull tab lifted with an actual open drinking aperture in the can lid",
    }[bottle.closure];
    lines.push(`Closure: ${bottle.closure}, ${open ? `open: ${openClosure}` : "sealed unless the customer explicitly depicts opening it"}. A product reference supplies packaging identity, not the closure or fill state; adapt those to the action. Do not add another container or a loose cap just to illustrate the closure.`);
    lines.push(mode === "B"
      ? "SERVING STATE: After serving, a full poured glass is paired with an OPEN, EMPTY source container, with at most a few residual drops or a thin yeast film. Never show a full glass beside the same source bottle still sealed or still full. If the customer depicts pouring in progress, show an open tilted source container with some liquid remaining, a continuous stream from its mouth into the receiving glass, and a rising glass fill level below the final served level; the bottle becomes emptier as the glass fills. If several glasses are filled, the total liquid must have a plausible source; do not invent extra bottles to solve this. An open container is not automatically empty when someone is drinking directly from it. For an explicitly partly consumed serving, keep the remaining volumes consistent with that stage. Beer foam sits on top of the liquid, with realistic headspace rather than liquid overflowing the rim."
      : "DRINKING STATE: Direct drinking requires an open container, with liquid remaining and a fill level consistent with consumption. Opening alone does not make it empty. A sealed container cannot pour, leak or be drunk from. For an empty container requested by the customer, show an open mouth and at most residual drops; do not simulate a full beer body inside brown glass.");
  }
  if (mode !== "F") {
    const fill = pouredGlassFillMl(glassType, input.flaschenTyp, mode);
    lines.push(`Glass: ${GLAS_TYPEN[glassType].promptDescription}. Final served liquid fill: ${fill} ml, realistic vessel capacity and proportions. During an explicitly requested pour or after partial consumption, adapt the current fill level to that stage.${glassHasEichstrich(glassType) ? " At the completed serving, liquid reaches the matching fill line (Eichstrich); foam sits above it." : ""}`);
    if (category === "bier") {
      const beer = appearance ?? resolveBeerPhysics(input.bierstil);
      const cloudy = resolveBeerClarity(input) === "trueb";
      const haze = input.bierstil === "radler" ? "natural citrus haze" : "dense natural yeast haze";
      const dark = /brown|mahogany|black|chestnut/i.test(beer.liquid);
      lines.push(`SELECTED BEER IN EVERY GLASS: ${input.bierstil}. Beer color: ${beer.liquid}, SRM ${beer.srm}, color reference ${beer.hex}.${dark ? ` The liquid body is visibly ${/black/i.test(beer.liquid) ? "near-black" : "dark brown"} even under flash or backlight; only thin edges may show ruby highlights. No pale yellow or golden lager in any glass.` : ""} Clarity: ${cloudy ? `naturtrüb, ${haze}` : "filtered, transparent within its own beer color"}; filtration never makes dark beer pale. This liquid color overrides all product, glass and scene reference liquids; lighting changes highlights, never the selected beer style. Foam: ${beer.foam}, ${beer.head}. Carbonation: ${beer.carbonation}.`);
    } else {
      lines.push(category === "mineralwasser" ? `Colorless mineral water, ${waterCarbonationFromName(input)}; no beer foam.` : `Liquid color: ${lemonadeColorFromName(input.bierstil)}; no beer foam.`);
    }
  }
  lines.push(mode === "G" ? "Glass only; no bottle, can or packaging." : mode === "F" ? "Container only; no poured glass." : "Container and poured glass; place them as the customer action requires.");
  return lines.join(" ");
}

function referencesDirection(args: ImagePromptV3Args): string {
  const locked = (args.input.etikettModus ?? "marke") === "marke" && args.input.stiltreue !== "frei";
  const rules = args.references.map(({ index, role }) => {
    const purpose = {
      product: locked ? "the real product; its label is finished printed artwork to carry over unchanged, together with logo and material identity. Discard only its setting, people and lighting" : "product material only; label design may change",
      shape: "container silhouette and proportions only",
      glass: "glass silhouette and proportions only; ignore any beer color, liquid or foam shown",
      liquid: "selected beer color swatch only; match this brown/gold/black liquid family in every poured glass under the scene lighting. It supplies no people, wardrobe, vessel, setting or photographic style",
      character: "the explicitly selected character identity only",
      scene: "the customer-selected location; preserve the customer action",
      look: "the customer-selected photographic treatment only; never copy faces, wardrobe or location",
    }[role];
    return `Image ${index}: ${purpose}.`;
  });
  if (locked && args.breweryName?.trim()) rules.push(`Product brand: "${args.breweryName.trim()}".`);
  const product = args.references.find((ref) => ref.role === "product");
  // Der Prompt kann die Treue nur erhöhen, nicht garantieren: das Modell zeichnet das Etikett neu.
  if (locked && product) rules.push(`LABEL LOCK: Reproduce the label of Image ${product.index} as printed, line for line: same wording, same typeface and letter shapes, same layout, colors and logo. Do not retype, translate, correct, shorten, restyle or re-letter it, and add no words, medals or badges it does not show. Small print keeps its position and original wording; where the camera distance makes it too small to resolve, let it soften optically instead of inventing new legible text. Only perspective, wrap around the container, scene lighting and natural occlusion may differ from the reference.`);
  if (locked && args.labelText?.length) rules.push(`Exact label words: ${args.labelText.map((text) => JSON.stringify(text)).join(", ")}. Preserve spelling on the curved product surface.`);
  if (!locked) rules.push("Create original product artwork, without copying unrelated trademarks.");
  if (args.character?.appearanceLock) rules.push(args.character.appearanceLock);
  return rules.join(" ");
}

export function buildImagePromptV3(args: ImagePromptV3Args): string {
  const input = normalizeV3Input(args.input, args.labelText);
  const scene = customerSceneText(input.zusatzWunsch);
  const identity = args.references.some((ref) => ref.role === "character");
  const hasBrief = Boolean(scene);
  const people = input.personenModus ?? (input.personImBild ? "D" : "A");
  const fallbackPeople = people === "A" ? "Product-only image, no people." : people === "B" ? "Adult hands only." : people === "C" ? "An adult seen from behind." : people === "E" ? `A group of ${input.gruppenAnzahl === "4_5" ? "four or five" : input.gruppenAnzahl || "two"} adults.` : "An adult.";
  return [
    `Create one realistic beverage photograph for ${args.social ? "a social-media post" : "the customer's requested use"}.`,
    hasBrief ? `CUSTOMER SCENE (authoritative): ${scene}` : `Compose a plausible setting for the beverage. ${fallbackPeople}`,
    "Scene content and wardrobe come only from the customer. For unspecified details, invent a coherent everyday setting and appropriate ordinary clothing; do not infer cultural dress, location, props or casting from the brand, beverage origin or photographic preset. Explicit customer camera, light and action instructions override photographic defaults.",
    hasBrief ? "" : input.personBeschreibung || "",
    productDirection(input, args.beerAppearance),
    `PHOTOGRAPHY: ${input.photoStyle ? V3_PHOTO_PRESETS[input.photoStyle] : "Natural photographic exposure, coherent scene lighting and believable optical depth of field."} Default ambient time: ${TIME[input.tageszeit]}.${input.shotType ? ` Requested framing: ${SHOT[input.shotType]}.` : ""}`,
    input.quality === "ultra" ? LARGE_FORMAT_FINISHING : "",
    referencesDirection({ ...args, input }),
    identity ? "Preserve only the explicitly selected character's identity." : "Invent new, distinct adult identities when people are requested; do not reuse a stock cast or people from product or style references.",
    "People, hands, beverage and label share one camera exposure and lighting setup; their focus and illumination follow their actual distance from the camera and light. Preserve the selected photographic treatment. Natural skin, realistic grips and glass reflections. Sparse irregular condensation only if the drink is cold. No pasted product, artificial glow, distorted label or extra limbs. Alcohol is held or consumed only by adults.",
    "SURFACE FIDELITY: Render the surfaces already present in the customer scene with coherent photographic texture at their actual scale and focus distance. In-focus detail must remain distinct and irregular; out-of-focus detail must soften progressively through the lens, without painted smears, worm-like sharpening artifacts, repeated texture tiles or crunchy noise. If grass or foliage is present, show naturally varied blade or leaf shapes, orientations, density and subtle color differences, with grounded shadows and real perspective; distant vegetation resolves into softer masses rather than repeating foreground detail. If wood, stone or fabric is present, preserve its material structure without inventing decorative patterns. Preserve fine detail where the camera resolves it, without global clarity boosts, oversharpening, waxy denoising or forcing the whole frame equally sharp. These are rendering rules for existing scene content, not instructions to add vegetation or any other surface.",
    `Format: ${input.aspectRatio}. ${args.social ? "Leave the upper third quiet for text added later. No generated headline." : "No added text beyond requested product artwork."}`,
  ].filter(Boolean).join("\n\n");
}
