/* eslint max-len: ["error", { "code": 120, "ignoreUrls": true }] */
/**
 * Pure helpers for official (blueprint) exams: separating answers from the
 * questions candidates see, and grading a submission against the key.
 * No Firestore access here, so they can be unit-tested directly.
 */
import {HttpsError} from "firebase-functions/v2/https";

export type DocData = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const MAX_QUESTIONS = 500;
const MAX_CHOICES_PER_QUESTION = 20;

export type AnswerKeyEntry = {correctAnswers: string[]; explanation?: string};
export type AnswerKey = Record<string, AnswerKeyEntry>;

const toStringArray = (value: unknown, limit = MAX_CHOICES_PER_QUESTION): string[] =>
  Array.isArray(value) ?
    value.filter((v) => typeof v === "string" || typeof v === "number").map((v) => String(v)).slice(0, limit) :
    [];

export const str = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

// Split questions into what candidates may see and the private answer key.
// Questions without an id get one, so their answers can be keyed.
export const splitBlueprintQuestions = (questions: unknown): {
  publicQuestions: DocData[];
  answers: AnswerKey;
  changed: boolean;
} => {
  const list = Array.isArray(questions) ? questions : [];
  const answers: AnswerKey = {};
  let changed = false;
  const publicQuestions = list.map((raw, index) => {
    const q: DocData = {...(raw && typeof raw === "object" ? raw as DocData : {})};
    const hasAnswerFields = "correctAnswers" in q || "explanation" in q;
    if (!hasAnswerFields) return q;
    changed = true;
    if (!str(q.id)) q.id = `q-${Date.now()}-${index}`;
    const entry: AnswerKeyEntry = {correctAnswers: toStringArray(q.correctAnswers)};
    if (str(q.explanation)) entry.explanation = str(q.explanation);
    answers[String(q.id)] = entry;
    delete q.correctAnswers;
    delete q.explanation;
    return q;
  });
  return {publicQuestions, answers, changed};
};

export type GradedQuestion = {
  id: string;
  order: number;
  prompt: string;
  your: string[];
  correct: string[];
  isCorrect: boolean;
  explanation?: string;
};

export type GradeResult = {
  percent: number;
  passed: boolean;
  correct: number;
  total: number;
  details: GradedQuestion[];
};

export const normalizeAnswers = (raw: unknown): Record<string, string[]> => {
  const out: Record<string, string[]> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [qid, value] of Object.entries(raw as Record<string, unknown>).slice(0, MAX_QUESTIONS)) {
    out[qid] = toStringArray(value);
  }
  return out;
};

// Grade answers against the private key (legacy embedded answers as a fallback).
export const gradeBlueprintAnswers = (
  blueprint: DocData,
  key: AnswerKey,
  answers: Record<string, string[]>,
): GradeResult => {
  const questions = (Array.isArray(blueprint.questions) ? blueprint.questions : []) as DocData[];
  if (!questions.length) throw new HttpsError("failed-precondition", "This exam has no questions.");

  const sorted = [...questions].sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0));
  const details: GradedQuestion[] = [];
  let earned = 0;
  let total = 0;

  for (const q of sorted) {
    const id = str(q.id);
    const entry = key[id] ?? (Array.isArray(q.correctAnswers) ?
      {correctAnswers: toStringArray(q.correctAnswers), explanation: str(q.explanation) || undefined} :
      null);
    if (!id || !entry || !entry.correctAnswers.length) {
      throw new HttpsError(
        "failed-precondition",
        "This exam's answer key is incomplete. Please contact your exam center.",
      );
    }
    const validOptions = new Set(
      (Array.isArray(q.options) ? q.options : []).map((o: DocData) => String(o?.id ?? "")),
    );
    const your = [...new Set((answers[id] ?? []).filter((a) => validOptions.has(a)))];
    const correct = new Set(entry.correctAnswers);
    const isCorrect = your.length === correct.size && your.every((a) => correct.has(a));
    const points = Number(q.points) || Number(blueprint.pointsPerQuestion) || 10;
    total += points;
    if (isCorrect) earned += points;
    const detail: GradedQuestion = {
      id,
      order: Number(q.order ?? 0),
      prompt: String(q.prompt ?? ""),
      your,
      correct: entry.correctAnswers,
      isCorrect,
    };
    if (entry.explanation) detail.explanation = entry.explanation;
    details.push(detail);
  }

  const percent = total > 0 ? Math.round((earned / total) * 100) : 0;
  const passingScore = Number(blueprint.passingScore ?? 80);
  return {
    percent,
    passed: percent >= passingScore,
    correct: details.filter((d) => d.isCorrect).length,
    total: details.length,
    details,
  };
};

