import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { chatMembers, chats, users, type User } from "@/lib/db/schema";
import type { TelegramUser } from "@/lib/auth/telegram";
import { nanoid } from "nanoid";

export async function upsertUser(u: TelegramUser): Promise<User> {
  const [row] = await db
    .insert(users)
    .values({
      id: u.id,
      firstName: u.first_name,
      lastName: u.last_name ?? null,
      username: u.username ?? null,
      photoUrl: u.photo_url ?? null,
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        firstName: u.first_name,
        lastName: u.last_name ?? null,
        username: u.username ?? null,
        photoUrl: sql`coalesce(${u.photo_url ?? null}, ${users.photoUrl})`,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

export async function upsertChat(id: number, title: string) {
  const [row] = await db
    .insert(chats)
    .values({ id, title, publicId: nanoid(12) })
    .onConflictDoUpdate({ target: chats.id, set: { title } })
    .returning();
  return row;
}

export async function touchMember(chatId: number, userId: number) {
  await db
    .insert(chatMembers)
    .values({ chatId, userId })
    .onConflictDoUpdate({ target: [chatMembers.chatId, chatMembers.userId], set: { lastSeenAt: new Date() } });
}

export function displayNameOf(u: { firstName: string; lastName?: string | null } | TelegramUser): string {
  if ("first_name" in u) return [u.first_name, u.last_name].filter(Boolean).join(" ").slice(0, 40);
  return [u.firstName, u.lastName].filter(Boolean).join(" ").slice(0, 40);
}
