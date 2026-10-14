import { useNavigate } from "react-router";
import { useMe } from "../auth";
import { Icon } from "../components/Icon";

/** Plain-language privacy policy. Linked from the account page and from the Google sign-in consent screen. */
export function PrivacyPage() {
  const navigate = useNavigate();
  const { contact } = useMe();
  const CONTACT_EMAIL = contact ?? "the address on our Instagram page";
  return (
    <main className="page legal" style={{ gap: 14 }}>
      <div className="topbar">
        <button className="icon-btn plain" aria-label="Back" onClick={() => navigate(-1)}>
          <Icon name="back" />
        </button>
        <h1 style={{ margin: 0, fontSize: 22 }}>Privacy</h1>
        <span style={{ width: 44 }} />
      </div>
      <p className="small">Last updated 14 October 2026</p>

      <h2>What TrailZ is</h2>
      <p>TrailZ takes a public link to a travel video (TikTok, Instagram Reel or YouTube Short) and tells you what the place is really like, lets you save places, plan trips and see prices from travel partners. You can use all of that without an account.</p>

      <h2>What we store</h2>
      <ul>
        <li><b>The videos you check.</b> The link, its title, creator name and cover image, plus the analysis. Checked videos are public inside TrailZ: anyone can see them in Explore, without your name.</li>
        <li><b>Your saves and trips.</b> Tied to an anonymous id in a cookie on your phone, or to your account once you log in.</li>
        <li><b>Your picks</b> from the intro (vibes, who you travel with, a budget range, home city). All optional.</li>
        <li><b>Your Google account basics</b> if you log in: name, email address and profile picture. We never see your password and we do not read your Gmail, contacts or anything else.</li>
        <li><b>Shares and votes</b> when you ask friends about a place or trip.</li>
      </ul>

      <h2>Cookies</h2>
      <p>Two: one anonymous id so the app remembers your saves, one session cookie when you log in. No advertising cookies, no tracking across other sites.</p>

      <h2>Who else sees data</h2>
      <ul>
        <li>The video link is sent to a transcription service and an AI model to analyse it.</li>
        <li>Place names are sent to Wikipedia/Wikimedia (photos) and OpenStreetMap (maps).</li>
        <li>When you look at prices, your route, dates and traveller count are sent to flight and hotel search partners (Travelpayouts/Aviasales, Google via SerpApi, Duffel). Booking happens on the partner's site; we may earn a commission. Your card details never pass through TrailZ.</li>
        <li>Hosting: Cloudflare.</li>
      </ul>
      <p>We do not sell personal data.</p>

      <h2>Delete your data</h2>
      <p>Log out to detach this phone. To delete your account and everything linked to it, email {contact ? <a href={`mailto:${contact}`}>{contact}</a> : CONTACT_EMAIL} from the address you logged in with; we delete within 30 days. Checked videos stay in Explore because they aren't linked to you.</p>

      <h2>Contact</h2>
      <p>{CONTACT_EMAIL}</p>
    </main>
  );
}
