import { isRecord, stringValue } from "@llmr/core/gateway/internal/value";

// Cross-protocol conversion flattens tool_result.content to a string, so nested images are stringified or dropped.
export function hoistAnthropicToolResultImages(body: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(body.messages)) {
    return body;
  }
  const messages = body.messages.map(hoistMessageToolResultImages);
  return messages.some((message, index) => message !== (body.messages as unknown[])[index])
    ? { ...body, messages }
    : body;
}

function hoistMessageToolResultImages(message: unknown): unknown {
  if (
    !isRecord(message) ||
    stringValue(message.role)?.toLowerCase() !== "user" ||
    !Array.isArray(message.content)
  ) {
    return message;
  }

  if (!message.content.some(hasHoistableToolResultImage)) {
    return message;
  }

  const nextContent: unknown[] = [];
  const hoisted: Array<Record<string, unknown>> = [];
  let messageImageIndex = message.content.filter((block) => isRecord(block) && block.type === "image").length;

  for (const block of message.content) {
    if (!hasHoistableToolResultImage(block)) {
      nextContent.push(block);
      continue;
    }

    const toolUseId = stringValue(block.tool_use_id) ?? "unknown";
    const remainingBlocks: unknown[] = [];
    const hoistedBlocks: Array<Record<string, unknown>> = [];

    for (const item of block.content) {
      if (isAnthropicImageBlock(item)) {
        hoistedBlocks.push(item);
      } else {
        remainingBlocks.push(item);
      }
    }

    const firstIndex = messageImageIndex + 1;
    const lastIndex = messageImageIndex + hoistedBlocks.length;
    messageImageIndex = lastIndex;

    const correlationNote = hoistedBlocks.length === 1
      ? `[Image returned by tool call ${toolUseId} is attached in this user message as image #${firstIndex}.]`
      : `[${hoistedBlocks.length} images returned by tool call ${toolUseId} are attached in this user message as images #${firstIndex}-#${lastIndex}.]`;

    nextContent.push({
      ...block,
      content: [
        ...remainingBlocks,
        {
          type: "text",
          text: correlationNote
        }
      ]
    });
    hoisted.push(...hoistedBlocks);
  }

  // Images go last: a virtual model can still resolve to Anthropic, which rejects a user message whose tool_result blocks do not come first.
  return { ...message, content: [...nextContent, ...hoisted] };
}

function hasHoistableToolResultImage(
  block: unknown
): block is Record<string, unknown> & { content: unknown[] } {
  return (
    isRecord(block) &&
    stringValue(block.type) === "tool_result" &&
    Array.isArray(block.content) &&
    block.content.some(isAnthropicImageBlock)
  );
}

function isAnthropicImageBlock(
  value: unknown
): value is Record<string, unknown> & { source: Record<string, unknown> } {
  if (!isRecord(value) || stringValue(value.type) !== "image" || !isRecord(value.source)) {
    return false;
  }

  const url = stringValue(value.source.url);
  if (url && /^(?:https?:\/\/|data:image\/)/i.test(url)) {
    return true;
  }

  const data = stringValue(value.source.data);
  if (!data) {
    return false;
  }

  const rawMediaType = value.source.media_type;
  if (rawMediaType === undefined || rawMediaType === null || rawMediaType === "") {
    return true;
  }

  const mediaType = stringValue(rawMediaType)?.toLowerCase();
  return Boolean(mediaType && mediaType.startsWith("image/"));
}
