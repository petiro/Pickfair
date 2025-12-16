import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, decimal, integer, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export * from "./models/auth";

import { users } from "./models/auth";

export const betfairSettings = pgTable("betfair_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique().references(() => users.id),
  appKey: text("app_key"),
  certificate: text("certificate"),
  privateKey: text("private_key"),
  sessionToken: text("session_token"),
  sessionExpiry: timestamp("session_expiry"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const bets = pgTable("bets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  marketId: varchar("market_id").notNull(),
  eventName: text("event_name").notNull(),
  marketName: text("market_name").notNull(),
  betType: varchar("bet_type", { length: 10 }).notNull(),
  selections: jsonb("selections").notNull(),
  totalStake: decimal("total_stake", { precision: 10, scale: 2 }).notNull(),
  totalLiability: decimal("total_liability", { precision: 10, scale: 2 }),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  profitLoss: decimal("profit_loss", { precision: 10, scale: 2 }),
  placedAt: timestamp("placed_at").defaultNow(),
  settledAt: timestamp("settled_at"),
});

export const betfairSettingsRelations = relations(betfairSettings, ({ one }) => ({
  user: one(users, {
    fields: [betfairSettings.userId],
    references: [users.id],
  }),
}));

export const betsRelations = relations(bets, ({ one }) => ({
  user: one(users, {
    fields: [bets.userId],
    references: [users.id],
  }),
}));

export const insertBetfairSettingsSchema = createInsertSchema(betfairSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBetSchema = createInsertSchema(bets).omit({
  id: true,
  placedAt: true,
  settledAt: true,
});

export type InsertBetfairSettings = z.infer<typeof insertBetfairSettingsSchema>;
export type BetfairSettings = typeof betfairSettings.$inferSelect;

export type InsertBet = z.infer<typeof insertBetSchema>;
export type Bet = typeof bets.$inferSelect;

export const dutchingCalculationSchema = z.object({
  selections: z.array(z.object({
    selectionId: z.number(),
    selectionName: z.string(),
    backPrice: z.number(),
    layPrice: z.number(),
    selected: z.boolean(),
  })),
  totalStake: z.number().optional(),
  totalLiability: z.number().optional(),
  mode: z.enum(["stake", "liability"]),
  betType: z.enum(["back", "lay"]),
});

export type DutchingCalculation = z.infer<typeof dutchingCalculationSchema>;
