import { ConvexError } from "convex/values";

export function userMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ConvexError)) return fallback;
  const data: unknown = error.data;
  if (typeof data === "string") return data;
  if (
    data &&
    typeof data === "object" &&
    "message" in data &&
    typeof data.message === "string"
  )
    return data.message;
  return fallback;
}
