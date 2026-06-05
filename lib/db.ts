import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: "userauth",
  password: "passuserauth77",
  database: "authnamedb",
  waitForConnections: true,
  connectionLimit: 10,
});

export default pool;
