import React, { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useAction } from "convex/react";
import { api } from "../convex/_generated/api";
import { toast } from "sonner";

interface Message {
  id: string;
  type: "user" | "assistant";
  content: string;
  timestamp: number;
  sentiment?: {
    emotion: string;
    confidence: number;
    valence: number;
    arousal: number;
  };
  intent?: {
    category: string;
    confidence: number;
    entities: Array<{
      type: string;
      value: string;
      confidence: number;
    }>;
  };
}

interface VoiceAssistantState {
  isListening: boolean;
  isProcessing: boolean;
  isSpeaking: boolean;
  sessionId: string;
  transcript: string;
}

export default function VoiceAssistant() {
  const [state, setState] = useState<VoiceAssistantState>({
    isListening: false,
    isProcessing: false,
    isSpeaking: false,
    sessionId: `session_${Date.now()}`,
    transcript: "",
  });

  const [recognition, setRecognition] = useState<SpeechRecognition | null>(null);
  const [synthesis, setSynthesis] = useState<SpeechSynthesis | null>(null);
  const [currentUtterance, setCurrentUtterance] = useState<SpeechSynthesisUtterance | null>(null);

  const processVoiceInput = useAction(api.voiceAssistant.processVoiceInput);
  const initializeDefaults = useMutation(api.voiceAssistant.initializeDefaults);
  const conversation = useQuery(api.voiceAssistant.getConversationHistory, {
    sessionId: state.sessionId,
  });
  const metrics = useQuery(api.voiceAssistant.getPerformanceMetrics);

  // Initialize speech recognition and synthesis
  useEffect(() => {
    if (typeof window !== "undefined") {
      // Initialize speech recognition
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = "en-US";

        recognition.onstart = () => {
          setState(prev => ({ ...prev, isListening: true, transcript: "" }));
        };

        recognition.onresult = (event) => {
          let transcript = "";
          for (let i = event.resultIndex; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
          }
          setState(prev => ({ ...prev, transcript }));
        };

        recognition.onend = () => {
          setState(prev => ({ ...prev, isListening: false }));
        };

        recognition.onerror = (event) => {
          console.error("Speech recognition error:", event.error);
          setState(prev => ({ ...prev, isListening: false }));
          toast.error("Speech recognition error: " + event.error);
        };

        setRecognition(recognition);
      } else {
        toast.error("Speech recognition not supported in this browser");
      }

      // Initialize speech synthesis
      if (window.speechSynthesis) {
        setSynthesis(window.speechSynthesis);
      } else {
        toast.error("Speech synthesis not supported in this browser");
      }
    }

    // Initialize default data
    initializeDefaults().catch(console.error);
  }, [initializeDefaults]);

  const startListening = () => {
    if (recognition && !state.isListening && !state.isProcessing) {
      recognition.start();
    }
  };

  const stopListening = () => {
    if (recognition && state.isListening) {
      recognition.stop();
    }
  };

  const processTranscript = async (transcript: string) => {
    if (!transcript.trim()) return;

    setState(prev => ({ ...prev, isProcessing: true }));

    try {
      const result = await processVoiceInput({
        text: transcript,
        sessionId: state.sessionId,
      });

      // Speak the response
      if (synthesis && result.response) {
        const utterance = new SpeechSynthesisUtterance(result.response);
        utterance.rate = 0.9;
        utterance.pitch = 1.0;
        utterance.volume = 0.8;

        utterance.onstart = () => {
          setState(prev => ({ ...prev, isSpeaking: true }));
        };

        utterance.onend = () => {
          setState(prev => ({ ...prev, isSpeaking: false }));
          setCurrentUtterance(null);
        };

        utterance.onerror = (event) => {
          console.error("Speech synthesis error:", event);
          setState(prev => ({ ...prev, isSpeaking: false }));
          setCurrentUtterance(null);
        };

        setCurrentUtterance(utterance);
        synthesis.speak(utterance);
      }

      // Show metrics in toast
      const isQuestion = result.intent.category === "question" || 
        transcript.toLowerCase().includes("what") ||
        transcript.toLowerCase().includes("how") ||
        transcript.toLowerCase().includes("when") ||
        transcript.toLowerCase().includes("where") ||
        transcript.toLowerCase().includes("why") ||
        transcript.toLowerCase().includes("who");

      toast.success(
        `${isQuestion ? "🔍 Real-time answer" : "💬 Response"} generated in ${result.processingTime}ms | Sentiment: ${result.sentiment.emotion} (${(result.sentiment.confidence * 100).toFixed(1)}%) | Intent: ${result.intent.category} (${(result.intent.confidence * 100).toFixed(1)}%)`
      );

    } catch (error) {
      console.error("Error processing voice input:", error);
      toast.error("Failed to process voice input");
    } finally {
      setState(prev => ({ ...prev, isProcessing: false, transcript: "" }));
    }
  };

  const stopSpeaking = () => {
    if (synthesis && currentUtterance) {
      synthesis.cancel();
      setState(prev => ({ ...prev, isSpeaking: false }));
      setCurrentUtterance(null);
    }
  };

  const getEmotionColor = (emotion: string) => {
    const colors = {
      happy: "text-yellow-600 bg-yellow-100",
      sad: "text-blue-600 bg-blue-100",
      angry: "text-red-600 bg-red-100",
      fear: "text-purple-600 bg-purple-100",
      surprise: "text-green-600 bg-green-100",
      neutral: "text-gray-600 bg-gray-100",
    };
    return colors[emotion as keyof typeof colors] || colors.neutral;
  };

  const getIntentIcon = (category: string) => {
    const icons = {
      greeting: "👋",
      weather: "🌤️",
      music: "🎵",
      reminder: "⏰",
      emotion_support: "💙",
      question: "🔍",
      unknown: "❓",
    };
    return icons[category as keyof typeof icons] || icons.unknown;
  };

  return (
    <div className="space-y-6">
      {/* Control Panel */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex flex-col items-center space-y-4">
          {/* Main Voice Button */}
          <div className="relative">
            <button
              onClick={state.isListening ? stopListening : startListening}
              disabled={state.isProcessing}
              className={`w-24 h-24 rounded-full flex items-center justify-center text-white font-bold text-lg transition-all duration-300 ${
                state.isListening
                  ? "bg-red-500 hover:bg-red-600 animate-pulse"
                  : state.isProcessing
                  ? "bg-yellow-500 cursor-not-allowed"
                  : "bg-blue-500 hover:bg-blue-600 hover:scale-105"
              }`}
            >
              {state.isProcessing ? (
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
              ) : state.isListening ? (
                "🎤"
              ) : (
                "🎤"
              )}
            </button>
            
            {state.isListening && (
              <div className="absolute -inset-2 rounded-full border-4 border-red-300 animate-ping"></div>
            )}
          </div>

          {/* Status */}
          <div className="text-center">
            <p className="text-lg font-semibold text-gray-800">
              {state.isListening
                ? "Listening..."
                : state.isProcessing
                ? "Processing..."
                : state.isSpeaking
                ? "Speaking..."
                : "Tap to speak"}
            </p>
            
            {state.transcript && (
              <p className="text-sm text-gray-600 mt-2 italic">
                "{state.transcript}"
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-4">
            {state.transcript && !state.isProcessing && (
              <button
                onClick={() => processTranscript(state.transcript)}
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
              >
                Send Message
              </button>
            )}
            
            {state.isSpeaking && (
              <button
                onClick={stopSpeaking}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              >
                Stop Speaking
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Performance Metrics */}
      {metrics && (
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Performance Metrics</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {metrics.avgSentimentAccuracy.toFixed(1)}%
              </div>
              <div className="text-sm text-gray-600">Sentiment Accuracy</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {metrics.avgIntentAccuracy.toFixed(1)}%
              </div>
              <div className="text-sm text-gray-600">Intent Accuracy</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {metrics.avgResponseLatency}ms
              </div>
              <div className="text-sm text-gray-600">Avg Response Time</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">
                {metrics.totalMessages}
              </div>
              <div className="text-sm text-gray-600">Total Messages</div>
            </div>
          </div>
        </div>
      )}

      {/* Conversation History */}
      {conversation && conversation.messages.length > 0 && (
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Conversation</h3>
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {conversation.messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${
                  message.type === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                    message.type === "user"
                      ? "bg-blue-500 text-white"
                      : "bg-gray-100 text-gray-800"
                  }`}
                >
                  <p className="text-sm">{message.content}</p>
                  
                  {message.sentiment && message.intent && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      <span
                        className={`px-2 py-1 rounded-full text-xs ${getEmotionColor(
                          message.sentiment.emotion
                        )}`}
                      >
                        {message.sentiment.emotion} ({(message.sentiment.confidence * 100).toFixed(0)}%)
                      </span>
                      <span className="px-2 py-1 rounded-full text-xs bg-indigo-100 text-indigo-600">
                        {getIntentIcon(message.intent.category)} {message.intent.category}
                      </span>
                    </div>
                  )}
                  
                  <div className="text-xs opacity-70 mt-1">
                    {new Date(message.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-3">How to Use</h3>
        <div className="grid md:grid-cols-2 gap-4 text-sm text-gray-600">
          <div>
            <h4 className="font-semibold text-gray-800 mb-2">Voice Commands</h4>
            <ul className="space-y-1">
              <li>• "Hello" or "Hi" - Greetings</li>
              <li>• "What's the weather like?" - Real-time answers</li>
              <li>• "How do I..." - Get instant help</li>
              <li>• "When is..." - Time-based questions</li>
              <li>• "Tell me about..." - Information queries</li>
              <li>• Express emotions naturally</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-gray-800 mb-2">Features</h4>
            <ul className="space-y-1">
              <li>• 🔍 Real-time Q&A with OpenRouter</li>
              <li>• 💭 Real-time sentiment analysis</li>
              <li>• 🎯 Intent recognition</li>
              <li>• 🧠 Context-aware responses</li>
              <li>• 💙 Emotion-adaptive replies</li>
              <li>• 🔊 Voice synthesis output</li>
            </ul>
          </div>
        </div>
        
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800">
            <strong>🔑 Setup Required:</strong> To enable real-time Q&A, add your OpenRouter API key as the environment variable <code className="bg-yellow-100 px-1 rounded">OPENROUTER_API_KEY</code> in your Convex dashboard.
          </p>
        </div>
      </div>
    </div>
  );
}
