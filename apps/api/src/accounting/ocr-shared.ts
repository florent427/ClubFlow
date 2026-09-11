import { Injectable } from '@nestjs/common';
import type { Logger } from '@nestjs/common';
import sharp from 'sharp';

/**
 * Outillage OCR partagé entre les reçus (`receipt-ocr.service.ts`) et les
 * relevés bancaires PDF (`bank-import/bank-statement-ocr.service.ts`) :
 * texte natif d'un PDF, rasterisation en pages, choix du modèle vision,
 * prétraitement et tuilage des images. Fonctions pures vis-à-vis de la base.
 */

type LoggerLike = Pick<Logger, 'log' | 'warn'>;

// pdf-parse v1.1.x : API CJS simple `pdfParse(buf) → { numpages, text }`.
// On utilise volontairement la v1 et PAS la v2.x : la v2 charge
// pdfjs-dist 5.4.x qui entre en conflit (mismatch worker version) avec
// la pdfjs-dist 4.2.67 isolée embarquée par `pdf-to-img`. Symptôme :
//   "The API version "5.4.296" does not match the Worker version
//    "4.2.67"."
// → l'extraction texte plante silencieusement, le LLM perd la
// source de vérité textuelle et hallucine. La v1 est CJS pure, sans
// dépendance pdfjs-dist top-level → cohabite proprement avec pdf-to-img.
interface PdfTextItem {
  str: string;
  transform: number[];
}
interface PdfPageData {
  getTextContent(opts: {
    normalizeWhitespace: boolean;
    disableCombineTextItems: boolean;
  }): Promise<{ items: PdfTextItem[] }>;
}
interface PdfParseOptions {
  pagerender?: (pageData: PdfPageData) => Promise<string>;
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse: (
  buf: Buffer,
  options?: PdfParseOptions,
) => Promise<{ numpages: number; text: string }> = require('pdf-parse');

export async function extractPdfText(
  buf: Buffer,
): Promise<{ numpages: number; text: string }> {
  return pdfParse(buf);
}

const PAGE_BREAK = '\f';

/** Rendu identique à celui de pdf-parse, plus un saut de page à la fin. */
function renderPageWithBreak(pageData: PdfPageData): Promise<string> {
  return pageData
    .getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false })
    .then((content) => {
      let lastY: number | null = null;
      let text = '';
      for (const item of content.items) {
        const y = item.transform[5];
        if (lastY === y || !lastY) text += item.str;
        else text += `\n${item.str}`;
        lastY = y;
      }
      return text + PAGE_BREAK;
    });
}

/**
 * Texte natif d'un PDF, page par page. Vide sur un PDF scanné : l'image
 * reste alors la seule source.
 */
export async function extractPdfPages(
  buf: Buffer,
): Promise<{ numpages: number; pages: string[] }> {
  const res = await pdfParse(buf, { pagerender: renderPageWithBreak });
  // pdf-parse concatène « \n\n + page » ; après le dernier saut de page il
  // reste une chaîne vide.
  const pages = res.text.split(PAGE_BREAK).map((t) => t.trim());
  while (pages.length > 0 && pages[pages.length - 1] === '') pages.pop();
  return { numpages: res.numpages, pages };
}

// pdf-to-img v4 est ESM-only. Notre tsconfig est `"module": "commonjs"`,
// ce qui transpile `await import('pdf-to-img')` en `require('pdf-to-img')`
// → ERR_REQUIRE_ASYNC_MODULE au runtime. Pour forcer un VRAI dynamic
// import qui survit à la transpilation, on passe par `new Function`
// qui n'est pas réécrit par TS.
type PdfToImgPdf = (
  buf: Buffer,
  opts?: { scale?: number },
) => AsyncIterable<Buffer> & { length: number };
let _pdfToImgPdfFn: PdfToImgPdf | null = null;
export async function loadPdfToImg(): Promise<PdfToImgPdf> {
  if (_pdfToImgPdfFn) return _pdfToImgPdfFn;
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const dynImport = new Function('s', 'return import(s)') as (
    s: string,
  ) => Promise<{ pdf: PdfToImgPdf }>;
  const mod = await dynImport('pdf-to-img');
  _pdfToImgPdfFn = mod.pdf;
  return _pdfToImgPdfFn;
}

