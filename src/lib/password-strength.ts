export function passwordStrength(password: string) {
  if (!password.length) return null;
  let score = 0;
  if (password.length >= 6) score++;
  if (password.length >= 10) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (score <= 1)
    return { label: "Weak", colour: "bg-red-500", width: "w-1/5" };
  if (score === 2)
    return { label: "Fair", colour: "bg-orange-500", width: "w-2/5" };
  if (score === 3)
    return { label: "Good", colour: "bg-yellow-500", width: "w-3/5" };
  if (score === 4)
    return { label: "Strong", colour: "bg-green-500", width: "w-4/5" };
  return { label: "Very strong", colour: "bg-green-600", width: "w-full" };
}
