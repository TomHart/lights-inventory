import { expect, it } from "vitest";
import { passwordStrength } from "./password-strength";

it("omits the indicator for an empty password", () =>
  expect(passwordStrength("")).toBeNull());
it.each([
  ["abc", "Weak"],
  ["abcdef", "Weak"],
  ["abcdefghij", "Fair"],
  ["Abcdefghij", "Good"],
  ["Abcdefgh1j", "Strong"],
  ["Abcdefgh1!", "Very strong"],
])("scores %s as %s", (password, label) =>
  expect(passwordStrength(password)?.label).toBe(label),
);
