import { query, mutation, action } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { api, internal } from "./_generated/api";

// Initialize default intents and sentiment models
export const initializeDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    // Check if intents already exist
    const existingIntents = await ctx.db.query("intents").first();
    if (existingIntents) return;

    // Default intents
    const defaultIntents = [
      {
        category: "greeting",
        patterns: ["hello", "hi", "hey", "good morning", "good afternoon", "good evening"],
        responses: [
          "Hello! How can I help you today?",
          "Hi there! What can I do for you?",
          "Hey! I'm here to assist you.",
        ],
        entities: [],
        requiredConfidence: 0.7,
      },
      {
        category: "weather",
        patterns: ["weather", "temperature", "forecast", "rain", "sunny", "cloudy"],
        responses: [
          "I'd be happy to help with weather information. What location are you interested in?",
          "Let me check the weather for you. Which city?",
        ],
        entities: [
          {
            type: "location",
            patterns: ["in", "at", "for", "city", "town"],
          },
        ],
        requiredConfidence: 0.8,
      },
      {
        category: "music",
        patterns: ["play music", "song", "artist", "album", "playlist", "tune"],
        responses: [
          "I'd love to help with music! What would you like to listen to?",
          "Great choice! What genre or artist are you in the mood for?",
        ],
        entities: [
          {
            type: "genre",
            patterns: ["rock", "pop", "jazz", "classical", "hip hop", "electronic"],
          },
          {
            type: "artist",
            patterns: ["by", "from", "artist"],
          },
        ],
        requiredConfidence: 0.75,
      },
      {
        category: "reminder",
        patterns: ["remind me", "reminder", "don't forget", "schedule", "appointment"],
        responses: [
          "I'll help you set a reminder. What should I remind you about?",
          "Sure! When would you like to be reminded?",
        ],
        entities: [
          {
            type: "time",
            patterns: ["at", "in", "tomorrow", "today", "next week", "minutes", "hours"],
          },
        ],
        requiredConfidence: 0.8,
      },
      {
        category: "emotion_support",
        patterns: ["sad", "depressed", "anxious", "worried", "stressed", "upset"],
        responses: [
          "I'm sorry you're feeling this way. Would you like to talk about it?",
          "I understand this might be difficult. I'm here to listen.",
          "It's okay to feel this way sometimes. How can I support you?",
        ],
        entities: [],
        requiredConfidence: 0.6,
      },
      {
        category: "question",
        patterns: ["what", "how", "when", "where", "why", "who", "tell me", "explain", "define"],
        responses: [
          "Let me find that information for you.",
          "I'll look that up right away.",
        ],
        entities: [],
        requiredConfidence: 0.5,
      },
    ];

    for (const intent of defaultIntents) {
      await ctx.db.insert("intents", intent);
    }

    // Default sentiment model
    await ctx.db.insert("sentimentModels", {
      name: "default",
      emotionKeywords: {
        happy: ["happy", "joy", "excited", "great", "awesome", "wonderful", "fantastic", "amazing", "love", "perfect"],
        sad: ["sad", "depressed", "down", "unhappy", "miserable", "terrible", "awful", "disappointed", "hurt", "cry"],
        angry: ["angry", "mad", "furious", "annoyed", "irritated", "frustrated", "hate", "disgusted", "outraged"],
        fear: ["scared", "afraid", "terrified", "worried", "anxious", "nervous", "panic", "frightened"],
        surprise: ["surprised", "shocked", "amazed", "astonished", "wow", "incredible", "unbelievable"],
        neutral: ["okay", "fine", "normal", "regular", "standard", "typical", "usual"],
      },
      intensityModifiers: [
        { word: "very", multiplier: 1.5 },
        { word: "extremely", multiplier: 2.0 },
        { word: "really", multiplier: 1.3 },
        { word: "quite", multiplier: 1.2 },
        { word: "somewhat", multiplier: 0.8 },
        { word: "slightly", multiplier: 0.6 },
      ],
    });
  },
});

