"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { MyProfile, UpdateProfileRequest } from "@saas/contracts/social";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { wrap } from "@/lib/api";
import { qk, useApiQuery } from "@/lib/query";
import { useSession } from "@/lib/session";

type Fields = Record<string, string[] | undefined>;

const TEXT_FIELDS = [
  { key: "displayName", label: "Your name" },
  { key: "city", label: "City" },
  { key: "country", label: "Country" },
  { key: "interests", label: "Interests" },
  { key: "relationship", label: "Relationship" },
] as const;

function EditForm({ profile }: { profile: MyProfile }) {
  const { client } = useSession();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = React.useState({
    displayName: profile.displayName,
    about: profile.about ?? "",
    city: profile.city ?? "",
    country: profile.country ?? "",
    interests: profile.interests ?? "",
    relationship: profile.relationship ?? "",
    birthdayDay: profile.birthdayDay?.toString() ?? "",
    birthdayMonth: profile.birthdayMonth?.toString() ?? "",
  });
  const [birthdayVisible, setBirthdayVisible] = React.useState(profile.birthdayVisible);
  const [visibility, setVisibility] = React.useState(profile.visibility);
  const [fields, setFields] = React.useState<Fields>({});
  const [busy, setBusy] = React.useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));
  const error = (key: string) =>
    fields[key]?.[0] ? <p className="text-xs text-destructive">{fields[key]?.[0]}</p> : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFields({});
    const body: UpdateProfileRequest = {
      displayName: form.displayName,
      about: form.about,
      city: form.city,
      country: form.country,
      interests: form.interests,
      relationship: form.relationship,
      birthdayDay: form.birthdayDay ? Number(form.birthdayDay) : null,
      birthdayMonth: form.birthdayMonth ? Number(form.birthdayMonth) : null,
      birthdayVisible,
      visibility,
    };
    const r = await wrap(() => client.social.updateProfile(body));
    setBusy(false);
    if (r.ok) {
      await queryClient.invalidateQueries({ queryKey: qk.socialMe() });
      await queryClient.invalidateQueries({ queryKey: qk.socialPerson(profile.handle) });
      toast({ kind: "success", title: "Profile saved" });
      return;
    }
    const sent = r.error.details?.["fields"] as Fields | undefined;
    if (sent) setFields(sent);
    else toast({ kind: "error", title: "Couldn't save", description: r.error.message });
  };

  return (
    <form className="space-y-4" onSubmit={submit}>
      {TEXT_FIELDS.map(({ key, label }) => (
        <div key={key} className="space-y-1.5">
          <Label htmlFor={key}>{label}</Label>
          <Input id={key} value={form[key]} onChange={set(key)} />
          {error(key)}
        </div>
      ))}
      <div className="space-y-1.5">
        <Label htmlFor="about">About you</Label>
        <textarea
          id="about"
          rows={5}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          value={form.about}
          onChange={set("about")}
        />
        {error("about")}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="day">Birthday: day</Label>
          <Input id="day" inputMode="numeric" value={form.birthdayDay} onChange={set("birthdayDay")} />
          {error("birthdayDay")}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="month">Month (1 to 12)</Label>
          <Input id="month" inputMode="numeric" value={form.birthdayMonth} onChange={set("birthdayMonth")} />
          {error("birthdayMonth")}
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={birthdayVisible} onChange={(e) => setBirthdayVisible(e.target.checked)} />
        Show my birthday on my page
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={visibility === "friends"}
          onChange={(e) => setVisibility(e.target.checked ? "friends" : "everyone")}
        />
        Show my page to friends only
      </label>
      <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
    </form>
  );
}

export default function SettingsPage() {
  const { client } = useSession();
  const me = useApiQuery(qk.socialMe(), () => wrap(() => client.social.me()));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your profile</CardTitle>
        <CardDescription>Everything except your name is optional. Only signed-in members can see your page.</CardDescription>
      </CardHeader>
      <CardContent>{me.data && <EditForm profile={me.data.profile} />}</CardContent>
    </Card>
  );
}
