import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Auth, authState } from '@angular/fire/auth';
import {
  Firestore, doc, setDoc, serverTimestamp
} from '@angular/fire/firestore';

import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

type QuestionMode = 'single' | 'multi';
type Question = {
  id: string;
  order: number;
  prompt: string;
  mode: QuestionMode;
  options: Array<{ id: string; text: string }>;
  explanation?: string;
  answer: string[]; // correct option ids
};

@Component({
  selector: 'app-reports',
  imports: [CommonModule, FormsModule],
  template: `
 <div class="card" style="max-width: 900px; margin: 24px auto; padding: 16px;">
    <h2>Add Exam Questions (JSON)</h2>
    <p class="muted">Only managers/admins can write. Course & Exam must already exist.</p>

    <div style="display:grid; gap:8px; grid-template-columns: 1fr 1fr;">
      <label>Course ID
        <input [(ngModel)]="courseId" placeholder="e.g. C6LEE070bU8tTLHrhUxr" />
      </label>
      <label>Exam ID
        <input [(ngModel)]="examId" placeholder="e.g. final-exam" />
      </label>
    </div>

    <textarea
      [(ngModel)]="jsonText"
      rows="18"
      style="width:100%; margin-top:8px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;"
      placeholder='Paste questions JSON (array) here...'
    ></textarea>

    <div style="margin-top:12px; display:flex; gap:8px;">
      <button class="btn" (click)="import()" [disabled]="busy()">Add Questions</button>
      <button class="btn btn-secondary" (click)="loadExample()" [disabled]="busy()">Load example</button>
    </div>

    <p *ngIf="notice()" [style.color]="noticeKind()==='error' ? 'crimson' : 'green'">{{ notice() }}</p>
  </div>
  `,
  styleUrl: './reports.css'
})
export class Reports {
  private auth = inject(Auth);
  private db   = inject(Firestore);

  courseId = '';
  examId = '';
  jsonText = '';

  busy = signal(false);
  notice = signal('');
  noticeKind = signal<'ok'|'error'>('ok');

  loadExample() {
    const example: Question[] = [
      {
        id:'q1', order:1, mode:'single',
        prompt:'You suspect a coworker is falsifying expense reports. What is the best first step?',
        options:[
          {id:'a',text:'Confront them publicly at the next team meeting'},
          {id:'b',text:'Report the concern via the company hotline or to Compliance'},
          {id:'c',text:'Ignore it; it’s not your responsibility'},
          {id:'d',text:'Post about it on social media'},
        ],
        explanation:'Use official speak-up channels: hotline or Compliance.',
        answer:['b']
      },
      {
        id:'q2', order:2, mode:'multi',
        prompt:'Which of the following are potential conflicts of interest? (Select all that apply.)',
        options:[
          {id:'a',text:'Hiring a close relative for a role you supervise'},
          {id:'b',text:'Owning stock in a vendor you select'},
          {id:'c',text:'Participating in a company-sponsored volunteer day'},
          {id:'d',text:'Accepting a personal consulting fee from a supplier you manage'},
        ],
        explanation:'Relationships or financial interests that might bias decisions are conflicts (a,b,d).',
        answer:['a','b','d']
      }
    ];
    this.jsonText = JSON.stringify(example, null, 2);
  }

  async import() {
    this.notice.set('');
    this.noticeKind.set('ok');
    this.busy.set(true);
    try {
      const user = await firstValueFrom(authState(this.auth));
      if (!user) throw new Error('Please sign in.');

      const courseId = this.courseId.trim();
      const examId   = this.examId.trim();
      if (!courseId || !examId) throw new Error('Course ID and Exam ID are required.');

      let arr: Question[];
      try {
        const parsed = JSON.parse(this.jsonText);
        if (!Array.isArray(parsed)) throw new Error();
        arr = parsed;
      } catch {
        throw new Error('JSON must be an array of questions.');
      }

      // Basic validation + writes
      let count = 0;
      for (const q of arr) {
        if (!q?.id) throw new Error('Each question needs an "id".');
        if (!Array.isArray(q.options) || q.options.length < 2)
          throw new Error(`Question "${q.id}" must have at least 2 options.`);
        if (!Array.isArray(q.answer) || !q.answer.length)
          throw new Error(`Question "${q.id}" must include "answer" (array of correct option ids).`);

        // question doc (without the answer array)
        const { id, answer, ...visible } = q;
        await setDoc(
          doc(this.db, `courses/${courseId}/exams/${examId}/questions/${id}`),
          {
            ...visible,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        // answer key doc
        await setDoc(
          doc(this.db, `courses/${courseId}/exams/${examId}/answerKey/${id}`),
          { correctIds: answer },
          { merge: true }
        );
        count++;
      }

      this.notice.set(`✅ Added ${count} question(s) to exam "${examId}" under course "${courseId}".`);
      this.noticeKind.set('ok');
    } catch (e:any) {
      console.error(e);
      this.notice.set(`❌ ${e?.message || String(e)}`);
      this.noticeKind.set('error');
    } finally {
      this.busy.set(false);
    }
  }
}