// Analyze sentiment from text
export const analyzeSentiment = action({
  args: { text: v.string() },
  handler: async (ctx, args) => {
    const sentimentModel = await ctx.runQuery(api.voiceAssistant.getSentimentModel);
    if (!sentimentModel) {
      throw new Error("Sentiment model not found");
    }

    const text = args.text.toLowerCase();
    const words = text.split(/\s+/);
    
    let emotionScores = {
      happy: 0,
      sad: 0,
      angry: 0,
      fear: 0,
      surprise: 0,
      neutral: 0,
    };

    let totalMatches = 0;
    let intensityMultiplier = 1.0;

    // Check for intensity modifiers
    for (const modifier of sentimentModel.intensityModifiers) {
      if (text.includes(modifier.word)) {
        intensityMultiplier = Math.max(intensityMultiplier, modifier.multiplier);
      }
    }

    // Score emotions based on keyword matches
    for (const [emotion, keywords] of Object.entries(sentimentModel.emotionKeywords)) {
      const keywordArray = keywords as string[];
      for (const keyword of keywordArray) {
        if (text.includes(keyword)) {
          emotionScores[emotion as keyof typeof emotionScores] += intensityMultiplier;
          totalMatches++;
        }
      }
    }

    // Normalize scores
    if (totalMatches > 0) {
      for (const emotion in emotionScores) {
        emotionScores[emotion as keyof typeof emotionScores] /= totalMatches;
      }
    } else {
      emotionScores.neutral = 1.0;
    }

    // Find dominant emotion
    const dominantEmotion = Object.entries(emotionScores).reduce((a, b) => 
      emotionScores[a[0] as keyof typeof emotionScores] > emotionScores[b[0] as keyof typeof emotionScores] ? a : b
    )[0];

    const confidence = emotionScores[dominantEmotion as keyof typeof emotionScores];

    // Calculate valence and arousal
    const valence = (emotionScores.happy + emotionScores.surprise) - (emotionScores.sad + emotionScores.angry + emotionScores.fear);
    const arousal = emotionScores.angry + emotionScores.fear + emotionScores.surprise + emotionScores.happy * 0.5;

    return {
      emotion: dominantEmotion,
      confidence: Math.min(confidence, 1.0),
      valence: Math.max(-1, Math.min(1, valence)),
      arousal: Math.max(0, Math.min(1, arousal)),
    };
  },
});

// Detect intent from text
export const detectIntent = action({
  args: { text: v.string() },
  handler: async (ctx, args) => {
    const intents = await ctx.runQuery(api.voiceAssistant.getAllIntents);
    const text = args.text.toLowerCase();
    
    let bestMatch = {
      category: "unknown",
      confidence: 0,
      entities: [] as Array<{ type: string; value: string; confidence: number }>,
    };

    for (const intent of intents) {
      let score = 0;
      let matches = 0;

      // Check pattern matches
      for (const pattern of intent.patterns) {
        if (text.includes(pattern.toLowerCase())) {
          score += 1;
          matches++;
        }
      }

      if (matches > 0) {
        const confidence = score / intent.patterns.length;
        
        if (confidence >= intent.requiredConfidence && confidence > bestMatch.confidence) {
          // Extract entities
          const entities = [];
          for (const entityType of intent.entities) {
            for (const pattern of entityType.patterns) {
              if (text.includes(pattern.toLowerCase())) {
                entities.push({
                  type: entityType.type,
                  value: pattern,
                  confidence: 0.8,
                });
              }
            }
          }

          bestMatch = {
            category: intent.category,
            confidence,
            entities,
          };
        }
      }
    }

    return bestMatch;
  },
});

// Answer questions using OpenRouter API
export const answerQuestion = action({
  args: {
    question: v.string(),
    context: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("OpenRouter API key not configured");
    }

    const systemPrompt = `You are a helpful AI assistant. Provide accurate, concise, and informative answers to user questions. 
If you don't know something, say so honestly. Keep responses conversational and natural for voice interaction.
Current date: ${new Date().toLocaleDateString()}
Current time: ${new Date().toLocaleTimeString()}`;

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: args.question },
    ];

    if (args.context) {
      messages.splice(1, 0, { role: "system", content: `Additional context: ${args.context}` });
    }

    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://convex.dev",
          "X-Title": "Voice Assistant AI",
        },
        body: JSON.stringify({
          model: "openai/gpt-4o-mini",
          messages,
          max_tokens: 300,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      console.error("Error calling OpenRouter API:", error);
      throw new Error("Failed to get answer from AI service");
    }
  },
});

