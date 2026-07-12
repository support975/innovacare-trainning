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
} from '@angular/fire/firestore';
import { Observable, firstValueFrom } from 'rxjs';
import { ExamBlueprint, ExamBlueprintQuestion } from './exam-blueprint.model';

@Injectable({ providedIn: 'root' })
export class ExamBlueprintService {
  private firestore = inject(Firestore);

  async createBlueprint(blueprint: ExamBlueprint): Promise<string> {
    const docRef = doc(collection(this.firestore, 'examBlueprints'));
    const data = {
      ...blueprint,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(docRef, data);
    return docRef.id;
  }

  async updateBlueprint(id: string, blueprint: Partial<ExamBlueprint>): Promise<void> {
    if (!id) throw new Error('Blueprint id is required');
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

    const questions = blueprint.questions || [];
    question.id = doc(collection(this.firestore, 'temp')).id;
    questions.push(question);

    await updateDoc(docRef, {
      questions,
      totalQuestions: questions.length,
      updatedAt: serverTimestamp(),
    });
    return question.id;
  }

  async updateQuestion(blueprintId: string, question: ExamBlueprintQuestion): Promise<void> {
    if (!blueprintId) throw new Error('Blueprint id is required');
    const blueprint = await this.getBlueprint(blueprintId);
    if (!blueprint || !blueprint.questions) throw new Error('Blueprint not found');

    const questions = blueprint.questions.map(q => (q.id === question.id ? question : q));
    const docRef = doc(this.firestore, 'examBlueprints', blueprintId);
    await updateDoc(docRef, {
      questions,
      updatedAt: serverTimestamp(),
    });
  }

  async deleteQuestion(blueprintId: string, questionId: string): Promise<void> {
    if (!blueprintId) throw new Error('Blueprint id is required');
    const blueprint = await this.getBlueprint(blueprintId);
    if (!blueprint || !blueprint.questions) throw new Error('Blueprint not found');

    const questions = blueprint.questions.filter(q => q.id !== questionId);
    const docRef = doc(this.firestore, 'examBlueprints', blueprintId);
    await updateDoc(docRef, {
      questions,
      totalQuestions: questions.length,
      updatedAt: serverTimestamp(),
    });
  }

  async publishBlueprint(id: string): Promise<void> {
    await this.updateBlueprint(id, { status: 'published' });
  }

  async archiveBlueprint(id: string): Promise<void> {
    await this.updateBlueprint(id, { status: 'archived' });
  }
}