/**
 * Modèles connus pour supporter l'analyse d'images sur OpenRouter (au
 * moment du dernier audit). Si le `textModel` configuré côté club n'est
 * PAS dans cette liste, on bascule sur `DEFAULT_VISION_MODEL` pour les
 * appels vision.
 *
 * Sans ce switch, OpenRouter renvoie un 404 :
 *   "no endpoints found that match your filter"
 * → c'est exactement le crash remonté par l'utilisateur lorsqu'un club
 * a configuré un modèle texte-seul (ex. `meta-llama/llama-3.3-70b`).
 */
export const VISION_CAPABLE_MODELS = new Set<string>([
  'anthropic/claude-sonnet-4-5',
  'anthropic/claude-sonnet-4',
  'anthropic/claude-3.7-sonnet',
  'anthropic/claude-3.5-sonnet',
  'anthropic/claude-3.5-haiku',
  'anthropic/claude-3-opus',
  'anthropic/claude-3-sonnet',
  'anthropic/claude-3-haiku',
  'openai/gpt-4o',
  'openai/gpt-4o-mini',
  'openai/gpt-4-turbo',
  'openai/gpt-5',
  'openai/gpt-5-mini',
  'google/gemini-2.5-pro',
  'google/gemini-2.5-flash',
  'google/gemini-2.0-flash-001',
  'google/gemini-1.5-pro',
  'google/gemini-1.5-flash',
  'mistralai/pixtral-large-2411',
  'mistralai/pixtral-12b',
  'meta-llama/llama-3.2-90b-vision-instruct',
  'meta-llama/llama-3.2-11b-vision-instruct',
]);

export const DEFAULT_VISION_MODEL = 'anthropic/claude-sonnet-4-5';

/**
 * Second modèle pour les lectures croisées (ADR-0014 §3) : d'une autre
 * famille que le premier, pour que les deux ne partagent pas les mêmes
 * erreurs.
 */
export const DEFAULT_VISION_MODEL_B = 'google/gemini-2.5-flash';

export function pickVisionModel(textModel: string): string {
  return VISION_CAPABLE_MODELS.has(textModel) ? textModel : DEFAULT_VISION_MODEL;
}

/**
 * Modèle B d'une lecture croisée : le modèle de repli du club s'il voit les
 * images et diffère du modèle A ; sinon un modèle d'une autre famille.
 */
