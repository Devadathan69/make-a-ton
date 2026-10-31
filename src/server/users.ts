import type { Role, User } from "@/lib/contracts";
import { type Db, one } from "./db";

export interface UserRow {
  id: string; name: string; email: string; role: Role; customer_id: string | null;
  password_hash: string;
}
/** Explicit allowlist: never spread database auth rows into an API response. */
export function publicUser(row: UserRow): User {
  return { id: row.id, name: row.name, email: row.email, role: row.role, customerId: row.customer_id };
}
export async function findUserByEmail(db: Db, email: string) {
  return one<UserRow>(db, "SELECT * FROM users WHERE lower(email)=lower($1)", [email]);
}
