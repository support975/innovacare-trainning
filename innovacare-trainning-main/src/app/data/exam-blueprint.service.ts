import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  docData,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  getDocs,
  getDoc,
  deleteField,
} from '@angular/fire/firestore';
import { Observable, firstValueFrom, from, switchMap } from 'rxjs';
import { ExamBlueprint, ExamBlueprintQuestion } from './exam-blueprint.model';

type AnswerKeyEntry = { correctAnswers: string[]; explanation?: string };

/**
 * Exam blueprints are stored in two parts:
 *  - examBlueprints/{id}: title, settings and questions WITHOUT answers —
 *    readable by candidates once published;
 *  - examBlueprints/{id}/private/answerKey: correct answers and
 *    explanations, readable only by the certification authority.
 * Candidates' exams are graded by the submitBlueprintExam Cloud Function.
 * Authoring screens use the *ForEditing methods, which merge both parts.
 */
@Injectable({ providedIn: 'root' })
export class ExamBlueprintService {
  private firestore = inject(Firestore);

  private answerKeyRef(blueprintId: string) {
    return doc(this.firestore, `examBlueprints/${blueprintId}/private/answerKey`);
  }

  private static answerEntry(q: Partial<ExamBlueprintQuestion>): AnswerKeyEntry {
    const entry: AnswerKeyEntry = { correctAnswers: [...(q.correctAnswers ?? [])] };
    if (q.explanation) entry.explanation = q.explanation;
    return entry;
  }

  /** Question as stored in the public blueprint document (no answers). */
  private static publicQuestion(q: ExamBlueprintQuestion): Omit<ExamBlueprintQuestion, 'correctAnswers' | 'explanation'> {
    const { correctAnswers: _answers, explanation: _explanation, ...rest } = q;
    return rest;
  }

  private async writeAnswers(
    blueprintId: string,
    orgId: string,
    answers: Record<string, AnswerKeyEntry | ReturnType<typeof deleteField>>
  ): Promise<void> {
    if (!Object.keys(answers).length) return;
    await setDoc(
      this.answerKeyRef(blueprintId),
      { orgId, answers, updatedAt: serverTimestamp() },
      { merge: true }
    );
  }

  /** Adds the private answers back onto a blueprint's questions (authoring only). */
  private async withAnswers(blueprint: ExamBlueprint): Promise<ExamBlueprint> {
    if (!blueprint.id) return blueprint;
    const snap = await getDoc(this.answerKeyRef(blueprint.id));
    const answers = ((snap.exists() ? snap.data()?.['answers'] : null) ?? {}) as Record<string, AnswerKeyEntry>;
    return {
      ...blueprint,
      questions: (blueprint.questions ?? []).map((q) => {
        const entry = q.id ? answers[q.id] : undefined;
        return {
          ...q,
          correctAnswers: entry?.correctAnswers ?? q.correctAnswers ?? [],
          explanation: entry?.explanation ?? q.explanation,
        };
      }),
    };
  }

