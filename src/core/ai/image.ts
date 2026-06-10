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
  jobId?: string;
  provider?: string;
  revisedPrompt?: string;
  raw?: unknown;
};

const COMFYUI_WORKFLOW_HEADER = "X-CardForge-ComfyUI-Workflow";
const COMFYUI_CLIENT_HEADER = "X-CardForge-ComfyUI-Client-Id";
const COMFYUI_POLL_ATTEMPTS_HEADER = "X-CardForge-ComfyUI-Poll-Attempts";
const COMFYUI_POLL_INTERVAL_HEADER = "X-CardForge-ComfyUI-Poll-Interval-Ms";

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
    ...publicHeaders(config.headers ?? {})
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
  if (config.providerType === "comfyui") {
    const promptId = getComfyPromptId(json);
    if (promptId) {
      const queued = parseImageGenerationResponse(config.providerType, json);
      try {
        const historyImages = await pollComfyUIHistory(config, endpoint, headers, proxyEndpoint, promptId);
        if (historyImages.length) return historyImages;
      } catch (error) {
        return queued.length
          ? queued.map((image) => ({
              ...image,
              revisedPrompt: `${image.revisedPrompt ?? `ComfyUI prompt_id: ${promptId}`}；history polling failed: ${
                error instanceof Error ? error.message : String(error)
              }`
            }))
          : [];
      }
      if (queued.length) return queued;
    }
  }
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
  if (providerType === "comfyui") {
    const promptId = stringValue(record.prompt_id ?? record.promptId);
    if (promptId) {
      return [
        {
          jobId: promptId,
          provider: "comfyui",
          revisedPrompt: `ComfyUI prompt_id: ${promptId}`,
          raw: json
        }
      ];
    }
    const outputImages = parseComfyUIHistoryImages(record);
    if (outputImages.length) return outputImages;
  }
  const url = stringValue(record.url ?? record.output_url);
  const b64 = stringValue(record.b64_json ?? record.base64 ?? record.image);
  return b64 || url ? [{ dataUrl: b64 ? base64ToDataUrl(b64) : undefined, url, raw: json }] : [];
}

function normalizeImageEndpoint(config: AIProviderConfig): string {
  const trimmed = config.baseUrl.trim().replace(/\/+$/, "");
  if (config.providerType === "comfyui") {
    if (/\/prompt$/.test(trimmed)) return trimmed;
    return `${trimmed}/prompt`;
  }
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
  if (config.providerType === "comfyui") {
    const workflowText = headerValue(config.headers, COMFYUI_WORKFLOW_HEADER);
    if (!workflowText?.trim()) {
      throw new Error(`ComfyUI 需要在 Provider headers 中配置 ${COMFYUI_WORKFLOW_HEADER}，内容为 API-format workflow JSON。`);
    }
    const prompt = parseComfyWorkflow(workflowText, input);
    return {
      prompt,
      client_id: headerValue(config.headers, COMFYUI_CLIENT_HEADER) ?? "cardforge-studio"
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

function publicHeaders(headers: Record<string, string>): Record<string, string> {
  const internal = new Set([
    COMFYUI_WORKFLOW_HEADER.toLowerCase(),
    COMFYUI_CLIENT_HEADER.toLowerCase(),
    COMFYUI_POLL_ATTEMPTS_HEADER.toLowerCase(),
    COMFYUI_POLL_INTERVAL_HEADER.toLowerCase()
  ]);
  return Object.fromEntries(
    Object.entries(headers).filter(([key]) => !internal.has(key.toLowerCase()))
  );
}

function parseComfyWorkflow(workflowText: string, input: ImageGenerationInput): Record<string, unknown> {
  try {
    const substituted = workflowText
      .replaceAll("{{prompt}}", input.prompt)
      .replaceAll("{{negativePrompt}}", input.negativePrompt ?? "")
      .replaceAll("{{width}}", String(input.width ?? 768))
      .replaceAll("{{height}}", String(input.height ?? 768))
      .replaceAll("{{steps}}", String(input.steps ?? 24))
      .replaceAll("{{seed}}", String(Math.floor(Math.random() * 1_000_000_000)));
    const parsed = JSON.parse(substituted);
    if (!isRecord(parsed)) throw new Error("workflow root must be an object");
    return parsed;
  } catch (error) {
    throw new Error(`ComfyUI workflow JSON 无法解析：${error instanceof Error ? error.message : String(error)}`);
  }
}

async function pollComfyUIHistory(
  config: AIProviderConfig,
  promptEndpoint: string,
  headers: Record<string, string>,
  proxyEndpoint: string | undefined,
  promptId: string
): Promise<GeneratedImage[]> {
  const attempts = numberHeader(config.headers, COMFYUI_POLL_ATTEMPTS_HEADER, 0);
  if (attempts <= 0) return [];
  const intervalMs = numberHeader(config.headers, COMFYUI_POLL_INTERVAL_HEADER, 1000);
  const baseUrl = promptEndpoint.replace(/\/prompt$/, "");
  const historyEndpoint = `${baseUrl}/history/${encodeURIComponent(promptId)}`;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) await delay(intervalMs);
    const response = await sendImageGetRequest(historyEndpoint, headers, proxyEndpoint, config.providerType);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`ComfyUI history 返回错误。HTTP ${response.status}: ${text.slice(0, 500)}`);
    }
    const history = unwrapProxyJson(await response.json());
    const images = parseComfyUIHistoryImages(isRecord(history) ? history : {}, baseUrl, promptId);
    if (images.length) return Promise.all(images.map((image) => hydrateComfyUIImage(image, headers, proxyEndpoint, config.providerType)));
  }
  return [];
}

