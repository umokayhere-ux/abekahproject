"use client";

import { useState, type FormEvent } from "react";
import { KeyRound, Upload, UserCog } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Field";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/hooks/useAuth";
import { ApiError, apiFetch } from "@/lib/client";
import type { SafeUser } from "@/types";

/** Profile self-service: details, avatar, and password change. */
export function ProfilePanel() {
  const { user, setUser } = useAuth();
  const toast = useToast();

  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [avatar, setAvatar] = useState(user?.avatar ?? "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});

  // Uploads require the landlord/admin role, so tenants keep the URL field only.
  const canUpload = user?.role === "landlord" || user?.role === "admin";

  const handleProfileSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSavingProfile(true);
    setProfileErrors({});
    try {
      const data = await apiFetch<{ user: SafeUser }>("/api/auth/me", {
        method: "PATCH",
        body: { name, phone, bio, avatar },
      });
      setUser(data.user);
      toast.success("Profile updated");
    } catch (error) {
      if (error instanceof ApiError) {
        setProfileErrors(error.errors ?? {});
        toast.error(error.message);
      } else {
        toast.error("Could not update your profile");
      }
    } finally {
      setSavingProfile(false);
    }
  };

  const handleAvatarUpload = async (file: File) => {
    setUploadingAvatar(true);
    const form = new FormData();
    form.append("files", file);
    try {
      const data = await apiFetch<{ images: { url: string }[] }>("/api/uploads", {
        method: "POST",
        formData: form,
      });
      const url = data.images[0]?.url;
      if (url) {
        setAvatar(url);
        toast.success("Photo uploaded. Save your profile to apply it.");
      }
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Could not upload that photo",
      );
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handlePasswordSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (newPassword !== confirmPassword) {
      setPasswordErrors({ confirmPassword: "Both passwords must match" });
      return;
    }

    setSavingPassword(true);
    setPasswordErrors({});
    try {
      await apiFetch("/api/auth/change-password", {
        method: "POST",
        body: { currentPassword, newPassword },
      });
      toast.success("Password changed");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      if (error instanceof ApiError) {
        setPasswordErrors(error.errors ?? {});
        toast.error(error.message);
      } else {
        toast.error("Could not change your password");
      }
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <section
        className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"
        aria-labelledby="profile-heading"
      >
        <h2
          id="profile-heading"
          className="flex items-center gap-2 text-base font-bold text-ink-900"
        >
          <UserCog className="size-5 text-ink-500" aria-hidden="true" />
          Your details
        </h2>

        <form onSubmit={handleProfileSubmit} className="mt-5 space-y-4" noValidate>
          <div className="flex items-center gap-4">
            <UserAvatar name={name || "You"} src={avatar} size="xl" />
            <div className="min-w-0 flex-1 space-y-2">
              {canUpload && (
                <>
                  <label
                    htmlFor="avatar-upload"
                    className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-ink-900 transition-colors hover:bg-surface-muted"
                  >
                    <Upload className="size-4" aria-hidden="true" />
                    {uploadingAvatar ? "Uploading…" : "Upload photo"}
                  </label>
                  <input
                    id="avatar-upload"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/avif"
                    className="sr-only"
                    disabled={uploadingAvatar}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void handleAvatarUpload(file);
                    }}
                  />
                </>
              )}
              <Input
                label="Photo URL"
                type="url"
                placeholder="https://…"
                value={avatar}
                error={profileErrors.avatar}
                onChange={(event) => setAvatar(event.target.value)}
              />
            </div>
          </div>

          <Input
            label="Full name"
            required
            value={name}
            error={profileErrors.name}
            onChange={(event) => setName(event.target.value)}
          />

          <Input
            label="Email address"
            type="email"
            value={user?.email ?? ""}
            disabled
            hint="Your email address cannot be changed here."
            onChange={() => undefined}
          />

          <Input
            label="Phone number"
            type="tel"
            placeholder="0244123456"
            hint="Ghanaian format, e.g. 0244123456 or +233244123456."
            value={phone}
            error={profileErrors.phone}
            onChange={(event) => setPhone(event.target.value)}
          />

          <Textarea
            label="About you"
            rows={4}
            placeholder="A short introduction that other users will see."
            value={bio}
            error={profileErrors.bio}
            onChange={(event) => setBio(event.target.value)}
          />

          <Button type="submit" loading={savingProfile}>
            Save changes
          </Button>
        </form>
      </section>

      <section
        className="h-fit rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"
        aria-labelledby="password-heading"
      >
        <h2
          id="password-heading"
          className="flex items-center gap-2 text-base font-bold text-ink-900"
        >
          <KeyRound className="size-5 text-ink-500" aria-hidden="true" />
          Change password
        </h2>

        <form onSubmit={handlePasswordSubmit} className="mt-5 space-y-4" noValidate>
          <Input
            label="Current password"
            type="password"
            required
            autoComplete="current-password"
            value={currentPassword}
            error={passwordErrors.currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
          <Input
            label="New password"
            type="password"
            required
            autoComplete="new-password"
            hint="At least 8 characters, including a letter and a number."
            value={newPassword}
            error={passwordErrors.newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
          <Input
            label="Confirm new password"
            type="password"
            required
            autoComplete="new-password"
            value={confirmPassword}
            error={passwordErrors.confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
          <Button type="submit" loading={savingPassword}>
            Change password
          </Button>
        </form>
      </section>
    </div>
  );
}
