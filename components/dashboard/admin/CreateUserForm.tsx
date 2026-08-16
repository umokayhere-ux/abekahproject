"use client";

import { useState, type FormEvent } from "react";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { ApiError, apiFetch } from "@/lib/client";
import type { Role, SafeUser } from "@/types";

const ROLE_OPTIONS = [
  { value: "tenant", label: "Tenant — searches and rents" },
  { value: "landlord", label: "Landlord — lists properties" },
  { value: "admin", label: "Administrator — full platform control" },
];

/**
 * Lets an existing administrator create an account of any role, including
 * another administrator.
 *
 * This is the only route to a second admin: public sign-up refuses the role,
 * and the environment seed creates exactly one. The server re-checks the
 * caller's role, so this form is convenience rather than the boundary.
 */
export function CreateUserForm({
  onCreated,
  onCancel,
}: {
  onCreated: () => void;
  onCancel: () => void;
}) {
  const toast = useToast();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("tenant");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const creatingAdmin = role === "admin";

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setErrors({});

    try {
      const { user } = await apiFetch<{ user: SafeUser }>("/api/admin/users", {
        method: "POST",
        body: { name, email, password, phone: phone || undefined, role },
      });
      toast.success(
        user.role === "admin"
          ? `${user.name} created as an administrator`
          : `${user.name} created as a ${user.role}`,
      );
      onCreated();
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.errors ?? {});
        toast.error(error.message);
      } else {
        toast.error("Could not create that account");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <Select
        label="Role"
        required
        options={ROLE_OPTIONS}
        value={role}
        error={errors.role}
        onChange={(event) => setRole(event.target.value as Role)}
      />

      {/* Creating an admin is the one irreversible-feeling action here, so it
          is called out rather than buried in a dropdown. */}
      {creatingAdmin && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4"
        >
          <ShieldAlert
            className="mt-0.5 size-5 shrink-0 text-amber-600"
            aria-hidden="true"
          />
          <p className="text-sm text-amber-900">
            An administrator can see and change everything on the platform,
            including users, payments, and the danger zone. Only do this for
            someone you trust completely.
          </p>
        </div>
      )}

      <Input
        label="Full name"
        required
        placeholder="Ama Mensah"
        value={name}
        error={errors.name}
        onChange={(event) => setName(event.target.value)}
      />

      <Input
        label="Email address"
        type="email"
        required
        autoComplete="off"
        placeholder="person@example.com"
        value={email}
        error={errors.email}
        onChange={(event) => setEmail(event.target.value)}
      />

      <Input
        label="Phone number"
        type="tel"
        placeholder="0244123456"
        hint="Optional. Ghanaian format."
        value={phone}
        error={errors.phone}
        onChange={(event) => setPhone(event.target.value)}
      />

      <Input
        label="Initial password"
        type="password"
        required
        autoComplete="new-password"
        hint="At least 8 characters with a letter and a number. Share it securely and ask them to change it after signing in."
        value={password}
        error={errors.password}
        onChange={(event) => setPassword(event.target.value)}
      />

      <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          loading={submitting}
          variant={creatingAdmin ? "danger" : "primary"}
        >
          {creatingAdmin ? "Create administrator" : "Create account"}
        </Button>
      </div>
    </form>
  );
}