function parseComfyUIHistoryImages(record: Record<string, unknown>, baseUrl = "", promptId?: string): GeneratedImage[] {
  return Object.values(record)
    .flatMap((item) => {
      const output = isRecord(item) ? item.outputs : undefined;
      if (!isRecord(output)) return [];
      return Object.values(output).flatMap((node) => {
        const images = isRecord(node) && Array.isArray(node.images) ? node.images : [];
        return images
          .map((image): GeneratedImage | undefined => {
            if (!isRecord(image)) return undefined;
            const filename = stringValue(image.filename);
            const subfolder = stringValue(image.subfolder) ?? "";
            const type = stringValue(image.type) ?? "output";
            if (!filename) return undefined;
            const query = new URLSearchParams({ filename, subfolder, type });
            const viewPath = `/view?${query.toString()}`;
            return {
              url: baseUrl ? `${baseUrl}${viewPath}` : viewPath,
              jobId: promptId,
              provider: "comfyui",
              raw: image
            };
          })
          .filter((image): image is GeneratedImage => Boolean(image));
      });
    });
}

async function hydrateComfyUIImage(
  image: GeneratedImage,
  headers: Record<string, string>,
  proxyEndpoint: string | undefined,
  providerType: AIProviderConfig["providerType"]
): Promise<GeneratedImage> {
  if (!image.url) return image;
  try {
    const response = await sendImageGetRequest(image.url, headers, proxyEndpoint, providerType);
    if (!response.ok) return image;
    const contentType = response.headers.get("Content-Type") || "image/png";
    if (!contentType.startsWith("image/")) return image;
    const bytes = new Uint8Array(await response.arrayBuffer());
    return {
      ...image,
      dataUrl: bytesToDataUrl(bytes, contentType)
    };
  } catch {
    return image;
  }
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

function sendImageGetRequest(
  endpoint: string,
  headers: Record<string, string>,
  proxyEndpoint: string | undefined,
  providerType: AIProviderConfig["providerType"]
): Promise<Response> {
  if (!proxyEndpoint) {
    return fetch(endpoint, {
      method: "GET",
      headers
    });
  }
  return fetch(proxyEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint,
      method: "GET",
      headers,
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

function getComfyPromptId(json: unknown): string | undefined {
  const unwrapped = unwrapProxyJson(json);
  const record = isRecord(unwrapped) ? unwrapped : {};
  return stringValue(record.prompt_id ?? record.promptId);
}

function numberHeader(configHeaders: Record<string, string> | undefined, header: string, fallback: number): number {
  const value = headerValue(configHeaders, header);
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, header === COMFYUI_POLL_INTERVAL_HEADER ? 30_000 : 120);
}

function headerValue(headers: Record<string, string> | undefined, name: string): string | undefined {
  const normalized = name.toLowerCase();
  return Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === normalized)?.[1];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, Math.max(0, ms)));
}

function base64ToDataUrl(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("data:image/")) return trimmed;
  return `data:image/png;base64,${trimmed}`;
}

function bytesToDataUrl(bytes: Uint8Array, mimeType: string): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${mimeType};base64,${btoa(binary)}`;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
