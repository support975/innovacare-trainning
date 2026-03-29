import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import {
  Firestore, doc, docData, collection, collectionData,
  addDoc, deleteDoc, updateDoc, serverTimestamp, DocumentReference
} from '@angular/fire/firestore';
import { toSignal } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';

/** --- Models --- */
export interface Course {
  id: string;
  title: string;
  description?: string;
  lang?: 'EN'|'FR'|'ES';
  durationMin?: number;
  active?: boolean;
  kind?: 'Course'|'Text'|'Module';
  tags?: string[];
}
export interface Certification {
  id?: string;
  code: string;
  name: string;
  credit: string;
}
export interface Exam {
  id?: string;
  title: string;
  questions: number;
  available: boolean;
  url?: string;
  createdAt?: any;
  updatedAt?: any;
}

@Component({
  selector: 'app-courses-editor',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterModule],
  templateUrl: './courses-editor.html',
  styleUrl: './courses-editor.css'
})
export class CoursesEditor {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private afs = inject(Firestore);
  private fb = inject(FormBuilder);

  // Type-safe trackBy for optional ids
trackByCert = (index: number, item: Certification) => item.id ?? String(index);
trackByExam = (index: number, item: Exam) => item.id ?? String(index);


  /** Route param */
  courseId = this.route.snapshot.paramMap.get('id') ?? '';

  /** Course header */
  course = toSignal(
    docData(doc(this.afs, `courses/${this.courseId}`), { idField: 'id' }) as Observable<Course>,
    {
      initialValue: {
        id: this.courseId,
        title: '',
        description: '',
        lang: 'EN',
        durationMin: 0,
        active: true,
        kind: 'Course',
        tags: []
      }
    }
  );

  /** --- Forms --- */
  certForm = this.fb.group({
    code: ['', [Validators.required, Validators.maxLength(20)]],
    name: ['', [Validators.required, Validators.minLength(3)]],
    credit: ['1,00', [Validators.required]]
  });

  examForm = this.fb.group({
    title: ['Final Exam', [Validators.required, Validators.minLength(3)]],
    available: [true],
    questions: [10, [Validators.required, Validators.min(1)]],
    url: ['', []],
  });

  /** --- Collections (live) --- */
  certs = toSignal(
    collectionData(collection(this.afs, `courses/${this.courseId}/certifications`), { idField: 'id' }) as Observable<Certification[]>,
    { initialValue: [] }
  );

  exams = toSignal(
    collectionData(collection(this.afs, `courses/${this.courseId}/exams`), { idField: 'id' }) as Observable<Exam[]>,
    { initialValue: [] }
  );

  /** --- Certifications CRUD --- */
  editingCertId   = signal<string | null>(null);
  editingCertCopy = signal<Certification | null>(null);

  startEditCert(row: Certification) {
    this.editingCertId.set(row.id ?? null);
    this.editingCertCopy.set({ ...row });
  }
  cancelEditCert() {
    this.editingCertId.set(null);
    this.editingCertCopy.set(null);
  }
  async saveEditCert() {
    const copy = this.editingCertCopy();
    if (!copy || !copy.id) return;
    const ref = doc(this.afs, `courses/${this.courseId}/certifications/${copy.id}`);
    await updateDoc(ref as unknown as DocumentReference, {
      code: copy.code,
      name: copy.name,
      credit: copy.credit
    });
    this.cancelEditCert();
  }
  async addCert() {
    if (this.certForm.invalid) {
      this.certForm.markAllAsTouched();
      return;
    }
    const ref = collection(this.afs, `courses/${this.courseId}/certifications`);
    await addDoc(ref, this.certForm.getRawValue()!);
    this.certForm.reset({ code: '', name: '', credit: '1,00' });
  }
  async removeCert(c: Certification) {
    if (!c.id) return;
    const ref = doc(this.afs, `courses/${this.courseId}/certifications/${c.id}`);
    await deleteDoc(ref as unknown as DocumentReference);
  }

  /** --- Exams CRUD (URL-based) --- */
  editingExamId   = signal<string | null>(null);
  editingExamCopy = signal<Exam | null>(null);

  startEditExam(row: Exam) {
    this.editingExamId.set(row.id ?? null);
    this.editingExamCopy.set({ ...row });
  }
  cancelEditExam() {
    this.editingExamId.set(null);
    this.editingExamCopy.set(null);
  }
  async saveEditExam() {
    const copy = this.editingExamCopy();
    if (!copy || !copy.id) return;
    const ref = doc(this.afs, `courses/${this.courseId}/exams/${copy.id}`);
    await updateDoc(ref as unknown as DocumentReference, {
      title: copy.title,
      available: copy.available,
      questions: copy.questions,
      url: copy.url ?? null,
      updatedAt: serverTimestamp(),
    });
    this.cancelEditExam();
  }
  async addExam() {
    if (this.examForm.invalid) {
      this.examForm.markAllAsTouched();
      return;
    }
    const ref = collection(this.afs, `courses/${this.courseId}/exams`);
    const raw = this.examForm.getRawValue();
    await addDoc(ref, {
      title: raw.title,
      available: !!raw.available,
      questions: raw.questions,
      url: raw.url || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    } as Exam);
    this.examForm.reset({
      title: 'Final Exam',
      available: true,
      questions: 10,
      url: ''
    });
  }
  async removeExam(e: Exam) {
    if (!e.id) return;
    const ref = doc(this.afs, `courses/${this.courseId}/exams/${e.id}`);
    await deleteDoc(ref as unknown as DocumentReference);
  }

  backToCourses() { this.router.navigate(['/manager/courses']); }
  trackById = (_: number, x: {id:string}) => x.id;
}
