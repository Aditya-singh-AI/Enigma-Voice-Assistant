import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

const applicationTables = {
  conversations: defineTable({
    userId: v.id("users"),
    sessionId: v.string(),
    messages: v.array(v.object({
      id: v.string(),
      type: v.union(v.literal("user"), v.literal("assistant")),
      content: v.string(),
      timestamp: v.number(),
      sentiment: v.optional(v.object({
        emotion: v.string(),
        confidence: v.number(),
        valence: v.number(), // -1 to 1 (negative to positive)
        arousal: v.number(), // 0 to 1 (calm to excited)
      })),
      intent: v.optional(v.object({
        category: v.string(),
        confidence: v.number(),
        entities: v.array(v.object({
          type: v.string(),
          value: v.string(),
          confidence: v.number(),
        })),
      })),
    })),
    context: v.object({
      userMood: v.string(),
      conversationTopic: v.optional(v.string()),
      lastIntent: v.optional(v.string()),
      preferences: v.object({
        responseStyle: v.string(), // "empathetic", "professional", "casual"
        verbosity: v.string(), // "brief", "detailed"
      }),
    }),
  }).index("by_user_and_session", ["userId", "sessionId"])
    .index("by_user", ["userId"]),

  intents: defineTable({
    category: v.string(),
    patterns: v.array(v.string()),
    responses: v.array(v.string()),
    entities: v.array(v.object({
      type: v.string(),
      patterns: v.array(v.string()),
    })),
    requiredConfidence: v.number(),
  }).index("by_category", ["category"]),

  sentimentModels: defineTable({
    name: v.string(),
    emotionKeywords: v.object({
      happy: v.array(v.string()),
      sad: v.array(v.string()),
      angry: v.array(v.string()),
      fear: v.array(v.string()),
      surprise: v.array(v.string()),
      neutral: v.array(v.string()),
    }),
    intensityModifiers: v.array(v.object({
      word: v.string(),
      multiplier: v.number(),
    })),
  }),

  voiceSettings: defineTable({
    userId: v.id("users"),
    preferredVoice: v.string(),
    speechRate: v.number(),
    pitch: v.number(),
    volume: v.number(),
  }).index("by_user", ["userId"]),
};

export default defineSchema({
  ...authTables,
  ...applicationTables,
});
