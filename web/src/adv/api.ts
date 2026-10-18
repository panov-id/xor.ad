// The advertising cabinet's calls: moved to depth/core/cabinet.ts on 18.10.2026 (one copy for this face and the
// app shell's cabinet); behaviour unchanged. What stays here is the language the web speaks them in.

import { momentIn } from "../../../depth/core/cabinet.ts";
import { LANG } from "../locales/say.ts";

export {
  addVenue, answerComplaint, type Answer, type Complaint, complaints, me, movePlace, notUs, type Offer, offers, openSession, orderEnvelope, type Place,
  publish, RADII, type Refusal, signIn, signOut, signUp, type Venue, venues, verify,
} from "../../../depth/core/cabinet.ts";

// A moment as the sheet writes it: "30 сентября, 18:00".
export const when = (iso: string | null): string => momentIn(LANG, iso);
