"use client";

/**
 * Opens Paystack's inline checkout popup.
 *
 * The transaction is always initialised server-side first, so the browser only
 * ever resumes an existing one by access code — it never states an amount, and
 * cannot alter what is charged.
 *
 * Paystack's inline script is loaded on demand. If it fails to load, or the
 * runtime shape is not what we expect, the caller falls back to the hosted
 * checkout page via `authorization_url`. That fallback matters: it keeps
 * sign-up working on flaky networks, with blockers installed, and if Paystack
 * changes their inline API.
 */

const SCRIPT_SRC = "https://js.paystack.co/v2/inline.js";
const SCRIPT_ID = "paystack-inline-v2";

interface PaystackPopupInstance {
  resumeTransaction: (accessCode: string, callbacks?: PopupCallbacks) => void;
}

interface PopupCallbacks {
  onSuccess?: (transaction: { reference?: string }) => void;
  onCancel?: () => void;
  onError?: (error: unknown) => void;
}

declare global {
  interface Window {
    PaystackPop?: new () => PaystackPopupInstance;
  }
}

/** Loads the inline script once, resolving false if it cannot be loaded. */
function loadScript(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.PaystackPop) return Promise.resolve(true);

  return new Promise((resolve) => {
    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      existing.addEventListener("load", () => resolve(Boolean(window.PaystackPop)));
      existing.addEventListener("error", () => resolve(false));
      return;
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve(Boolean(window.PaystackPop));
    script.onerror = () => resolve(false);
    document.head.appendChild(script);

    // Do not hang the sign-up button forever on a stalled network.
    setTimeout(() => resolve(Boolean(window.PaystackPop)), 8000);
  });
}

export interface OpenCheckoutInput {
  accessCode: string;
  /** Used when the popup cannot be opened. */
  authorizationUrl: string;
  onSuccess: () => void;
  onCancel: () => void;
}

/**
 * Opens the popup, falling back to a full-page redirect.
 *
 * Resolves to how it was handled, so the caller can keep the button spinning
 * during a redirect but stop on cancel.
 */
export async function openPaystackCheckout({
  accessCode,
  authorizationUrl,
  onSuccess,
  onCancel,
}: OpenCheckoutInput): Promise<"popup" | "redirect"> {
  const ready = await loadScript();

  if (ready && window.PaystackPop) {
    try {
      const popup = new window.PaystackPop();
      popup.resumeTransaction(accessCode, {
        onSuccess: () => onSuccess(),
        onCancel: () => onCancel(),
        onError: () => {
          // Something went wrong mid-popup; the hosted page is more robust.
          window.location.assign(authorizationUrl);
        },
      });
      return "popup";
    } catch (error) {
      console.error("[paystack] inline popup failed, redirecting:", error);
    }
  }

  window.location.assign(authorizationUrl);
  return "redirect";
}
