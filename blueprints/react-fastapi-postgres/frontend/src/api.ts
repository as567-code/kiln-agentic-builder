import type { Ingredient } from "./types";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export async function listIngredients(signal?: AbortSignal): Promise<Ingredient[]> {
  const response = await fetch(`${apiUrl}/api/ingredients`, { signal });
  if (!response.ok) throw new Error("Could not load inventory");
  return (await response.json()) as Ingredient[];
}
