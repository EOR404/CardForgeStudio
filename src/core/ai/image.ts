import type { AIProviderConfig } from "../schema/types";

export type ImageGenerationInput = {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  steps?: number;
  count?: number;
};

export type GeneratedImage = {
  dataUrl?: string;
  url?: string;
  revisedPrompt?: string;
  raw?: unknown;
};

export async function callImageGeneration(
  config: AIProviderConfig,
  input: ImageGenerationInput
): Promise<GeneratedImage[]> {
  if (!config.baseUrl) throw new Error("图片 Provider 缺少 Base URL。");
  if (!input.prompt.trim()) throw new Error("图片生成缺少 positive prompt。");
  const endpoint = normalizeImageEndpoint(config);
  const proxyEndpoint = normalizeProxyEndpoint(config.proxyUrl);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(config.headers ?? {})
  };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
  const body = buildImageRequestBody(config, input);
  let response: Response;
  try {
    response = await sendImageRequest(endpoint, headers, body, proxyEndpoint, config.providerType);
  } catch (error) {
    throw new Error(`图片生成网络请求失败：${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`图片 Provider 返回错误。HTTP ${response.status}: ${text.slice(0, 800)}`);
  }
  const json = unwrapProxyJson(await response.json());
  const images = parseImageGenerationResponse(config.providerType, json);
  if (!images.length) throw new Error("图片 Provider 响应中没有可用图片。");
  return images;
}

export function parseImageGenerationResponse(
  providerType: AIProviderConfig["providerType"],
  json: unknown
): GeneratedImage[] {
  const unwrapped = unwrapProxyJson(json);
  const record = isRecord(unwrapped) ? unwrapped : {};
  if (Array.isArray(record.data)) {
    return record.data
      .map((item) => {
        const nested = isRecord(item) ? item : {};
        const b64 = stringValue(nested.b64_json ?? nested.base64 ?? nested.image);
        const url = stringValue(nested.url);
        return {
          dataUrl: b64 ? base64ToDataUrl(b64) : undefined,
          url,
          revisedPrompt: stringValue(nested.revised_prompt ?? nested.revisedPrompt),
          raw: item
        };
      })
      .filter((image) => image.dataUrl || image.url);
  }
  if (Array.isArray(record.images)) {
    return record.images
      .map((item) => {
        const b64 = typeof item === "string" ? item : stringValue(isRecord(item) ? item.image ?? item.base64 : undefined);
        const url = isRecord(item) ? stringValue(item.url) : undefined;
        return {
          dataUrl: b64 ? base64ToDataUrl(b64) : undefined,
          url,
          raw: item
        };
      })
      .filter((image) => image.dataUrl || image.url);
  }
  if (providerType === "stable-diffusion-webui" && typeof record.image === "string") {
    return [{ dataUrl: base64ToDataUrl(record.image), raw: json }];
  }
  const url = stringValue(record.url ?? record.output_url);
  const b64 = stringValue(record.b64_json ?? record.base64 ?? record.image);
  return b64 || url ? [{ dataUrl: b64 ? base64ToDataUrl(b64) : undefined, url, raw: json }] : [];
}

function normalizeImageEndpoint(config: AIProviderConfig): string {
  const trimmed = config.baseUrl.trim().replace(/\/+$/, "");
  if (config.providerType === "stable-diffusion-webui") {
    if (/\/sdapi\/v1\/txt2img$/.test(trimmed)) return trimmed;
    return `${trimmed}/sdapi/v1/txt2img`;
  }
  if (/\/images\/generations$/.test(trimmed)) return trimmed;
  return `${trimmed}/images/generations`;
}

function normalizeProxyEndpoint(proxyUrl?: string): string | undefined {
  const trimmed = proxyUrl?.trim();
  return trimmed || undefined;
}

function buildImageRequestBody(config: AIProviderConfig, input: ImageGenerationInput): object {
  const width = input.width ?? 768;
  const height = input.height ?? 768;
  const count = Math.max(1, Math.min(input.count ?? 1, 4));
  if (config.providerType === "stable-diffusion-webui") {
    return {
      prompt: input.prompt,
      negative_prompt: input.negativePrompt ?? "",
      width,
      height,
      steps: input.steps ?? 24,
      batch_size: count,
      n_iter: 1
    };
  }
  return {
    model: config.defaultModel,
    prompt: input.negativePrompt ? `${input.prompt}\n\nNegative prompt: ${input.negativePrompt}` : input.prompt,
    n: count,
    size: `${width}x${height}`,
    response_format: "b64_json"
  };
}

function sendImageRequest(
  endpoint: string,
  headers: Record<string, string>,
  body: object,
  proxyEndpoint: string | undefined,
  providerType: AIProviderConfig["providerType"]
): Promise<Response> {
  if (!proxyEndpoint) {
    return fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    });
  }
  return fetch(proxyEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint,
      method: "POST",
      headers,
      body,
      providerType
    })
  });
}

function unwrapProxyJson(json: unknown): unknown {
  if (!isRecord(json) || !("body" in json)) return json;
  const body = json.body;
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return json;
    }
  }
  return body ?? json;
}

function base64ToDataUrl(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("data:image/")) return trimmed;
  return `data:image/png;base64,${trimmed}`;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
