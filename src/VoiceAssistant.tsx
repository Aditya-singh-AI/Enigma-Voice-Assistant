import React, { useState, useRef, useEffect } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { toast } from "sonner";
import { Button } from "./components/ui/button";
import { Avatar, AvatarFallback } from "./components/ui/avatar";
import { Bot, BrainCircuit, CircleHelp, LoaderCircle, Lock, MessageCircle, Mic, MicOff, RefreshCw, Send, ShieldAlert, Smile, Timer, User, VolumeX } from "lucide-react";
import { Doc } from "../convex/_generated/dataModel";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "./components/ui/input";

type Message = Doc<"conversations">["messages"][number];

interface VoiceAssistantState {
  isListening: boolean;
  isProcessing: boolean;
  isSpeaking: boolean;
  sessionId: string;
  transcript: string;
  permissionStatus: 'loading' | 'granted' | 'prompt' | 'denied';
}

export default function VoiceAssistant({ userEmail }: { userEmail?: string | null }) {
  const [state, setState] = useState<VoiceAssistantState>({
    isListening: false,
    isProcessing: false,
    isSpeaking: false,
    sessionId: `session_${Date.now()}`,
    transcript: "",
    permissionStatus: 'loading',
  });

  const recognitionRef = useRef<any | null>(null);
  const synthesisRef = useRef<SpeechSynthesis | null>(null);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const conversationEndRef = useRef<HTMLDivElement>(null);

  const processVoiceInput = useAction(api.voiceAssistant.processVoiceInput);
  const initializeDefaults = useMutation(api.voiceAssistant.initializeDefaults);
  const conversation = useQuery(api.voiceAssistant.getConversationHistory, { sessionId: state.sessionId });
  const metrics = useQuery(api.voiceAssistant.getPerformanceMetrics);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const checkPermissions = async () => {
      if (navigator.permissions) {
        try {
          const permission = await navigator.permissions.query({ name: "microphone" as PermissionName });
          setState(prev => ({ ...prev, permissionStatus: permission.state }));
          permission.onchange = () => setState(prev => ({ ...prev, permissionStatus: permission.state }));
        } catch (err) {
          console.warn("Could not query microphone permission status:", err);
          setState(prev => ({ ...prev, permissionStatus: 'prompt' }));
        }
      } else {
        setState(prev => ({ ...prev, permissionStatus: 'prompt' }));
      }
    };
    checkPermissions();
    
    const windowWithSpeech = window as any;
    const SpeechRecognitionAPI = windowWithSpeech.SpeechRecognition || windowWithSpeech.webkitSpeechRecognition;

    if (SpeechRecognitionAPI) {
      const rec = new SpeechRecognitionAPI();
      rec.continuous = false;
      rec.interimResults = true;
      rec.lang = "en-US";

      rec.onstart = () => setState(prev => ({ ...prev, isListening: true, transcript: "" }));
      rec.onresult = (event: any) => {
        let transcript = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        setState(prev => ({ ...prev, transcript }));
      };
      rec.onend = () => {
        setState(prev => ({ ...prev, isListening: false }));
        // Automatically process transcript on end if not empty
        if (recognitionRef.current?.finalTranscript) {
          processTranscript(recognitionRef.current.finalTranscript);
          recognitionRef.current.finalTranscript = "";
        }
      };
      rec.onerror = (event: any) => {
        console.error("Speech recognition error:", event.error);
        setState(prev => ({ ...prev, isListening: false }));
        if (event.error === 'not-allowed') {
          setState(prev => ({ ...prev, permissionStatus: 'denied' }));
        } else {
          toast.error("Speech recognition error: " + event.error);
        }
      };
      recognitionRef.current = rec;
    } else {
      toast.error("Speech recognition not supported in this browser");
    }

    if (windowWithSpeech.speechSynthesis) {
      synthesisRef.current = windowWithSpeech.speechSynthesis;
    } else {
      toast.error("Speech synthesis not supported in this browser");
    }

    initializeDefaults().catch(console.error);
  }, [initializeDefaults]);

  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation?.messages]);

  const requestMicrophonePermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      setState(prev => ({ ...prev, permissionStatus: 'granted' }));
      toast.success("Microphone access granted!");
    } catch (err) {
      console.error("Error requesting microphone permission:", err);
      setState(prev => ({ ...prev, permissionStatus: 'denied' }));
      toast.error("Microphone permission denied.");
    }
  };

  const startListening = () => {
    if (state.permissionStatus === 'prompt') {
      requestMicrophonePermission();
    } else if (recognitionRef.current && !state.isListening && !state.isProcessing) {
      recognitionRef.current.start();
    }
  };

  const stopListening = () => {
    if (recognitionRef.current && state.isListening) {
      recognitionRef.current.finalTranscript = state.transcript;
      recognitionRef.current.stop();
    }
  };

  const processTranscript = async (transcript: string) => {
    if (!transcript.trim()) return;
    setState(prev => ({ ...prev, isProcessing: true, transcript: "" }));

    try {
      const result = await processVoiceInput({ text: transcript, sessionId: state.sessionId });
      
      // We've received the response, so we're no longer "processing" the input.
      setState(prev => ({ ...prev, isProcessing: false }));

      if (synthesisRef.current && result.response) {
        const utterance = new SpeechSynthesisUtterance(result.response);
        utterance.rate = 0.9;
        utterance.pitch = 1.0;
        utterance.volume = 0.8;
        utterance.onstart = () => setState(prev => ({ ...prev, isSpeaking: true }));
        utterance.onend = () => setState(prev => ({ ...prev, isSpeaking: false }));
        currentUtteranceRef.current = utterance;
        synthesisRef.current.speak(utterance);
      }
    } catch (error) {
      console.error("Error processing voice input:", error);
      toast.error("Failed to process voice input");
      setState(prev => ({ ...prev, isProcessing: false }));
    }
  };

  const examplePrompts = [
    "What's the weather like in London?",
    "I'm feeling a bit down today",
    "Tell me a fun fact about space",
  ];

  const getEmotionColor = (emotion: string) => ({
    happy: "text-yellow-300", sad: "text-blue-300", angry: "text-red-400",
    fear: "text-purple-300", surprise: "text-green-300", neutral: "text-gray-400",
  }[emotion] || "text-gray-400");

  const renderPermissionUI = () => {
    const commonButtonClass = "w-28 h-28 rounded-full shadow-lg border-4 transition-all duration-300";
    const disabled = state.isProcessing || state.isSpeaking;

    switch (state.permissionStatus) {
      case 'loading':
        return <LoaderCircle className="w-12 h-12 animate-spin text-muted-foreground" />;
      case 'denied':
        return (
          <div className="text-center text-destructive">
            <ShieldAlert size={48} className="mx-auto mb-4" />
            <p className="font-semibold text-lg">Microphone Blocked</p>
            <p className="text-sm text-destructive/80 mt-2">Enable microphone access in browser settings, then reload.</p>
            <Button variant="secondary" className="mt-4" onClick={() => window.location.reload()}>
              <RefreshCw className="mr-2 h-4 w-4" /> Reload
            </Button>
          </div>
        );
      case 'prompt':
        return (
          <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
            <Button onClick={requestMicrophonePermission} className={`${commonButtonClass} border-dashed border-muted-foreground bg-transparent hover:bg-white/5`}>
              <MicOff size={48} className="text-muted-foreground" />
            </Button>
            <p className="mt-4 text-muted-foreground">Grant Permission</p>
          </motion.div>
        );
      case 'granted':
        return (
          <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
            <Button
              onClick={state.isListening ? stopListening : startListening}
              disabled={disabled}
              className={`${commonButtonClass} ${state.isListening ? 'border-red-500 bg-red-500/20 animate-pulse' : 'border-brand-blue bg-brand-blue/20 animate-pulse-glow'} disabled:animate-none disabled:bg-muted/20 disabled:border-muted-foreground`}
            >
              <Mic size={48} />
            </Button>
            <p className="mt-4 h-5 text-muted-foreground italic">
              {state.isListening ? `Listening...` : state.isProcessing ? "Thinking..." : state.isSpeaking ? "Speaking..." : "Tap to speak"}
            </p>
          </motion.div>
        );
    }
  };

  return (
    <div className="w-full h-full max-h-full lg:max-h-[85vh] grid grid-cols-1 lg:grid-cols-3 gap-6 p-2 sm:p-4 rounded-2xl border border-white/10 bg-black/20 backdrop-blur-xl shadow-2xl shadow-brand-blue/10">
      {/* Main Conversation Panel */}
  <div className="lg:col-span-2 flex flex-col h-full min-h-0 overflow-hidden rounded-lg border border-white/10 bg-black/20 p-4">
  <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-6 max-h-[60vh] lg:max-h-[65vh]">
          <AnimatePresence>
            {conversation && conversation.messages.length > 0 ? (
              conversation.messages.map((message: Message) => (
                <motion.div
                  key={message.id}
                  layout
                  initial={{ opacity: 0, y: 20, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.3 }}
                  className={`flex items-start gap-3 ${message.type === "user" ? "justify-end" : "justify-start"}`}
                >
                  {message.type === "assistant" && <Avatar><AvatarFallback className="bg-brand-blue text-white"><Bot size={20} /></AvatarFallback></Avatar>}
                  <div className={`max-w-lg rounded-xl px-4 py-3 ${message.type === "user" ? "bg-brand-blue text-white" : "bg-white/10"}`}>
                    <p>{message.content}</p>
                    {message.type === "user" && message.sentiment && (
                      <div className="mt-2 flex items-center gap-2 text-xs opacity-70">
                        <Smile className={`w-4 h-4 ${getEmotionColor(message.sentiment.emotion)}`} />
                        <span>{message.sentiment.emotion}</span>
                      </div>
                    )}
                  </div>
                  {message.type === "user" && <Avatar><AvatarFallback className="bg-muted"><User size={20} /></AvatarFallback></Avatar>}
                </motion.div>
              ))
            ) : (
              <motion.div key="empty-state" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                <MessageCircle size={48} className="mb-4" />
                <p className="font-semibold text-lg">Your conversation starts here</p>
                <p className="text-sm">{userEmail ? `Welcome, ${userEmail}` : "Welcome!"}</p>
              </motion.div>
            )}
          </AnimatePresence>
          <div ref={conversationEndRef} />
        </div>
        <div className="mt-4 flex items-center gap-2 pt-4 border-t border-white/10">
          <Input
            value={state.transcript}
            onChange={(e) => setState(prev => ({ ...prev, transcript: e.target.value }))}
            onKeyDown={(e) => e.key === 'Enter' && processTranscript(state.transcript)}
            placeholder="Or type your message..."
            className="bg-white/5 border-white/10 flex-1"
            disabled={state.isProcessing || state.isSpeaking}
          />
          <Button size="icon" onClick={() => processTranscript(state.transcript)} disabled={!state.transcript || state.isProcessing || state.isSpeaking}>
            {state.isProcessing ? <LoaderCircle className="animate-spin" /> : <Send />}
          </Button>
        </div>
      </div>

      {/* Control & Info Panel */}
      <div className="lg:col-span-1 flex flex-col gap-6 h-full">
        <div className="flex-1 flex flex-col items-center justify-center p-6 rounded-lg bg-white/5 border border-white/10">
          {renderPermissionUI()}
        </div>
        <div className="space-y-2">
          <h3 className="font-semibold text-muted-foreground px-2">Try asking...</h3>
          {examplePrompts.map((prompt, i) => (
            <Button key={i} variant="ghost" className="w-full justify-start text-muted-foreground hover:bg-white/10 hover:text-foreground" onClick={() => processTranscript(prompt)} disabled={state.isProcessing || state.isSpeaking || state.permissionStatus !== 'granted'}>
              {prompt}
            </Button>
          ))}
        </div>
        {metrics && (
          <div className="grid grid-cols-2 gap-4 text-center">
            <div className="p-3 rounded-lg bg-white/5 border border-white/10">
              <div className="font-bold text-lg">{metrics.avgSentimentAccuracy.toFixed(0)}%</div>
              <div className="text-xs text-muted-foreground">Sentiment</div>
            </div>
            <div className="p-3 rounded-lg bg-white/5 border border-white/10">
              <div className="font-bold text-lg">{metrics.avgIntentAccuracy.toFixed(0)}%</div>
              <div className="text-xs text-muted-foreground">Intent</div>
            </div>
          </div>
        )}
        <div className="p-3 bg-yellow-900/20 border border-yellow-700/30 rounded-lg text-xs text-yellow-300 flex items-start gap-2">
          <CircleHelp size={28} className="flex-shrink-0" />
          <span><strong>Setup Required:</strong> For real-time Q&A, add your <code className="bg-yellow-400/20 px-1 rounded">OPENROUTER_API_KEY</code> in your Convex dashboard.</span>
        </div>
      </div>
    </div>
  );
}
