import { BadRequestException, Injectable, Logger } from '@nestjs/common';

/**
 * Client HTTP minimal pour OpenRouter (https://openrouter.ai/api/v1).
 * Supporte chat completions (texte) et génération d'image via chat.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionOptions {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'json_object' | 'text';
  /**
   * Active le plugin web d'OpenRouter (Exa) : le modèle peut faire des
   * recherches web pour récupérer de l'info récente. Coût : ~0,02 $ par
   * requête (5 résultats Exa). Compatible avec tous les modèles chat.
   */
  webSearch?: boolean;
  /** Nombre max de résultats web (défaut 5). */
  webSearchMaxResults?: number;
}

export interface ChatCompletionResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  costCents?: number;
}

export interface GenerateImageOptions {
  apiKey: string;
  model: string;
  prompt: string;
}

export interface GenerateImageResult {
  imageBase64: string;
  mimeType: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

@Injectable()
export class OpenrouterService {
  private readonly logger = new Logger(OpenrouterService.name);
  private readonly baseUrl = 'https://openrouter.ai/api/v1';

  private headers(apiKey: string): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer':
        process.env.OPENROUTER_HTTP_REFERER ?? 'http://localhost:5173',
      'X-Title': 'ClubFlow',
    };
  }

  async chatCompletion(
    opts: ChatCompletionOptions,
  ): Promise<ChatCompletionResult> {
    // Plugin web OpenRouter : le modèle peut invoquer une recherche Exa
    // pendant sa génération. Les résultats sont injectés dans le contexte
    // par OpenRouter avant que le modèle ne réponde. Compatible JSON mode.
    const plugins = opts.webSearch
      ? [
          {
            id: 'web',
            max_results: opts.webSearchMaxResults ?? 5,
          },
        ]
      : undefined;

    // Timeout 3 min : OpenRouter peut être lent sur certains modèles mais
    // au-delà c'est un signe de hang (provider down, modèle preview cassé).
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180_000);

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.headers(opts.apiKey),
        signal: controller.signal,
        body: JSON.stringify({
          model: opts.model,
          messages: opts.messages,
          temperature: opts.temperature ?? 0.7,
          max_tokens: opts.maxTokens ?? 6000,
          response_format: opts.responseFormat
            ? { type: opts.responseFormat }
            : undefined,
          plugins,
        }),
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new BadRequestException(
          `OpenRouter timeout (>3min) sur ${opts.model}. Essaie un autre modèle.`,
        );
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) {
      const txt = await res.text();
      throw new BadRequestException(
        `OpenRouter (${res.status}) : ${txt.slice(0, 500)}`,
      );
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
        cost?: number;
      };
      model?: string;
    };
    const choice = data.choices?.[0];
    if (!choice) {
      throw new BadRequestException('OpenRouter : réponse vide');
    }
    return {
      content: choice.message?.content ?? '',
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
      model: data.model ?? opts.model,
      costCents:
        typeof data.usage?.cost === 'number'
          ? Math.round(data.usage.cost * 100)
          : undefined,
    };
  }

  /**
   * Génération d'image via l'endpoint chat completions avec `modalities`.
   * Retourne la première image en base64 (data URL parsed).
   *
   * Modèles supportés : `google/gemini-2.5-flash-image-preview`,
   * `openai/gpt-4o-*` avec vision/image-out, etc.
   */
  async generateImage(
    opts: GenerateImageOptions,
  ): Promise<GenerateImageResult> {
    // Timeout 2 min pour la génération d'image : au-delà c'est un hang.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.headers(opts.apiKey),
        signal: controller.signal,
        body: JSON.stringify({
          model: opts.model,
          messages: [
            {
              role: 'user',
              content: opts.prompt,
            },
          ],
          modalities: ['image', 'text'],
        }),
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new BadRequestException(
          `Image ${opts.model} timeout (>2min). Modèle probablement instable, essaie google/gemini-2.5-flash-image (GA stable).`,
        );
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) {
      const txt = await res.text();
      throw new BadRequestException(
        `OpenRouter image (${res.status}) : ${txt.slice(0, 500)}`,
      );
    }
    const data = (await res.json()) as {
      choices?: Array<{
        message?: {
          content?: unknown;
          images?: Array<{
            type?: string;
            image_url?: { url?: string };
          }>;
        };
      }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      model?: string;
    };

    const message = data.choices?.[0]?.message;

    // Pattern 1 : images[] séparé (Gemini, Claude vision, …)
    const images = message?.images;
    if (Array.isArray(images) && images[0]?.image_url?.url) {
      const parsed = parseDataUrl(images[0].image_url.url);
      if (parsed) {
        return {
          imageBase64: parsed.base64,
          mimeType: parsed.mimeType,
          model: data.model ?? opts.model,
          inputTokens: data.usage?.prompt_tokens ?? 0,
          outputTokens: data.usage?.completion_tokens ?? 0,
        };
      }
    }

    // Pattern 2 : content = array of parts with image_url
    const content = message?.content;
    if (Array.isArray(content)) {
      for (const part of content) {
        const url =
          (part as { image_url?: { url?: string } })?.image_url?.url ??
          (part as { source?: { data?: string } })?.source?.data;
        if (typeof url === 'string') {
          const parsed = parseDataUrl(url);
          if (parsed) {
            return {
              imageBase64: parsed.base64,
              mimeType: parsed.mimeType,
              model: data.model ?? opts.model,
              inputTokens: data.usage?.prompt_tokens ?? 0,
              outputTokens: data.usage?.completion_tokens ?? 0,
            };
          }
        }
      }
    }

    this.logger.error(
      `Réponse sans image : ${JSON.stringify(data).slice(0, 400)}`,
    );
    throw new BadRequestException(
      "Le modèle n'a pas retourné d'image. Vérifie qu'il supporte la génération d'images (ex. google/gemini-2.5-flash-image-preview).",
    );
  }
}

function parseDataUrl(
  url: string,
): { mimeType: string; base64: string } | null {
  const m = url.match(/^data:([\w\/+.-]+);base64,(.+)$/);
  if (!m) return null;
  return { mimeType: m[1], base64: m[2] };
}
