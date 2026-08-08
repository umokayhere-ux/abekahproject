import type { QueryFilter } from "mongoose";
import { connectDB } from "@/lib/db";
import { ok, withErrorHandling } from "@/lib/api";
import { parsePagination } from "@/lib/validate";
import { authenticate } from "@/lib/auth";
import { LANDLORD_PUBLIC_FIELDS, serializePayment } from "@/lib/serialize";
import { Payment, type PaymentDoc } from "@/models/Payment";
import { PAYMENT_STATUSES } from "@/types";

/**
 * GET /api/payments
 *
 * The caller's payment history. Scope comes from the token: tenants see what
 * they paid, landlords what they received, admins everything.
 */
export const GET = withErrorHandling(async (request: Request) => {
  const auth = await authenticate(request);
  await connectDB();

  const params = new URL(request.url).searchParams;
  const { page, limit, skip } = parsePagination(params, { defaultLimit: 20 });

  const filter: QueryFilter<PaymentDoc> = {};
  if (auth.role === "tenant") filter.tenant = auth.userId;
  else if (auth.role === "landlord") filter.landlord = auth.userId;

  const status = params.get("status");
  if (status && PAYMENT_STATUSES.includes(status as PaymentDoc["status"])) {
    filter.status = status as PaymentDoc["status"];
  }

  const [docs, total] = await Promise.all([
    Payment.find(filter)
      .populate("property", "title images location price")
      .populate("tenant", LANDLORD_PUBLIC_FIELDS)
      .populate("landlord", LANDLORD_PUBLIC_FIELDS)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Payment.countDocuments(filter),
  ]);

  return ok({
    items: docs.map(serializePayment),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
});
