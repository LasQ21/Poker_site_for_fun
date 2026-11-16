import { z } from "zod";

const chips = z.number().int().min(0).max(1_000_000_000);

export const blindLevelSchema = z.object({
  sb: chips,
  bb: chips,
  ante: chips.default(0),
  minutes: z.number().int().min(0).max(600),
  isBreak: z.boolean().optional(),
});

export const createGameSchema = z.object({
  name: z.string().max(80).optional(),
  type: z.enum(["cash", "tournament"]),
  startingStack: z.number().int().min(1).max(100_000_000),
  blindTemplate: z.enum(["turbo", "regular", "deep", "cash"]).optional(),
  blindStructure: z.array(blindLevelSchema).max(100).optional(),
  reminderIntervalMin: z.number().int().min(0).max(240).nullable().optional(),
  chatId: z.number().int().nullable().optional(),
  hostPlays: z.boolean().optional(),
  playerNames: z.array(z.string().max(40)).max(30).optional(),
});

export const updateGameSchema = z.object({
  name: z.string().max(80).optional(),
  reminderIntervalMin: z.number().int().min(0).max(240).nullable().optional(),
  blindStructure: z.array(blindLevelSchema).min(1).max(100).optional(),
  startingStack: z.number().int().min(1).max(100_000_000).optional(),
});

const pid = z.number().int().positive();

export const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("addPlayer"), displayName: z.string().min(1, "Вкажіть ім'я").max(40) }),
  z.object({ action: z.literal("join"), playerId: pid.optional() }),
  z.object({
    action: z.literal("updatePlayer"),
    playerId: pid,
    displayName: z.string().max(40).optional(),
    unlink: z.boolean().optional(),
    status: z.enum(["active", "left"]).optional(),
  }),
  z.object({ action: z.literal("removePlayer"), playerId: pid }),
  z.object({ action: z.literal("setStack"), playerId: pid, chips }),
  z.object({
    action: z.literal("buyin"),
    playerId: pid,
    kind: z.enum(["buyin", "rebuy", "addon"]).default("rebuy"),
    chips: chips.positive().optional(),
  }),
  z.object({ action: z.literal("deleteBuyin"), buyinId: pid }),
  z.object({ action: z.literal("bust"), playerId: pid }),
  z.object({ action: z.literal("unbust"), playerId: pid }),
  z.object({ action: z.literal("timer"), timer: z.enum(["start", "pause", "resume", "next", "prev", "reset"]) }),
  z.object({ action: z.literal("end"), finalStacks: z.record(z.string(), chips).optional() }),
  z.object({ action: z.literal("reopen") }),
]);

export type GameAction = z.infer<typeof actionSchema>;
export type GameActionInput = z.input<typeof actionSchema>;
