import { ConvexError } from "convex/values";

export function requireText(value: string, label: string, max = 200): string {
  const text = value.trim();
  if (!text || text.length > max)
    throw new ConvexError(`${label} must contain 1–${max} characters`);
  return text;
}

export function optionalText(
  value: string | undefined,
  label: string,
  max = 2000,
): string | undefined {
  if (value === undefined || !value.trim()) return undefined;
  return requireText(value, label, max);
}

export function requireCount(
  value: number,
  label: string,
  max = 100_000,
): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > max)
    throw new ConvexError(`${label} must be an integer between 0 and ${max}`);
  return value;
}

export function requireWattage(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 10_000)
    throw new ConvexError("Wattage must be between 0 and 10000");
  return value;
}

export function requireDate(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 4_102_444_800_000)
    throw new ConvexError("Date must be between 1970 and 2100");
  return value;
}

export function normalizeBulbFields<
  T extends {
    wattage?: number;
    quantity?: number;
    productName?: string;
    notes?: string;
    installDate?: number;
    features?: string[];
  },
>(args: T): T {
  if (args.features && args.features.length > 50)
    throw new ConvexError("Too many bulb features");
  return Object.assign(
    {},
    args,
    args.features === undefined
      ? {}
      : {
          features: args.features.map((feature) =>
            requireText(feature, "Feature", 100),
          ),
        },
    args.wattage === undefined ? {} : { wattage: requireWattage(args.wattage) },
    args.quantity === undefined
      ? {}
      : { quantity: requireCount(args.quantity, "Quantity") },
    args.productName === undefined
      ? {}
      : { productName: optionalText(args.productName, "Product name", 200) },
    args.notes === undefined
      ? {}
      : { notes: optionalText(args.notes, "Notes") },
    args.installDate === undefined
      ? {}
      : { installDate: requireDate(args.installDate) },
  );
}

export function normalizeOptionalHttpUrl(
  raw: string | undefined,
): string | undefined {
  if (raw === undefined) return undefined;

  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > 2048) {
    throw new ConvexError("URL is too long");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new ConvexError("Invalid URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ConvexError("Only http and https URLs are allowed");
  }

  return parsed.toString();
}
