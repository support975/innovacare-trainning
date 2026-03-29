import { Injectable, inject } from '@angular/core';
import { Firestore, doc, getDoc, collection, getDocs, query, orderBy } from '@angular/fire/firestore';
import { Course, CourseModule, Exam, Question } from '../models/training.models';

@Injectable({ providedIn: 'root' })
export class CourseService {
  private db = inject(Firestore);

  async getCourse(courseId: string): Promise<Course> {
    const snap = await getDoc(doc(this.db, 'courses', courseId));
    return { id: courseId, ...(snap.data() as any) };
    }
  async getModules(courseId: string): Promise<CourseModule[]> {
    const q = query(collection(this.db, `courses/${courseId}/modules`), orderBy('order'));
    const snaps = await getDocs(q);
    return snaps.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  }

  async getExam(examId: string): Promise<Exam> {
    const snap = await getDoc(doc(this.db, 'exams', examId));
    return { id: snap.id, ...(snap.data() as any) };
  }
  async getQuestions(examId: string): Promise<Question[]> {
    const snaps = await getDocs(collection(this.db, `exams/${examId}/questions`));
    return snaps.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  }
}
