export function normalizeOptionalHttpUrl(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;

  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > 2048) {
    throw new Error("URL is too long");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Invalid URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http and https URLs are allowed");
  }

  return parsed.toString();
}

