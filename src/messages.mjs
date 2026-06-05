function timestampFromTime(time) {
  if (!time || typeof time !== "object") return null;
  return time.completed || time.end || time.created || time.start || null;
}

function isoFromMs(value) {
  return typeof value === "number" ? new Date(value).toISOString() : null;
}

export function truncateText(value, maxLength = 500) {
  if (typeof value !== "string") return value;
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}... [truncated ${value.length - maxLength} chars]`;
}

export function collectTextParts(parts) {
  if (!Array.isArray(parts)) return "";
  return parts
    .filter((part) => part && part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

export function compactMessage(message, options = {}) {
  const maxPartText = options.maxPartText || 500;
  return {
    info: message.info,
    parts: Array.isArray(message.parts)
      ? message.parts.map((part) => {
        const compact = {
          id: part.id,
          type: part.type,
          messageID: part.messageID,
        };
        if (part.type === "text" || part.type === "reasoning") {
          compact.text = truncateText(part.text || "", maxPartText);
        }
        if (part.type === "tool") {
          compact.tool = part.tool;
          compact.callID = part.callID;
          compact.state = {
            status: part.state?.status,
            title: part.state?.title,
            input: part.state?.input,
            metadata: part.state?.metadata,
            outputPreview: truncateText(part.state?.output || "", maxPartText),
          };
        }
        if (part.reason) compact.reason = part.reason;
        if (part.time) compact.time = part.time;
        return compact;
      })
      : [],
  };
}

export function compactMessages(messages, options = {}) {
  return Array.isArray(messages)
    ? messages.map((message) => compactMessage(message, options))
    : [];
}

export function deriveProgress(messages) {
  const list = Array.isArray(messages) ? messages : [];
  const progress = {
    messageCount: list.length,
    toolCalls: { total: 0, completed: 0, running: 0, failed: 0 },
    filesRead: [],
    lastMessageID: null,
    lastRole: null,
    lastPartType: null,
    lastTextPreview: "",
    lastActivityAt: null,
    hasOpenAssistantMessage: false,
  };

  let lastActivity = 0;
  for (const message of list) {
    if (message?.info?.id) progress.lastMessageID = message.info.id;
    if (message?.info?.role) progress.lastRole = message.info.role;
    const infoActivity = timestampFromTime(message?.info?.time);
    if (infoActivity && infoActivity > lastActivity) lastActivity = infoActivity;
    if (message?.info?.role === "assistant" && !message?.info?.time?.completed) {
      progress.hasOpenAssistantMessage = true;
    }

    for (const part of message.parts || []) {
      progress.lastPartType = part.type || progress.lastPartType;
      const partActivity = timestampFromTime(part.time);
      if (partActivity && partActivity > lastActivity) lastActivity = partActivity;
      if ((part.type === "text" || part.type === "reasoning") && part.text) {
        progress.lastTextPreview = truncateText(part.text, 240);
      }
      if (part.type === "tool") {
        progress.toolCalls.total += 1;
        const status = part.state?.status;
        if (status === "completed") progress.toolCalls.completed += 1;
        else if (status === "failed" || status === "error") progress.toolCalls.failed += 1;
        else progress.toolCalls.running += 1;
        const filePath = part.state?.input?.filePath;
        if (part.tool === "read" && filePath && !progress.filesRead.includes(filePath)) {
          progress.filesRead.push(filePath);
        }
      }
    }
  }

  progress.lastActivityAt = isoFromMs(lastActivity);
  if (progress.filesRead.length > 20) {
    progress.filesRead = [
      ...progress.filesRead.slice(0, 20),
      `... ${progress.filesRead.length - 20} more`,
    ];
  }
  return progress;
}