export function pickSecondVisionModel(
  modelA: string,
  textFallbackModel: string | null,
): string {
  if (
    textFallbackModel &&
    VISION_CAPABLE_MODELS.has(textFallbackModel) &&
    textFallbackModel !== modelA
  ) {
    return textFallbackModel;
  }
  return modelA === DEFAULT_VISION_MODEL_B ? DEFAULT_VISION_MODEL : DEFAULT_VISION_MODEL_B;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function bufferToDataUrl(buf: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${buf.toString('base64')}`;
}

export interface ImageBuffer {
  buffer: Buffer;
  mimeType: string;
}

/**
 * Rasterise un PDF en images PNG (1 par page) via pdf-to-img.
 * Pure-JS (utilise pdfjs-dist + un canvas mock). Limite à `maxPages`
 * pour éviter d'exploser les tokens vision. Si la rasterisation
 * plante (PDF corrompu, lib pas dispo), on retombe sur l'envoi du
 * PDF tel quel (le modèle vision peut peut-être le gérer).
 */
export async function rasterizePdf(
  buf: Buffer,
  logger?: LoggerLike,
  maxPages = 10,
): Promise<ImageBuffer[]> {
  try {
    // scale=2 ≈ 144 DPI — équilibre qualité OCR / taille tokens
    const pdfFn = await loadPdfToImg();
    const document = await pdfFn(buf, { scale: 2 });
    const pages: ImageBuffer[] = [];
    let i = 0;
    for await (const pageBuf of document) {
      pages.push({ buffer: pageBuf, mimeType: 'image/png' });
      i++;
      if (i >= maxPages) break; // safety cap
    }
    logger?.log(`[OCR] PDF rasterisé en ${pages.length} pages PNG`);
    return pages;
  } catch (err) {
    logger?.warn(
      `[OCR] rasterizePdf échec, fallback PDF tel quel : ${errorMessage(err)}`,
    );
    // Fallback : on envoie le PDF tel quel au modèle vision (compat
    // Claude 3+ et Gemini 2+ qui acceptent les PDFs en image_url)
    return [{ buffer: buf, mimeType: 'application/pdf' }];
  }
}

/**
 * Prétraitement d'une image avant envoi au modèle vision pour améliorer
 * la fiabilité de l'OCR :
 *
 *  1. **EXIF auto-rotate** — corrige les photos prises en mode portrait
 *     mais stockées avec metadata d'orientation (très commun en mobile).
 *  2. **Normalisation** — étire l'histogramme (auto-contraste). Une photo
 *     prise dans une pièce sombre devient nettement plus lisible.
 *  3. **Netteté légère** — `sharpen(sigma=1)` rehausse les bords du texte
 *     sans amplifier le bruit (paramètres calibrés empiriquement).
 *  4. **Resize max 2500px** — au-delà c'est inutile pour la lecture +
 *     ça consomme des tokens vision pour rien.
 *  5. **JPEG quality 90** — taille raisonnable et qualité largement
 *     suffisante pour l'OCR.
 *
 * Pour les PDFs et autres mime non-image : retourne le buffer tel quel
 * (sharp ne décode pas les PDFs ; le modèle vision les gère
 * directement, et appliquer une autre transformation casserait le
 * fichier).
 *
 * Retourne : `{ buffer, mimeType }` — le mime peut basculer
 * `image/png` → `image/jpeg` après resize/recompression.
 */
export async function preprocessImage(
  buf: Buffer,
  mimeType: string,
  logger?: LoggerLike,
): Promise<ImageBuffer> {
  if (!mimeType.startsWith('image/')) {
    return { buffer: buf, mimeType };
  }
  try {
    // Pipeline sharp en 2 passes :
    // 1. rotate EXIF + resize → image "raisonnable"
    // 2. analyse stats (luminosité moyenne) pour décider gamma + contraste
    // 3. sharpen final (texte net) + JPEG haute qualité
    const stage1 = sharp(buf)
      .rotate()
      .resize(2500, 2500, { fit: 'inside', withoutEnlargement: true });
    const stats = await stage1.stats();
    // Luminosité moyenne (pondérée RGB) — indique si l'image est sombre
    const meanLum =
      stats.channels.length >= 3
        ? (stats.channels[0].mean + stats.channels[1].mean + stats.channels[2].mean) / 3
        : stats.channels[0].mean;
    // Si image sombre (< 110 sur 255), on applique un gamma > 1 pour
    // éclaircir les zones moyennes. Si déjà bien exposée, on touche pas.
    const gamma = meanLum < 110 ? 1.3 : meanLum < 140 ? 1.1 : 1.0;
    // Coefficient de contraste — image plate (faible variance) → boost.
    const meanStdDev =
      stats.channels.length >= 3
        ? (stats.channels[0].stdev + stats.channels[1].stdev + stats.channels[2].stdev) / 3
        : stats.channels[0].stdev;
    const linearMul = meanStdDev < 40 ? 1.2 : 1.0;

    const out = await sharp(buf)
      .rotate()
      .resize(2500, 2500, { fit: 'inside', withoutEnlargement: true })
      .gamma(gamma)
      .linear(linearMul, -(linearMul - 1) * 128) // boost contraste autour du gris moyen
      .normalise() // auto-stretch histogramme final
      .sharpen({ sigma: 1.2, m1: 0.6, m2: 2.5 }) // un peu plus marqué
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();
    logger?.log(
      `[OCR] preprocess gamma=${gamma} contrastMul=${linearMul.toFixed(2)} (lum=${meanLum.toFixed(0)} stdev=${meanStdDev.toFixed(0)})`,
    );
    return { buffer: out, mimeType: 'image/jpeg' };
  } catch (err) {
    logger?.warn(
      `[OCR] preprocessImage échec, on envoie l'original : ${errorMessage(err)}`,
    );
    return { buffer: buf, mimeType };
  }
}

