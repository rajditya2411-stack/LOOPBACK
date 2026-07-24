"use client";

import { ApiRequestError, api } from "@/lib/api";
import { useAuthStore, type User } from "@/store/auth-store";
import { useEffect, useState } from "react";

function errorMessage(error: unknown) {
  if (error instanceof ApiRequestError) return error.detail;
  return "Something went wrong. Please try again.";
}

export default function ProfilePage() {
  const user = useAuthStore((state) => state.user);
  const fetchUser = useAuthStore((state) => state.fetchUser);
  const setUser = useAuthStore((state) => state.setUser);
  const [fullName, setFullName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);

  useEffect(() => {
    if (!user) {
      void fetchUser();
      return;
    }
    setFullName(user.full_name);
    setBio(user.bio ?? "");
    setAvatarUrl(user.avatar_url ?? "");
  }, [fetchUser, user]);

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setProfileMessage(null);
    setProfileError(null);
    if (!fullName.trim()) {
      setProfileError("Full name is required.");
      return;
    }
    setProfileSaving(true);
    try {
      const updated = await api.put<User>("/users/me", {
        full_name: fullName.trim(),
        bio: bio.trim() || null,
        avatar_url: avatarUrl.trim() || null,
      });
      setUser(updated);
      setProfileMessage("Profile updated successfully.");
    } catch (error) {
      setProfileError(errorMessage(error));
    } finally {
      setProfileSaving(false);
    }
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    setPasswordMessage(null);
    setPasswordError(null);
    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }
    setPasswordSaving(true);
    try {
      const response = await api.put<{ message: string }>("/users/me/password", {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage(response.message || "Password updated successfully.");
    } catch (error) {
      setPasswordError(errorMessage(error));
    } finally {
      setPasswordSaving(false);
    }
  }

  if (!user) {
    return <div className="flex flex-1 items-center justify-center text-body-sm text-on-surface-variant">Loading your profile…</div>;
  }

  return (
    <div className="neo-profile flex flex-1 flex-col gap-8">
      <section className="rounded-[20px] border border-outline-variant bg-surface-container-lowest px-6 py-6">
        <p className="text-label-sm text-on-surface-variant">Profile</p>
        <h1 className="mt-2 text-display-lg-mobile text-on-surface lg:text-display-lg">Manage your account.</h1>
        <p className="mt-2 max-w-xl text-body-md text-on-surface-variant">Update the details and credentials used across your LoopBack workspace.</p>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={saveProfile} className="rounded-[20px] border border-outline-variant bg-surface-container-lowest p-6">
          <p className="text-label-sm text-on-surface-variant">Personal details</p>
          <h2 className="mt-1 text-headline-md text-on-surface">Your profile</h2>
          <div className="mt-6 space-y-4">
            <label className="block text-label-sm text-on-surface-variant">FULL NAME
              <input value={fullName} onChange={(event) => setFullName(event.target.value)} maxLength={255} required className="mt-1.5 block h-11 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-body-md text-on-surface" />
            </label>
            <label className="block text-label-sm text-on-surface-variant">AVATAR URL
              <input value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} maxLength={512} type="url" placeholder="https://…" className="mt-1.5 block h-11 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-body-md text-on-surface" />
            </label>
            <label className="block text-label-sm text-on-surface-variant">BIO
              <textarea value={bio} onChange={(event) => setBio(event.target.value)} rows={4} className="mt-1.5 block w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-body-md text-on-surface" />
            </label>
            {profileError && <p role="alert" className="text-body-sm text-error">{profileError}</p>}
            {profileMessage && <p role="status" className="text-body-sm text-secondary">{profileMessage}</p>}
            <button type="submit" disabled={profileSaving} className="inline-flex h-11 items-center rounded-lg bg-primary px-4 text-body-sm font-medium text-on-primary disabled:cursor-not-allowed disabled:opacity-60">{profileSaving ? "Saving…" : "Save profile"}</button>
          </div>
        </form>

        <form onSubmit={changePassword} className="rounded-[20px] border border-outline-variant bg-surface-container-lowest p-6">
          <p className="text-label-sm text-on-surface-variant">Security</p>
          <h2 className="mt-1 text-headline-md text-on-surface">Change password</h2>
          <div className="mt-6 space-y-4">
            <label className="block text-label-sm text-on-surface-variant">CURRENT PASSWORD
              <input value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} type="password" autoComplete="current-password" required className="mt-1.5 block h-11 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-body-md text-on-surface" />
            </label>
            <label className="block text-label-sm text-on-surface-variant">NEW PASSWORD
              <input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} type="password" autoComplete="new-password" minLength={8} required className="mt-1.5 block h-11 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-body-md text-on-surface" />
            </label>
            <label className="block text-label-sm text-on-surface-variant">CONFIRM NEW PASSWORD
              <input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type="password" autoComplete="new-password" minLength={8} required className="mt-1.5 block h-11 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-body-md text-on-surface" />
            </label>
            {passwordError && <p role="alert" className="text-body-sm text-error">{passwordError}</p>}
            {passwordMessage && <p role="status" className="text-body-sm text-secondary">{passwordMessage}</p>}
            <button type="submit" disabled={passwordSaving} className="inline-flex h-11 items-center rounded-lg bg-primary px-4 text-body-sm font-medium text-on-primary disabled:cursor-not-allowed disabled:opacity-60">{passwordSaving ? "Updating…" : "Update password"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
