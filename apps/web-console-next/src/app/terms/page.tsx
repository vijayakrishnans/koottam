import { LegalPage } from "@/components/social/legal-page";

export const metadata = { title: "Terms · Koottam" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms">
      <h2>Who can join</h2>
      <p>You must be 18 or older, and you need an invite. You&rsquo;re responsible for your account and for the invites you send.</p>
      <h2>What isn&rsquo;t allowed</h2>
      <ul>
        <li>Harassing, threatening or bullying anyone.</li>
        <li>Hate directed at people for who they are.</li>
        <li>Anything sexual involving a minor, or anything that endangers a child. We remove it and may report it to the authorities.</li>
        <li>Sharing other people&rsquo;s private information or sexual images without their consent.</li>
        <li>Spam, scams, or anything illegal where you or the people you&rsquo;re addressing live.</li>
        <li>Pretending to be someone else.</li>
      </ul>
      <h2>What you write</h2>
      <p>What you write stays yours. By posting it, you let Koottam store it and show it to the people your settings allow.</p>
      <h2>Moderation</h2>
      <p>
        Anyone can report anything. Moderators can remove content and suspend accounts that break these terms, and community moderators
        can remove posts and ban members in their own communities.
      </p>
      <h2>Leaving</h2>
      <p>You can download your data and delete your account at any time in Settings.</p>
      <h2>No guarantees</h2>
      <p>Koottam is a young service, provided as it is. It may change, go down, or close.</p>
    </LegalPage>
  );
}