/**
 * Découpe une image très haute (ratio H/W > 2.5 — ticket de caisse,
 * relevé long) en tuiles verticales avec chevauchement, pour que le
 * modèle vision puisse lire chaque section sans perte de détail. La
 * taille de chaque tuile reste inférieure à 2500px en hauteur.
 *
 * Si l'image n'est pas "tall" → retourne `[buffer]` (pas de tuilage).
 *
 * Le pageCount logique côté DB ne change pas — c'est un découpage
 * INTERNE pour l'IA seule.
 */
export async function tileTallImage(
  buf: Buffer,
  mimeType: string,
  logger?: LoggerLike,
): Promise<ImageBuffer[]> {
  if (!mimeType.startsWith('image/')) {
    return [{ buffer: buf, mimeType }];
  }
  try {
    const meta = await sharp(buf).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    // Pas de tuilage si pas tall ou si dimensions inconnues
    if (w === 0 || h === 0 || h <= w * 2.5 || h <= 2500) {
      return [{ buffer: buf, mimeType }];
    }
    const tileHeight = Math.min(2200, Math.ceil(h / 2));
    const overlap = 200; // px de chevauchement pour capturer les lignes coupées
    const tiles: ImageBuffer[] = [];
    let y = 0;
    while (y < h) {
      const cropH = Math.min(tileHeight, h - y);
      const tile = await sharp(buf)
        .extract({ left: 0, top: y, width: w, height: cropH })
        .jpeg({ quality: 90 })
        .toBuffer();
      tiles.push({ buffer: tile, mimeType: 'image/jpeg' });
      if (y + cropH >= h) break;
      y += tileHeight - overlap;
    }
    logger?.log(`[OCR] image tall (${w}x${h}) → ${tiles.length} tuiles`);
    return tiles;
  } catch (err) {
    logger?.warn(
      `[OCR] tileTallImage échec, on envoie l'image entière : ${errorMessage(err)}`,
    );
    return [{ buffer: buf, mimeType }];
  }
}

/** Une page de PDF prête pour un modèle vision. */
export interface RenderedPage {
  /** Numéro de page, à partir de 1. */
  page: number;
  /** Image(s) de la page (plusieurs tuiles si la page est très haute). */
  dataUrls: string[];
  /** Texte natif de la page ; vide sur un scan. */
  text: string;
}

const MAX_TEXT_PER_PAGE = 12_000;

/**
 * PDF → pages prêtes pour un modèle vision : image(s) prétraitées et
 * tuilées, plus le texte natif de la page. Classe injectable pour être
 * remplacée par un double dans les tests du service de lecture.
 */
@Injectable()
export class PdfPageRenderer {
  async render(buf: Buffer, logger?: LoggerLike, maxPages = 10): Promise<RenderedPage[]> {
    const images = await rasterizePdf(buf, logger, maxPages);
    let texts: string[] = [];
    try {
      texts = (await extractPdfPages(buf)).pages;
    } catch (err) {
      logger?.warn(`[OCR] texte natif du PDF illisible : ${errorMessage(err)}`);
    }
    // Rasterisation en échec → le PDF entier est envoyé tel quel, avec
    // tout son texte.
    const wholePdf = images.length === 1 && images[0].mimeType === 'application/pdf';
    const out: RenderedPage[] = [];
    for (let i = 0; i < images.length; i++) {
      const pre = await preprocessImage(images[i].buffer, images[i].mimeType, logger);
      const tiles = await tileTallImage(pre.buffer, pre.mimeType, logger);
      const text = wholePdf ? texts.join('\n\n--- PAGE ---\n\n') : (texts[i] ?? '');
      out.push({
        page: i + 1,
        dataUrls: tiles.map((t) => bufferToDataUrl(t.buffer, t.mimeType)),
        text: text.slice(0, MAX_TEXT_PER_PAGE),
      });
    }
    return out;
  }
}
