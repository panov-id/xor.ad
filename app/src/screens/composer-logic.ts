// The phrase composer's own small rules (sosed Dusk: w3_composer), apart from React for the unit tests.

/** How many live phrases a person holds at most: the node's own number (relay routes/feed.ts:155 «four live phrases
 * already», 409 {live}); GET /limits does not give it, so it stands here until the node says it. */
export const LIVE_PHRASES = 4;

/** The ring under the zone (w3_composer «3/4»): how many more live phrases the node takes now, from one's own live
 * ones (GET /identities/me phrases, as depth/ink/rooms.ts reads them). It is live phrases, not an hour: no hour here. */
export function liveLeft(ownLive: number): { left: number; of: number } {
  return { left: Math.max(0, LIVE_PHRASES - Math.max(0, ownLive)), of: LIVE_PHRASES };
}

/** Letters left of the node's limit (GET /limits phrase_length), counted as a person counts them (code points). */
export const lettersLeft = (text: string, limit: number): number => Math.max(0, limit - [...text].length);

/** A phrase goes when it has a letter, fits the limit, and the node takes one more live phrase. */
export const canSay = (text: string, limit: number, left: number): boolean => text.trim() !== "" && [...text].length <= limit && left > 0;
