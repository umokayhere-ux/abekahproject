import { clientIp, ok, withErrorHandling } from "@/lib/api";
import { optionalAuth } from "@/lib/auth";
import { ACTIONS, logActivity } from "@/lib/activity";

/**
 * POST /api/auth/logout
 *
 * JWTs are stateless, so the token is discarded by the client. This endpoint
 * exists to record the event in the audit log and to clear the cookie mirror.
 * It succeeds even without a valid token so sign-out is never blocked.
 */
export const POST = withErrorHandling(async (request: Request) => {
  const auth = await optionalAuth(request);

  if (auth) {
    await logActivity({
      action: ACTIONS.LOGOUT,
      actor: auth.user,
      targetType: "User",
      targetId: auth.userId,
      message: `${auth.role} signed out`,
      ip: clientIp(request),
    });
  }

  const response = ok({ message: "Signed out" });
  response.headers.append(
    "Set-Cookie",
    "rf_token=; Path=/; Max-Age=0; SameSite=Lax",
  );
  return response;
});
