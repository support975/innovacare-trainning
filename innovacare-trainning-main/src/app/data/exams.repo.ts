import { inject, Injectable } from '@angular/core';
import {
  Firestore, doc, getDoc, setDoc, serverTimestamp,
  collection, addDoc, updateDoc, deleteDoc, orderBy,
  collectionData, query
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

/** Firestore exam doc shape per rules */
export interface Exam {
  id?: string;
  title: string;
  questions: number;
  available: boolean;
}

export interface ExamQuestion {
  id?: string;
  prompt: string;
  mode: 'single'|'multi';
  options: { id: string; text: string; correct: boolean; explanation?: string }[];
  order: number;
  points?: number;
  createdAt?: any;
  updatedAt?: any;
}

@Injectable({ providedIn: 'root' })
export class ExamsRepo {
  private afs = inject(Firestore);

  private examRef(courseId: string, examId: string) {
    return doc(this.afs, `courses/${courseId}/exams/${examId}`);
  }
  private questionsCol(courseId: string, examId: string) {
    return collection(this.afs, `courses/${courseId}/exams/${examId}/questions`);
  }

  exam$(courseId: string, examId: string): Observable<Exam | null> {
    const ref = this.examRef(courseId, examId);
    return new Observable<Exam | null>(sub => {
      getDoc(ref).then(s => {
        sub.next(s.exists() ? ({ id: s.id, ...s.data() } as Exam) : null);
        sub.complete();
      }).catch(e => sub.error(e));
    });
  }

  /** Persist ONLY allowed fields; overwrite to purge old forbidden fields */
  async upsertExam(courseId: string, examId: string, data: Partial<Exam>) {
    const ref = this.examRef(courseId, examId);
    const snap = await getDoc(ref);
    const payload: Exam = {
      title: data.title ?? 'Final Exam',
      questions: data.questions ?? 1,
      available: data.available ?? true,
    };
    await setDoc(ref, payload, { merge: false });
  }

  questions$(courseId: string, examId: string): Observable<ExamQuestion[]> {
    const q = query(this.questionsCol(courseId, examId), orderBy('order', 'asc'));
    return collectionData(q, { idField: 'id' }) as Observable<ExamQuestion[]>;
  }

  async addQuestion(courseId: string, examId: string, q: Omit<ExamQuestion,'id'>) {
    const col = this.questionsCol(courseId, examId);
    return await addDoc(col, { ...q, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  }
  async updateQuestion(courseId: string, examId: string, id: string, patch: Partial<ExamQuestion>) {
    const ref = doc(this.afs, `courses/${courseId}/exams/${examId}/questions/${id}`);
    await updateDoc(ref, { ...patch, updatedAt: serverTimestamp() });
  }
  async deleteQuestion(courseId: string, examId: string, id: string) {
    const ref = doc(this.afs, `courses/${courseId}/exams/${examId}/questions/${id}`);
    await deleteDoc(ref);
  }
}
