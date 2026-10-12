import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { createClient } from "@/lib/supabase";
import { TEAM_COLORS } from "@/lib/lineup";
import { clearLineup, lineupErrorMessage, saveLineup } from "@/lib/services/lineups";

export const prerender = false;

const color = z.enum(TEAM_COLORS.map((c) => c.hex) as [string, ...string[]]);
const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    teamA: color,
    teamB: color,
    assignments: z
      .array(
        z.object({
          user_id: z.uuid(),
          team: z.union([z.literal(0), z.literal(1)]),
          slot: z.number().int().min(0).max(10),
        }),
      )
      .max(60),
  }),
  z.object({ action: z.literal("clear") }),
]);

// Zapis albo usunięcie składów na mecz (tylko organizator — sprawdza baza).
export const POST: APIRoute = async (context) => {
  if (!context.locals.user) return Response.json({ error: "NOT_AUTHENTICATED" }, { status: 401 });
  const id = z.uuid().safeParse(context.params.id);
  const body = bodySchema.safeParse(await context.request.json().catch(() => null));
  if (!id.success || !body.success) {
    return Response.json({ error: "INVALID_LINEUP", message: lineupErrorMessage("INVALID_LINEUP") }, { status: 400 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return Response.json({ error: "UNKNOWN" }, { status: 500 });

  const result =
    body.data.action === "save" ? await saveLineup(supabase, id.data, body.data) : await clearLineup(supabase, id.data);
  if (!result.ok) {
    return Response.json({ error: result.code, message: lineupErrorMessage(result.code) }, { status: 403 });
  }
  return Response.json({ ok: true });
};
