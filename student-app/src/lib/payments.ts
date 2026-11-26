import type { SupabaseClient } from "@supabase/supabase-js";

export type PaystackResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; message: string; code?: string };

/** Calls the `paystack` edge function and turns its errors into readable messages. */
export async function callPaystack(supabase: SupabaseClient, body: Record<string, unknown>): Promise<PaystackResult> {
  const { data, error } = await supabase.functions.invoke("paystack", { body });
  if (error) {
    let message = "Something went wrong. Try again.";
    let code: string | undefined;
    try {
      const j = await (error as unknown as { context: Response }).context.json();
      message = j.error || message;
      code = j.code;
    } catch {
      // keep default
    }
    return { ok: false, message, code };
  }
  return { ok: true, data: (data ?? {}) as Record<string, unknown> };
}
