import pool from "@/lib/db";

export default async function Home() {
  let dbOk = false;
  try {
    const [rows] = await pool.query("SELECT 1 AS test");
    dbOk = true;
  } catch {
    dbOk = false;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold">Mike Quisido</h1>
      <p className="text-sm text-gray-500">
        Database: {dbOk ? "Connected" : "Disconnected"}
      </p>
    </div>
  );
}