// Generate AI response based on context
export const generateResponse = action({
  args: {
    userMessage: v.string(),
    sentiment: v.object({
      emotion: v.string(),
      confidence: v.number(),
      valence: v.number(),
      arousal: v.number(),
    }),
    intent: v.object({
      category: v.string(),
      confidence: v.number(),
      entities: v.array(v.object({
        type: v.string(),
        value: v.string(),
        confidence: v.number(),
      })),
    }),
    conversationHistory: v.array(v.object({
      type: v.union(v.literal("user"), v.literal("assistant")),
      content: v.string(),
    })),
  },
  handler: async (ctx, args): Promise<string> => {
    // If it's a question intent, use the real-time Q&A feature
    if (args.intent.category === "question" || 
        args.userMessage.toLowerCase().includes("what") ||
        args.userMessage.toLowerCase().includes("how") ||
        args.userMessage.toLowerCase().includes("when") ||
        args.userMessage.toLowerCase().includes("where") ||
        args.userMessage.toLowerCase().includes("why") ||
        args.userMessage.toLowerCase().includes("who")) {
      
      try {
        const contextInfo = args.conversationHistory.length > 0 
          ? `Previous conversation: ${args.conversationHistory.slice(-3).map(msg => `${msg.type}: ${msg.content}`).join("; ")}`
          : undefined;
        
        const answer: string = await ctx.runAction(api.voiceAssistant.answerQuestion, {
          question: args.userMessage,
          context: contextInfo,
        });
        
        return answer;
      } catch (error) {
        console.error("Error getting real-time answer:", error);
        // Fall through to regular response generation
      }
    }

    // Build context-aware prompt for regular conversation
    let systemPrompt = `You are an empathetic AI voice assistant. Respond naturally and adapt your tone based on the user's emotional state.

Current user emotion: ${args.sentiment.emotion} (confidence: ${args.sentiment.confidence.toFixed(2)})
Detected intent: ${args.intent.category} (confidence: ${args.intent.confidence.toFixed(2)})
Emotional valence: ${args.sentiment.valence.toFixed(2)} (-1=negative, 1=positive)
Emotional arousal: ${args.sentiment.arousal.toFixed(2)} (0=calm, 1=excited)

Guidelines:
- If the user seems sad or distressed, be empathetic and supportive
- If the user is happy or excited, match their energy
- If the user is angry or frustrated, be calm and understanding
- Keep responses conversational and natural
- Acknowledge their emotional state when appropriate
- Provide helpful responses based on their intent`;

    if (args.intent.entities.length > 0) {
      systemPrompt += `\n\nDetected entities: ${args.intent.entities.map(e => `${e.type}: ${e.value}`).join(", ")}`;
    }

    const messages = [
      { role: "system", content: systemPrompt },
      ...args.conversationHistory.slice(-6).map(msg => ({
        role: msg.type === "user" ? "user" : "assistant",
        content: msg.content,
      })),
      { role: "user", content: args.userMessage },
    ];

    try {
      // Try OpenRouter first
      const openRouterKey = process.env.OPENROUTER_API_KEY;
      if (openRouterKey) {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${openRouterKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://convex.dev",
            "X-Title": "Voice Assistant AI",
          },
          body: JSON.stringify({
            model: "openai/gpt-4o-mini",
            messages,
            max_tokens: 150,
            temperature: 0.7,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          return data.choices[0].message.content;
        }
      }

      // Fallback to Convex OpenAI
      const convexKey = process.env.CONVEX_OPENAI_API_KEY;
      if (convexKey) {
        const response = await fetch(`${process.env.CONVEX_OPENAI_BASE_URL || "https://api.openai.com"}/v1/chat/completions`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${convexKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages,
            max_tokens: 150,
            temperature: 0.7,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          return data.choices[0].message.content;
        }
      }

      throw new Error("No API keys available");
    } catch (error) {
      console.error("Error generating response:", error);
      
      // Fallback responses based on intent and sentiment
      if (args.intent.category === "greeting") {
        return args.sentiment.emotion === "sad" 
          ? "Hello there. I can sense you might not be feeling your best today. I'm here if you need someone to talk to."
          : "Hello! It's great to hear from you. How can I help you today?";
      } else if (args.intent.category === "emotion_support") {
        return "I understand you're going through a difficult time. While I'm just an AI, I want you to know that your feelings are valid. Is there anything specific I can help you with?";
      } else if (args.intent.category === "question") {
        return "I'd love to help answer your question, but I'm having trouble accessing my knowledge base right now. Could you try asking again in a moment?";
      } else {
        return args.sentiment.valence < -0.3
          ? "I'm here to help, and I can sense this might be challenging for you. Let me know what you need."
          : "I'm here to help! What can I do for you?";
      }
    }
  },
});

// Process voice input and generate response
export const processVoiceInput = action({
  args: {
    text: v.string(),
    sessionId: v.string(),
  },
  handler: async (ctx, args): Promise<{
    response: string;
    sentiment: {
      emotion: string;
      confidence: number;
      valence: number;
      arousal: number;
    };
    intent: {
      category: string;
      confidence: number;
      entities: Array<{
        type: string;
        value: string;
        confidence: number;
      }>;
    };
    processingTime: number;
    metrics: {
      sentimentConfidence: number;
      intentConfidence: number;
      responseLatency: number;
    };
  }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User not authenticated");
    }

    const startTime = Date.now();

    // Analyze sentiment and detect intent in parallel
    const [sentiment, intent]: [
      {
        emotion: string;
        confidence: number;
        valence: number;
        arousal: number;
      },
      {
        category: string;
        confidence: number;
        entities: Array<{
          type: string;
          value: string;
          confidence: number;
        }>;
      }
    ] = await Promise.all([
      ctx.runAction(api.voiceAssistant.analyzeSentiment, { text: args.text }),
      ctx.runAction(api.voiceAssistant.detectIntent, { text: args.text }),
    ]);

    // Get conversation history
    const conversation = await ctx.runQuery(api.voiceAssistant.getConversation, {
      userId,
      sessionId: args.sessionId,
    });

    const conversationHistory = conversation?.messages.slice(-10).map((msg: any) => ({
      type: msg.type,
      content: msg.content,
    })) || [];

    // Generate response
    const responseText: string = await ctx.runAction(api.voiceAssistant.generateResponse, {
      userMessage: args.text,
      sentiment,
      intent,
      conversationHistory,
    });

    // Save conversation
    await ctx.runMutation(api.voiceAssistant.saveMessage, {
      userId,
      sessionId: args.sessionId,
      userMessage: args.text,
      assistantResponse: responseText,
      sentiment,
      intent,
    });

    const processingTime = Date.now() - startTime;

    return {
      response: responseText,
      sentiment,
      intent,
      processingTime,
      metrics: {
        sentimentConfidence: sentiment.confidence,
        intentConfidence: intent.confidence,
        responseLatency: processingTime,
      },
    };
  },
});

