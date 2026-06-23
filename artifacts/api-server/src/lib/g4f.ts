let _client: any = null;

async function getClient() {
  if (_client) return _client;
  const mod = await import("@gpt4free/g4f.dev");
  const Client = mod.default ?? (mod as any).Client ?? mod;
  _client = typeof Client === "function" ? new Client() : Client;
  return _client;
}

export async function callText(
  prompt: string,
  options: {
    system?: string;
    jsonMode?: boolean;
    images?: Array<{ mimeType: string; data: string }>;
  } = {},
): Promise<string> {
  const client = await getClient();
  const messages: any[] = [];

  if (options.system) {
    messages.push({ role: "system", content: options.system });
  }

  if (options.images && options.images.length > 0) {
    const content: any[] = options.images.map((img) => ({
      type: "image_url",
      image_url: { url: `data:${img.mimeType};base64,${img.data}` },
    }));
    content.push({ type: "text", text: prompt });
    messages.push({ role: "user", content });
  } else {
    messages.push({ role: "user", content: prompt });
  }

  const params: any = { model: "gpt-4o", messages };
  if (options.jsonMode) {
    params.response_format = { type: "json_object" };
  }

  const response = await client.chat.completions.create(params);
  return response.choices[0].message.content ?? "";
}

export async function callImage(
  prompt: string,
): Promise<{ b64_json: string; mimeType: string }> {
  const client = await getClient();
  const response = await client.images.generate({
    model: "flux",
    prompt,
    response_format: "url",
  });

  const url: string = response.data[0].url;
  const imgResp = await fetch(url);
  const buffer = await imgResp.arrayBuffer();
  const b64_json = Buffer.from(buffer).toString("base64");
  const mimeType = imgResp.headers.get("content-type") || "image/png";

  return { b64_json, mimeType };
}

export async function* streamText(
  prompt: string,
  options: {
    system?: string;
    images?: Array<{ mimeType: string; data: string }>;
  } = {},
): AsyncGenerator<string> {
  const client = await getClient();
  const messages: any[] = [];

  if (options.system) {
    messages.push({ role: "system", content: options.system });
  }

  if (options.images && options.images.length > 0) {
    const content: any[] = options.images.map((img) => ({
      type: "image_url",
      image_url: { url: `data:${img.mimeType};base64,${img.data}` },
    }));
    content.push({ type: "text", text: prompt });
    messages.push({ role: "user", content });
  } else {
    messages.push({ role: "user", content: prompt });
  }

  const stream = await client.chat.completions.create({
    model: "gpt-4o",
    messages,
    stream: true,
  });

  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content ?? "";
    if (text) yield text;
  }
}
