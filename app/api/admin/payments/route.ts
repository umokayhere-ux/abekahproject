import type { QueryFilter } from "mongoose";
import { connectDB } from "@/lib/db";
import { ok, withErrorHandling } from "@/lib/api";
import { escapeRegex, parsePagination } from "@/lib/validate";
import { requireAdmin } from "@/lib/auth";
import { LANDLORD_PUBLIC_FIELDS, serializePayment } from "@/lib/serialize";
import { Payment, type PaymentDoc } from "@/models/Payment";
import { PAYMENT_STATUSES } from "@/types";

/**
 * GET /api/admin/payments
 *
 * Every transaction, with the commission split. Totals are returned alongside
 * the page so the admin sees platform-wide figures, not just this page's sum.
 */
export const GET = withErrorHandling(async (request: Request) => {
  await requireAdmin(request);
  await connectDB();

  const params = new URL(request.url).searchParams;
  const { page, limit, skip } = parsePagination(params, { defaultLimit: 20 });

  const filter: QueryFilter<PaymentDoc> = {};

  const status = params.get("status");
  if (status && PAYMENT_STATUSES.includes(status as PaymentDoc["status"])) {
    filter.status = status as PaymentDoc["status"];
  }

  const q = params.get("q")?.trim();
  if (q) {
    // References are the natural lookup key for reconciliation.
    filter.reference = new RegExp(escapeRegex(q), "i");
  }

  const [docs, total, totals] = await Promise.all([
    Payment.find(filter)
      .populate("property", "title location price")
      .populate("tenant", LANDLORD_PUBLIC_FIELDS)
      .populate("landlord", LANDLORD_PUBLIC_FIELDS)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Payment.countDocuments(filter),
    Payment.aggregate<{ gross: number; commission: number; landlord: number }>([
      { $match: { status: "paid" } },
      {
        $group: {
          _id: null,
          gross: { $sum: "$amount" },
          commission: { $sum: "$splitBreakdown.platform" },
          landlord: { $sum: "$splitBreakdown.landlord" },
        },
      },
    ]),
  ]);

  return ok({
    items: docs.map(serializePayment),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    totals: {
      grossVolume: totals[0]?.gross ?? 0,
      platformCommission: totals[0]?.commission ?? 0,
      landlordPayouts: totals[0]?.landlord ?? 0,
    },
  });
});