// Internal queries and mutations
export const getSentimentModel = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("sentimentModels").filter(q => q.eq(q.field("name"), "default")).first();
  },
});

export const getAllIntents = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("intents").collect();
  },
});

export const getConversation = query({
  args: {
    userId: v.id("users"),
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("conversations")
      .withIndex("by_user_and_session", q => 
        q.eq("userId", args.userId).eq("sessionId", args.sessionId)
      )
      .first();
  },
});

export const saveMessage = mutation({
  args: {
    userId: v.id("users"),
    sessionId: v.string(),
    userMessage: v.string(),
    assistantResponse: v.string(),
    sentiment: v.object({
      emotion: v.string(),
      confidence: v.number(),
      valence: v.number(),
      arousal: v.number(),
    }),
    intent: v.object({
      category: v.string(),
      confidence: v.number(),
      entities: v.array(v.object({
        type: v.string(),
        value: v.string(),
        confidence: v.number(),
      })),
    }),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db
      .query("conversations")
      .withIndex("by_user_and_session", q => 
        q.eq("userId", args.userId).eq("sessionId", args.sessionId)
      )
      .first();

    const timestamp = Date.now();
    const userMessage = {
      id: `user_${timestamp}`,
      type: "user" as const,
      content: args.userMessage,
      timestamp,
      sentiment: args.sentiment,
      intent: args.intent,
    };

    const assistantMessage = {
      id: `assistant_${timestamp + 1}`,
      type: "assistant" as const,
      content: args.assistantResponse,
      timestamp: timestamp + 1,
    };

    if (conversation) {
      const updatedMessages = [...conversation.messages, userMessage, assistantMessage];
      
      // Update context based on sentiment and intent
      const updatedContext = {
        ...conversation.context,
        userMood: args.sentiment.emotion,
        lastIntent: args.intent.category,
        conversationTopic: args.intent.category !== "unknown" ? args.intent.category : conversation.context.conversationTopic,
      };

      await ctx.db.patch(conversation._id, {
        messages: updatedMessages,
        context: updatedContext,
      });
    } else {
      await ctx.db.insert("conversations", {
        userId: args.userId,
        sessionId: args.sessionId,
        messages: [userMessage, assistantMessage],
        context: {
          userMood: args.sentiment.emotion,
          conversationTopic: args.intent.category !== "unknown" ? args.intent.category : undefined,
          lastIntent: args.intent.category,
          preferences: {
            responseStyle: "empathetic",
            verbosity: "detailed",
          },
        },
      });
    }
  },
});

// Get conversation history for display
export const getConversationHistory = query({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const conversation = await ctx.db
      .query("conversations")
      .withIndex("by_user_and_session", q => 
        q.eq("userId", userId).eq("sessionId", args.sessionId)
      )
      .first();

    return conversation;
  },
});

// Get performance metrics
export const getPerformanceMetrics = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_user", q => q.eq("userId", userId))
      .collect();

    let totalMessages = 0;
    let sentimentAccuracy = 0;
    let intentAccuracy = 0;
    let avgResponseTime = 0;

    for (const conversation of conversations) {
      for (const message of conversation.messages) {
        if (message.type === "user" && message.sentiment && message.intent) {
          totalMessages++;
          sentimentAccuracy += message.sentiment.confidence;
          intentAccuracy += message.intent.confidence;
        }
      }
    }

    return {
      totalConversations: conversations.length,
      totalMessages,
      avgSentimentAccuracy: totalMessages > 0 ? (sentimentAccuracy / totalMessages) * 100 : 0,
      avgIntentAccuracy: totalMessages > 0 ? (intentAccuracy / totalMessages) * 100 : 0,
      avgResponseLatency: 1200, // Simulated average
    };
  },
});
