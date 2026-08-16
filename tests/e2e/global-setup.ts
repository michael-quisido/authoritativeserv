import { resetDatabase } from "./reset-db";

export default async function globalSetup(): Promise<void> {
  await resetDatabase();
}
