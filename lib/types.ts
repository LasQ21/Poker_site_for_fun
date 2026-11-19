import type { BlindLevel } from "@/lib/game/blinds";
import type { LeaderboardRow, ResultRow } from "@/lib/game/results";

/** JSON shapes returned by the API (dates are ISO strings). */
export interface GameDTO {
  id: string;
  name: string;
  chatId: number | null;
  seasonId: number | null;
  hostUserId: number;
  type: "cash" | "tournament";
  status: "active" | "finished";
  startingStack: number;
  blindStructure: BlindLevel[];
  blindLevel: number;
  levelStartedAt: string | null;
  pausedRemainingMs: number | null;
  turnSeconds: number;
  joinCode: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface PlayerDTO {
  id: number;
  displayName: string;
  userId: number | null;
  status: "active" | "busted" | "left";
  finishPlace: number | null;
  finalChips: number | null;
  currentChips: number;
  buyinChips: number;
  buyinCount: number;
  lastUpdateAt: string | null;
}

export interface GameStateDTO {
  game: GameDTO;
  host: { id: number; name: string };
  chat: { title: string; publicId: string } | null;
  players: PlayerDTO[];
  buyins: { id: number; playerId: number; chips: number; kind: "buyin" | "rebuy" | "addon"; createdAt: string }[];
  snapshots: { playerId: number; chips: number; t: number }[];
  results: ResultRow[];
  check: { totalStacks: number; totalBuyins: number; diff: number };
  viewer: { id: number; firstName: string } | null;
  role: "host" | "player" | "viewer";
  myPlayerId: number | null;
  serverNow: number;
}

export interface GameListItemDTO {
  id: string;
  name: string;
  type: "cash" | "tournament";
  status: "active" | "finished";
  createdAt: string;
  finishedAt: string | null;
  playerCount: number;
  isHost: boolean;
  chatTitle: string | null;
  winner: string | null;
}

export interface MeDTO {
  user: { id: number; firstName: string; lastName: string | null; username: string | null; photoUrl: string | null } | null;
  chats: { id: number; publicId: string; title: string }[];
  botUsername: string | null;
  devLogin: boolean;
  miniAppBase: string | null;
  appUrl: string;
}

export interface LeaderboardDTO {
  chat: { title: string; publicId: string };
  seasons: { id: number; name: string; isActive: boolean; startsAt: string; endsAt: string | null }[];
  season: { id: number; name: string } | null;
  gamesCount: { cash: number; tournament: number };
  tournament: LeaderboardRow[];
  cash: LeaderboardRow[];
  recent: { id: string; name: string; type: string; finishedAt: string | null; winner: string | null }[];
}

export type { ProfileData as ProfileDTO } from "@/lib/server/profile";
