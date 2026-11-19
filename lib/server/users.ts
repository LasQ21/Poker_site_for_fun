import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { chatMembers, chats, games, users, type User } from "@/lib/db/schema";
import type { TelegramUser } from "@/lib/auth/telegram";
import { claimSeatsForUser } from "./links";
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
  // First visit of a known player (e.g. "Бодя" = @q4r8t7): their name-only seats become theirs.
  try {
    await claimSeatsForUser(row);
  } catch (e) {
    console.error("[links] claim failed", e);
  }
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

/** Sets (or clears) the forum topic where the bot posts game news; active games of the chat follow it. */
export async function setChatTopic(chatId: number, topicId: number | null) {
  await db.update(chats).set({ topicId }).where(eq(chats.id, chatId));
  await db
    .update(games)
    .set({ topicId })
    .where(and(eq(games.chatId, chatId), eq(games.status, "active")));
}
