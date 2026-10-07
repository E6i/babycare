const DEFAULT_CHAT_TITLE = "محادثة رعاية الطفل";
const DEFAULT_AUDIO_TITLE = "تحليل بكاء الطفل";

function compactText(input: string) {
  return input.replace(/\s+/g, " ").trim();
}

function stripLeadingPhrases(input: string) {
  return input
    .replace(/^(طفلي|الطفل|البيبي|baby|my baby)\s+/i, "")
    .replace(/^(عنده|عندها|يعاني من|بيعاني من|has|is having)\s+/i, "")
    .trim();
}

function trimTitle(input: string, maxLength = 42) {
  if (input.length <= maxLength) return input;
  return `${input.slice(0, maxLength).trim()}...`;
}

export function buildConversationTitle(message: string, fallback = DEFAULT_CHAT_TITLE) {
  const compact = compactText(message);
  if (!compact) return fallback;

  const stripped = stripLeadingPhrases(compact);
  const normalized = stripped || compact;
  return trimTitle(normalized, 42);
}

export function buildAudioConversationTitle(message: string) {
  const title = buildConversationTitle(message, DEFAULT_AUDIO_TITLE);
  return title === DEFAULT_CHAT_TITLE ? DEFAULT_AUDIO_TITLE : title;
}
