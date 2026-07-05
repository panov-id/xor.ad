import { seedTestData } from "./helpers/admin";

// Runs once before the suite: seed panel users and waitlist rows.
export default async function globalSetup() {
  await seedTestData();
}
