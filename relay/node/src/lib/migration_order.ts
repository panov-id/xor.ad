// What tools/migrate_db.ts may apply, decided before it applies anything.
//
// The runner records files by name and applies what is not recorded, in name
// order. That order is only the same everywhere if every new file sorts above
// everything any database has already recorded. A file dropped into a gap in
// the numbering — and the squash of 2026-09-24 left five (035–038, 040) — would
// run in its place on a fresh database and last on one that has the later
// files: one set of files, two histories, and no error (review panel
// 2026-09-24, O3/D1). So a pending file below the highest recorded name is
// refused, before anything runs.
//
// Recorded names with no file are only reported. They are what a rollback
// looks like — an older image on a database a newer one migrated — and what a
// squash leaves on a database that ran the parts; refusing them would break the
// rollback the release procedure relies on. They still count as history for
// the order check: a new 040_x.sql sorts below a recorded 040_support_brand.sql.

export interface MigrationPlan {
  pending: string[];
  outOfOrder: { file: string; highest: string }[];
  ghosts: string[];
}

export function planMigrations(files: string[], applied: Iterable<string>): MigrationPlan {
  const recorded = [...new Set(applied)].sort();
  const recordedSet = new Set(recorded);
  const onDisk = new Set(files);
  const highest = recorded.at(-1);
  const pending = files.filter((name) => !recordedSet.has(name));
  return {
    pending,
    outOfOrder: highest === undefined
      ? []
      : pending.filter((name) => name < highest).map((file) => ({ file, highest })),
    ghosts: recorded.filter((name) => !onDisk.has(name)),
  };
}
