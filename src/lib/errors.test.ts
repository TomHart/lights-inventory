import { ConvexError } from "convex/values";
import { expect, it } from "vitest";
import { userMessage } from "./errors";

it("displays intentional server messages", () => {
  expect(userMessage(new ConvexError("Not found"), "Fallback")).toBe(
    "Not found",
  );
  expect(
    userMessage(new ConvexError({ message: "Too many attempts" }), "Fallback"),
  ).toBe("Too many attempts");
});
it.each([
  new Error("internal detail"),
  undefined,
  null,
  {},
  new ConvexError({ code: 123 }),
])("does not expose internal error details", (error) =>
  expect(userMessage(error, "Fallback")).toBe("Fallback"),
);
