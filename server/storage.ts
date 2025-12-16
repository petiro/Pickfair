import {
  users,
  betfairSettings,
  bets,
  type User,
  type UpsertUser,
  type BetfairSettings,
  type InsertBetfairSettings,
  type Bet,
  type InsertBet,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  getBetfairSettings(userId: string): Promise<BetfairSettings | undefined>;
  upsertBetfairSettings(settings: InsertBetfairSettings): Promise<BetfairSettings>;
  updateBetfairSession(userId: string, sessionToken: string | null, sessionExpiry: Date | null): Promise<void>;
  updateBetfairCertificate(userId: string, appKey: string, certificate: string, privateKey: string): Promise<void>;
  
  createBet(bet: InsertBet): Promise<Bet>;
  getBets(userId: string): Promise<Bet[]>;
  getRecentBets(userId: string, limit?: number): Promise<Bet[]>;
  getBetById(id: string): Promise<Bet | undefined>;
  updateBetStatus(id: string, status: string, profitLoss?: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async getBetfairSettings(userId: string): Promise<BetfairSettings | undefined> {
    const [settings] = await db
      .select()
      .from(betfairSettings)
      .where(eq(betfairSettings.userId, userId));
    return settings;
  }

  async upsertBetfairSettings(settings: InsertBetfairSettings): Promise<BetfairSettings> {
    const [result] = await db
      .insert(betfairSettings)
      .values(settings)
      .onConflictDoUpdate({
        target: betfairSettings.userId,
        set: {
          appKey: settings.appKey,
          sessionToken: settings.sessionToken,
          sessionExpiry: settings.sessionExpiry,
          updatedAt: new Date(),
        },
      })
      .returning();
    return result;
  }

  async updateBetfairSession(
    userId: string,
    sessionToken: string | null,
    sessionExpiry: Date | null
  ): Promise<void> {
    await db
      .update(betfairSettings)
      .set({
        sessionToken,
        sessionExpiry,
        updatedAt: new Date(),
      })
      .where(eq(betfairSettings.userId, userId));
  }

  async updateBetfairCertificate(
    userId: string,
    appKey: string,
    certificate: string,
    privateKey: string
  ): Promise<void> {
    const existing = await this.getBetfairSettings(userId);
    
    if (existing) {
      await db
        .update(betfairSettings)
        .set({
          appKey,
          certificate,
          privateKey,
          updatedAt: new Date(),
        })
        .where(eq(betfairSettings.userId, userId));
    } else {
      await db.insert(betfairSettings).values({
        userId,
        appKey,
        certificate,
        privateKey,
      });
    }
  }

  async createBet(bet: InsertBet): Promise<Bet> {
    const [result] = await db.insert(bets).values(bet).returning();
    return result;
  }

  async getBets(userId: string): Promise<Bet[]> {
    return db
      .select()
      .from(bets)
      .where(eq(bets.userId, userId))
      .orderBy(desc(bets.placedAt));
  }

  async getRecentBets(userId: string, limit = 10): Promise<Bet[]> {
    return db
      .select()
      .from(bets)
      .where(eq(bets.userId, userId))
      .orderBy(desc(bets.placedAt))
      .limit(limit);
  }

  async getBetById(id: string): Promise<Bet | undefined> {
    const [bet] = await db.select().from(bets).where(eq(bets.id, id));
    return bet;
  }

  async updateBetStatus(id: string, status: string, profitLoss?: string): Promise<void> {
    await db
      .update(bets)
      .set({
        status,
        profitLoss,
        settledAt: status === "won" || status === "lost" ? new Date() : undefined,
      })
      .where(eq(bets.id, id));
  }
}

export const storage = new DatabaseStorage();
