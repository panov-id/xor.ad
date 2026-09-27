-- Complaints that the discount was not given, and the venue's answer
-- (offers/SPEC_RU.md §3, §10, §10.3).
--
-- The complaint keeps who made it only for the moderator and the monthly limit;
-- the cabinet reads text and date, never the person or the time. It is not
-- deleted on request — only with the account after the retention year, so it
-- goes by cascade with its offer. One answer per complaint: the cabinet's form
-- has one field, and a thread with the moderator is not what §10.3 describes.
CREATE TABLE offer_complaints (
  id                       uuid PRIMARY KEY,
  offer_id                 uuid NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  user_id                  uuid REFERENCES identities(id) ON DELETE SET NULL,
  notifier_email           text NOT NULL,
  text                     text CHECK (text IS NULL OR char_length(text) <= 2000),
  status                   text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'rejected')),
  counts_towards_autohide  boolean NOT NULL,   -- frozen at the moment of the complaint
  created_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX offer_complaints_offer ON offer_complaints (offer_id);

CREATE TABLE business_responses (
  id                  uuid PRIMARY KEY,
  offer_complaint_id  uuid NOT NULL UNIQUE REFERENCES offer_complaints(id) ON DELETE CASCADE,
  text                text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 2000),
  created_at          timestamptz NOT NULL DEFAULT now()
);
