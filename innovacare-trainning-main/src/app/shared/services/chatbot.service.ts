import { Injectable, inject, signal } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Auth } from '@angular/fire/auth';
import { Router } from '@angular/router';
import {
  Firestore,
  collection,
  addDoc,
  serverTimestamp,
  doc,
  setDoc,
  getDoc,
} from '@angular/fire/firestore';
import { IntentService, AssistantIntent } from './intent.service';
import { CourseContextService } from './course-context.service';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date;
  intent?: AssistantIntent;
  /** Parsed quiz questions if intent === 'quiz' */
  quizData?: QuizQuestion[];
  /** Clinical case data */
  clinicalCase?: ClinicalCase;
  /** Whether this is a system-generated quick action result */
  isQuickAction?: boolean;
}

export interface ChatContext {
  userRole?: string;
  currentPage?: string;
  userName?: string;
  courseContext?: string;
  intentHint?: string;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  selectedIndex?: number;
  answered?: boolean;
}

export interface ClinicalCase {
  id: string;
  scenario: string;
  stage?: string;
  treatment?: string;
  risks?: string;
  awaitingAnswer?: boolean;
  evaluation?: string;
}

export interface QuizSession {
  sessionId: string;
  topic: string;
  questions: QuizQuestion[];
  score: number;
  total: number;
  completedAt?: Date;
}

export const QUICK_ACTIONS = [
  { label: '▶ Continue my course', message: 'Continue my course – where did I leave off?' },
  { label: '🧠 Quiz me', message: 'Quiz me on wound care topics' },
  { label: '🏥 Clinical case', message: 'Start a clinical case simulation' },
  { label: '🔤 Explain simply', message: 'Explain pressure injury stages like a beginner' },
  { label: '📝 Nursing note', message: 'Generate a nursing progress note' },
] as const;

@Injectable({ providedIn: 'root' })
export class ChatbotService {
  private functions = inject(Functions);
  private auth = inject(Auth);
  private router = inject(Router);
  private afs = inject(Firestore);
  private intentService = inject(IntentService);
  private courseCtx = inject(CourseContextService);

  readonly messages = signal<ChatMessage[]>([]);
  readonly loading = signal(false);
  readonly open = signal(false);

  /** Active quiz session */
  readonly activeQuiz = signal<QuizSession | null>(null);

  /** Score for the active session */
  readonly sessionScore = signal<{ correct: number; total: number }>({ correct: 0, total: 0 });

  toggle() {
    this.open.update((v) => !v);
  }

  close() {
    this.open.set(false);
  }

  clearHistory() {
    this.messages.set([]);
    this.activeQuiz.set(null);
    this.sessionScore.set({ correct: 0, total: 0 });
  }

