"use client";

import { useState } from "react";
import { AlertTriangle, ShieldAlert, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { ApiError, apiFetch } from "@/lib/client";
import { RESET_SCOPES, type ResetScope } from "@/types";

/** The exact phrase the administrator must type. Matched case-sensitively. */
const CONFIRMATION_PHRASE = "RESET";

const SCOPE_DETAILS: Record<
  ResetScope,
  { title: string; description: string; removes: string[] }
> = {
  properties: {
    title: "Reset properties",
    description: "Delete every property listing on the platform.",
    removes: ["All properties", "All bookings", "All reviews", "Saved-property lists"],
  },
  bookings: {
    title: "Reset bookings",
    description:
      "Delete every booking. All properties are returned to available.",
    removes: ["All bookings", "Rented status on every property"],
  },
  tenants: {
    title: "Reset tenants",
    description: "Delete every tenant account and everything tied to it.",
    removes: [
      "All tenant accounts",
      "Their bookings and payments",
      "Their reviews and conversations",
    ],
  },
  landlords: {
    title: "Reset landlords",
    description:
      "Delete every landlord account, their listings, and related records.",
    removes: [
      "All landlord accounts",
      "All their properties",
      "Bookings, payments, and reviews on those properties",
      "Their conversations",
    ],
  },
  full: {
    title: "Full platform reset",
    description:
      "Delete all platform data except administrator accounts and this audit log.",
    removes: [
      "All tenant and landlord accounts",
      "All properties, bookings, and payments",
      "All reviews, conversations, and messages",
    ],
  },
};

/**
 * Destructive platform resets.
 *
 * Deliberately awkward: the administrator picks a scope, reads what it removes,
 * and types "RESET" exactly. The server independently requires the same phrase
 * and a valid admin token, so this UI is a second line of defence rather than
 * the only one.
 */
export function DangerZone({ onReset }: { onReset: () => void }) {
  const toast = useToast();

  const [selected, setSelected] = useState<ResetScope | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [running, setRunning] = useState(false);

  const closeModal = () => {
    setSelected(null);
    setConfirmation("");
  };

  const handleReset = async () => {
    if (!selected || confirmation !== CONFIRMATION_PHRASE) return;

    setRunning(true);
    try {
      const result = await apiFetch<{
        deleted: Record<string, number>;
      }>("/api/admin/reset", {
        method: "DELETE",
        body: { scope: selected, confirm: confirmation },
      });

      const summary = Object.entries(result.deleted)
        .filter(([, count]) => count > 0)
        .map(([key, count]) => `${count} ${key}`)
        .join(", ");

      toast.success(
        summary ? `Reset complete — removed ${summary}` : "Reset complete",
      );
      closeModal();
      onReset();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "The reset could not be completed",
      );
    } finally {
      setRunning(false);
    }
  };

  const details = selected ? SCOPE_DETAILS[selected] : null;
  const confirmationMatches = confirmation === CONFIRMATION_PHRASE;

  return (
    <div className="space-y-6">
      <div
        role="alert"
        className="flex items-start gap-3 rounded-2xl border-2 border-red-300 bg-red-50 p-5"
      >
        <ShieldAlert
          className="mt-0.5 size-6 shrink-0 text-red-600"
          aria-hidden="true"
        />
        <div>
          <h2 className="text-lg font-bold text-red-900">Danger zone</h2>
          <p className="mt-1 text-sm text-red-800">
            Everything below permanently deletes data. There is no undo and no
            backup. Administrator accounts are always preserved so you cannot
            lock yourself out.
          </p>
        </div>
      </div>

      <ul className="space-y-4">
        {RESET_SCOPES.map((scope) => {
          const detail = SCOPE_DETAILS[scope];
          const isFull = scope === "full";
          return (
            <li
              key={scope}
              className={`rounded-2xl border-2 bg-white p-5 ${
                isFull ? "border-red-400" : "border-red-200"
              }`}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h3 className="font-bold text-ink-900">{detail.title}</h3>
                  <p className="mt-1 text-sm text-ink-500">
                    {detail.description}
                  </p>
                  <ul className="mt-3 space-y-1">
                    {detail.removes.map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-2 text-xs text-red-700"
                      >
                        <Trash2
                          className="mt-0.5 size-3.5 shrink-0"
                          aria-hidden="true"
                        />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                <Button
                  variant="danger"
                  onClick={() => setSelected(scope)}
                  className="shrink-0"
                >
                  <AlertTriangle className="size-4" aria-hidden="true" />
                  {detail.title}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <Modal
        open={selected !== null}
        onClose={closeModal}
        title={details?.title ?? "Confirm reset"}
        description="This action is permanent and cannot be undone."
        footer={
          <>
            <Button variant="outline" onClick={closeModal} disabled={running}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleReset}
              loading={running}
              // The button stays disabled until the phrase matches exactly.
              disabled={!confirmationMatches}
            >
              Permanently delete
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-semibold text-red-900">
              This will permanently remove:
            </p>
            <ul className="mt-2 space-y-1">
              {details?.removes.map((item) => (
                <li key={item} className="text-sm text-red-800">
                  &bull; {item}
                </li>
              ))}
            </ul>
          </div>

          <Input
            label={`Type ${CONFIRMATION_PHRASE} to confirm`}
            required
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder={CONFIRMATION_PHRASE}
            autoComplete="off"
            hint="Must match exactly, in capitals."
            error={
              confirmation.length > 0 && !confirmationMatches
                ? `Type ${CONFIRMATION_PHRASE} exactly`
                : undefined
            }
          />
        </div>
      </Modal>
    </div>
  );
}
