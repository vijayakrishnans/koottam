import { LegalPage } from "@/components/social/legal-page";

export const metadata = { title: "Privacy · Koottam" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy">
      <h2>What we keep</h2>
      <ul>
        <li>Your email address, or your sign-in provider&rsquo;s account details, to sign you in.</li>
        <li>What you put on your profile. Everything except your name and handle is optional.</li>
        <li>What you write: scraps, testimonials, posts and topics.</li>
        <li>Your friends, fans, ratings, blocks, communities and the reports you make.</li>
        <li>Security logs of sign-ins, which can include your IP address and browser.</li>
      </ul>
      <h2>Who can see it</h2>
      <ul>
        <li>Only signed-in members can see profiles, and you can limit your page to friends.</li>
        <li>Your email address is never shown to other members.</li>
        <li>Nobody can see how you rated someone, and averages appear only once three people have rated.</li>
        <li>Moderators can see reported content, and who reported it.</li>
      </ul>
      <h2>What we don&rsquo;t do</h2>
      <p>Koottam has no ads, doesn&rsquo;t sell your data, and doesn&rsquo;t rank what you see.</p>
      <h2>Where it lives</h2>
      <p>Koottam runs on Cloudflare, which stores and processes this data for us.</p>
      <h2>Your choices</h2>
      <p>
        In Settings you can download everything you&rsquo;ve put here, or delete your account. Deleting removes your profile, what you
        wrote, and your email address. A report someone else made about you is closed. A report you made stays open for review, without
        your name on it. A minimal record of the account and of past administrative actions can remain, without your email or what you
        wrote.
      </p>
    </LegalPage>
  );
}