  async sendMessage(text: string, overrideIntent?: AssistantIntent): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed || this.loading()) return;

    const detected = this.intentService.detect(trimmed);
    const intent = overrideIntent ?? detected.intent;
    const intentHint = this.intentService.getSystemHintForIntent(intent);

    const userMsg: ChatMessage = {
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
      intent,
    };
    this.messages.update((msgs) => [...msgs, userMsg]);
    this.loading.set(true);

    try {
      const context = this.buildContext(intentHint);
      const history = this.messages().map(({ role, content }) => ({ role, content }));

      const fn = httpsCallable<
        { messages: { role: string; content: string }[]; context: ChatContext },
        { reply: string }
      >(this.functions, 'chatWithAI');

      const result = await fn({ messages: history, context });
      const replyText = result.data.reply;

      // Parse quiz questions if the AI generated them
      let quizData: QuizQuestion[] | undefined;
      if (intent === 'quiz') {
        quizData = this.parseQuizFromText(replyText);
        if (quizData.length > 0) {
          const session: QuizSession = {
            sessionId: crypto.randomUUID(),
            topic: detected.topic ?? 'wound care',
            questions: quizData,
            score: 0,
            total: quizData.length,
          };
          this.activeQuiz.set(session);
          this.sessionScore.set({ correct: 0, total: quizData.length });
        }
      }

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: replyText,
        timestamp: new Date(),
        intent,
        quizData,
      };
      this.messages.update((msgs) => [...msgs, assistantMsg]);

      // Persist to Firestore
      this.persistMessage(userMsg, assistantMsg);
    } catch (err: unknown) {
      const errorMsg: ChatMessage = {
        role: 'assistant',
        content: '⚠️ An error occurred. Please try again.',
        timestamp: new Date(),
      };
      this.messages.update((msgs) => [...msgs, errorMsg]);
      console.error('[ChatbotService] Error:', err);
    } finally {
      this.loading.set(false);
    }
  }

  /** Handle a quiz answer selection */
  answerQuiz(messageIndex: number, questionIndex: number, selectedIndex: number): void {
    this.messages.update((msgs) =>
      msgs.map((msg, mi) => {
        if (mi !== messageIndex || !msg.quizData) return msg;
        const updatedQuiz = msg.quizData.map((q, qi) => {
          if (qi !== questionIndex || q.answered) return q;
          return { ...q, selectedIndex, answered: true };
        });
        return { ...msg, quizData: updatedQuiz };
      })
    );

    // Update score
    const msg = this.messages()[messageIndex];
    const q = msg?.quizData?.[questionIndex];
    if (q && selectedIndex === q.correctIndex) {
      this.sessionScore.update((s) => ({ ...s, correct: s.correct + 1 }));
    }

    // Save quiz session if all answered
    this.checkAndSaveQuizSession(messageIndex);
  }

  private checkAndSaveQuizSession(messageIndex: number): void {
    const msg = this.messages()[messageIndex];
    if (!msg?.quizData) return;
    const allAnswered = msg.quizData.every((q) => q.answered);
    if (!allAnswered) return;

    const session = this.activeQuiz();
    if (!session) return;

    const correct = msg.quizData.filter((q) => q.selectedIndex === q.correctIndex).length;
    const total = msg.quizData.length;
    this.saveQuizSession({ ...session, score: correct, total, completedAt: new Date() });
    this.activeQuiz.set(null);
  }

  private async saveQuizSession(session: QuizSession): Promise<void> {
    try {
      const uid = this.auth.currentUser?.uid;
      if (!uid) return;
      const ref = collection(this.afs, `users/${uid}/quizSessions`);
      await addDoc(ref, {
        ...session,
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      console.warn('[ChatbotService] Could not save quiz session:', e);
    }
  }

  private async persistMessage(
    userMsg: ChatMessage,
    assistantMsg: ChatMessage
  ): Promise<void> {
    try {
      const uid = this.auth.currentUser?.uid;
      if (!uid) return;
      const ref = collection(this.afs, `users/${uid}/aiChats`);
      await addDoc(ref, {
        user: { role: userMsg.role, content: userMsg.content, intent: userMsg.intent },
        assistant: { role: assistantMsg.role, content: assistantMsg.content, intent: assistantMsg.intent },
        page: this.router.url,
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      console.warn('[ChatbotService] Could not persist chat:', e);
    }
  }

  /** Parse AI-generated quiz text into structured questions */
  private parseQuizFromText(text: string): QuizQuestion[] {
    const questions: QuizQuestion[] = [];
    // Match blocks: Q: ... A) ... B) ... C) ... D) ... Correct: X Explanation: ...
    const blocks = text.split(/\n(?=Q\d*:|\d+\.)/);
    for (const block of blocks) {
      const qMatch = block.match(/Q\d*:\s*(.+?)(?:\n|$)/);
      if (!qMatch) continue;
      const question = qMatch[1].trim();
      const optionMatches = [...block.matchAll(/[A-D]\)\s*(.+?)(?:\n|$)/g)];
      if (optionMatches.length < 2) continue;
      const options = optionMatches.map((m) => m[1].trim());
      const correctMatch = block.match(/Correct:\s*([A-D])/i);
      const correctLetter = correctMatch?.[1]?.toUpperCase() ?? 'A';
      const correctIndex = ['A', 'B', 'C', 'D'].indexOf(correctLetter);
      const explanationMatch = block.match(/Explanation:\s*(.+?)(?:\n\n|$)/is);
      const explanation = explanationMatch?.[1]?.trim() ?? '';

      questions.push({
        id: crypto.randomUUID(),
        question,
        options,
        correctIndex: correctIndex >= 0 ? correctIndex : 0,
        explanation,
      });
    }
    return questions;
  }

  private buildContext(intentHint?: string): ChatContext {
    const user = this.auth.currentUser;
    return {
      userName: user?.displayName ?? undefined,
      currentPage: this.router.url,
      courseContext: this.courseCtx.buildContextSummary() || undefined,
      intentHint: intentHint || undefined,
    };
  }
}
