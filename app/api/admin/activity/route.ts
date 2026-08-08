import type { QueryFilter } from "mongoose";
import { connectDB } from "@/lib/db";
import { ok, withErrorHandling } from "@/lib/api";
import { escapeRegex, parsePagination } from "@/lib/validate";
import { requireAdmin } from "@/lib/auth";
import { LANDLORD_PUBLIC_FIELDS, serializeActivity } from "@/lib/serialize";
import { Activity, type ActivityDoc } from "@/models/Activity";

/**
 * GET /api/admin/activity
 *
 * The audit trail. Entries are written by `lib/activity.ts`, which strips
 * anything sensitive before it is stored.
 */
export const GET = withErrorHandling(async (request: Request) => {
  await requireAdmin(request);
  await connectDB();

  const params = new URL(request.url).searchParams;
  const { page, limit, skip } = parsePagination(params, { defaultLimit: 30 });

  const filter: QueryFilter<ActivityDoc> = {};

  const action = params.get("action")?.trim();
  if (action) filter.action = action;

  const q = params.get("q")?.trim();
  if (q) {
    const pattern = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ actorEmail: pattern }, { message: pattern }, { action: pattern }];
  }

  const [docs, total, actions] = await Promise.all([
    Activity.find(filter)
      .populate("actor", LANDLORD_PUBLIC_FIELDS)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Activity.countDocuments(filter),
    // Powers the action filter dropdown with only the actions actually present.
    Activity.distinct("action"),
  ]);

  return ok({
    items: docs.map(serializeActivity),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    actions: (actions as string[]).sort(),
  });
});