  async createBlueprint(blueprint: ExamBlueprint): Promise<string> {
    const docRef = doc(collection(this.firestore, 'examBlueprints'));
    const questions = blueprint.questions ?? [];
    const data = {
      ...blueprint,
      questions: questions.map((q) => ExamBlueprintService.publicQuestion(q)),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(docRef, data);
    await this.writeAnswers(
      docRef.id,
      blueprint.orgId,
      Object.fromEntries(
        questions
          .filter((q) => q.id)
          .map((q): [string, AnswerKeyEntry] => [q.id!, ExamBlueprintService.answerEntry(q)])
      )
    );
    return docRef.id;
  }

  async updateBlueprint(id: string, blueprint: Partial<ExamBlueprint>): Promise<void> {
    if (!id) throw new Error('Blueprint id is required');
    if (blueprint.questions) {
      throw new Error('Use addQuestion / updateQuestion / deleteQuestion to change questions.');
    }
    const docRef = doc(this.firestore, 'examBlueprints', id);
    await updateDoc(docRef, {
      ...blueprint,
      updatedAt: serverTimestamp(),
    });
  }

  async deleteBlueprint(id: string): Promise<void> {
    if (!id) throw new Error('Blueprint id is required');
    const docRef = doc(this.firestore, 'examBlueprints', id);
    await deleteDoc(docRef);
  }

  getBlueprints(sessionId: string, orgId: string): Observable<ExamBlueprint[]> {
    const q = query(
      collection(this.firestore, 'examBlueprints'),
      where('orgId', '==', orgId),
      where('certificationSessionId', '==', sessionId)
    );
    return collectionData(q, { idField: 'id' }) as Observable<ExamBlueprint[]>;
  }

  async getPublishedBlueprintForSession(sessionId: string): Promise<ExamBlueprint | null> {
    if (!sessionId) return null;
    const q = query(
      collection(this.firestore, 'examBlueprints'),
      where('certificationSessionId', '==', sessionId),
      where('status', '==', 'published')
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const first = snap.docs[0];
    return { id: first.id, ...(first.data() as any) } as ExamBlueprint;
  }

  getBlueprintsByOrg(orgId: string): Observable<ExamBlueprint[]> {
    const q = query(
      collection(this.firestore, 'examBlueprints'),
      where('orgId', '==', orgId)
    );
    return collectionData(q, { idField: 'id' }) as Observable<ExamBlueprint[]>;
  }

  /**
   * Published blueprints for an org, readable by any signed-in manager (not
   * just the org's certification authority). The security rules only allow
   * non-authority users to read published blueprints, so the 'published'
   * filter must be part of the query itself — filtering client-side after an
   * unscoped getBlueprintsByOrg() query gets the whole query denied.
   */
  getPublishedBlueprintsByOrg(orgId: string): Observable<ExamBlueprint[]> {
    const q = query(
      collection(this.firestore, 'examBlueprints'),
      where('orgId', '==', orgId),
      where('status', '==', 'published')
    );
    return collectionData(q, { idField: 'id' }) as Observable<ExamBlueprint[]>;
  }

  /** Blueprints of a session with their answers, for the authoring center. */
  getBlueprintsForEditing(sessionId: string, orgId: string): Observable<ExamBlueprint[]> {
    return this.getBlueprints(sessionId, orgId).pipe(
      switchMap((list) => from(Promise.all(list.map((bp) => this.withAnswers(bp)))))
    );
  }

  /** One blueprint with its answers, for the authoring center. */
  async getBlueprintForEditing(id: string): Promise<ExamBlueprint | null> {
    const blueprint = await this.getBlueprint(id);
    return blueprint ? this.withAnswers(blueprint) : null;
  }

  /** The published (answer-free) blueprint, as candidates see it. */
  async getBlueprint(id: string): Promise<ExamBlueprint | null> {
    if (!id) return null;
    const docRef = doc(this.firestore, 'examBlueprints', id);
    const data = await firstValueFrom(
      docData(docRef, { idField: 'id' }) as Observable<ExamBlueprint>
    );
    return data || null;
  }

  async addQuestion(blueprintId: string, question: ExamBlueprintQuestion): Promise<string> {
    if (!blueprintId) throw new Error('Blueprint id is required');
    const docRef = doc(this.firestore, 'examBlueprints', blueprintId);
    const blueprint = await this.getBlueprint(blueprintId);
    if (!blueprint) throw new Error('Blueprint not found');

    const questions = (blueprint.questions || []).map((q) => ExamBlueprintService.publicQuestion(q));
    question.id = doc(collection(this.firestore, 'temp')).id;
    questions.push(ExamBlueprintService.publicQuestion(question));

    await updateDoc(docRef, {
      questions,
      totalQuestions: questions.length,
      updatedAt: serverTimestamp(),
    });
    await this.writeAnswers(blueprintId, blueprint.orgId, {
      [question.id]: ExamBlueprintService.answerEntry(question),
    });
    return question.id;
  }

  async updateQuestion(blueprintId: string, question: ExamBlueprintQuestion): Promise<void> {
    if (!blueprintId) throw new Error('Blueprint id is required');
    const blueprint = await this.getBlueprint(blueprintId);
    if (!blueprint || !blueprint.questions) throw new Error('Blueprint not found');

    const questions = blueprint.questions.map((q) =>
      ExamBlueprintService.publicQuestion(q.id === question.id ? question : q)
    );
    const docRef = doc(this.firestore, 'examBlueprints', blueprintId);
    await updateDoc(docRef, {
      questions,
      updatedAt: serverTimestamp(),
    });
    if (question.id) {
      await this.writeAnswers(blueprintId, blueprint.orgId, {
        [question.id]: ExamBlueprintService.answerEntry(question),
      });
    }
  }

  async deleteQuestion(blueprintId: string, questionId: string): Promise<void> {
    if (!blueprintId) throw new Error('Blueprint id is required');
    const blueprint = await this.getBlueprint(blueprintId);
    if (!blueprint || !blueprint.questions) throw new Error('Blueprint not found');

    const questions = blueprint.questions
      .filter((q) => q.id !== questionId)
      .map((q) => ExamBlueprintService.publicQuestion(q));
    const docRef = doc(this.firestore, 'examBlueprints', blueprintId);
    await updateDoc(docRef, {
      questions,
      totalQuestions: questions.length,
      updatedAt: serverTimestamp(),
    });
    await this.writeAnswers(blueprintId, blueprint.orgId, { [questionId]: deleteField() });
  }

  async publishBlueprint(id: string): Promise<void> {
    await this.updateBlueprint(id, { status: 'published' });
  }

  async archiveBlueprint(id: string): Promise<void> {
    await this.updateBlueprint(id, { status: 'archived' });
  }
}
