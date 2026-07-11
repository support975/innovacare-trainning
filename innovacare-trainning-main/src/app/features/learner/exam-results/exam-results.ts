import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Firestore, doc, getDoc, collection, query, where, getDocs } from '@angular/fire/firestore';

import { ToDatePipe } from '../../../shared/pipes/to-date.pipe';
@Component({
  selector: 'app-exam-results',
  standalone: true,
  imports: [CommonModule, RouterLink, ToDatePipe],
  templateUrl: './exam-results.html',
  styleUrls: ['./exam-results.css'],
})
export class ExamResultsComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private afs = inject(Firestore);

  attemptId = '';
  attempt = signal<any | null>(null);
  session = signal<any | null>(null);
  exam = signal<any | null>(null);
  learner = signal<any | null>(null);

  loading = signal(true);
  error = signal('');

  ngOnInit(): void {
    this.attemptId = this.route.snapshot.queryParamMap.get('attemptId') || '';
    if (!this.attemptId) {
      this.error.set('Missing exam attempt ID.');
      this.loading.set(false);
      return;
    }

    this.loadResults();
  }

  private async loadResults(): Promise<void> {
    try {
      // Load attempt
      const attemptRef = doc(this.afs, `examAttempts/${this.attemptId}`);
      const attemptSnap = await getDoc(attemptRef);

      if (!attemptSnap.exists()) {
        this.error.set('Exam attempt not found.');
        this.loading.set(false);
        return;
      }

      const attemptData = attemptSnap.data();
      this.attempt.set(attemptData);

      // Load session
      const sessionRef = doc(this.afs, `examSessions/${attemptData['sessionId']}`);
      const sessionSnap = await getDoc(sessionRef);
      if (sessionSnap.exists()) {
        this.session.set(sessionSnap.data());
      }

      // Load learner
      const learnerRef = doc(this.afs, `users/${attemptData['candidateUid']}`);
      const learnerSnap = await getDoc(learnerRef);
      if (learnerSnap.exists()) {
        this.learner.set(learnerSnap.data());
      }
    } catch (e: any) {
      this.error.set(e?.message || 'Failed to load results.');
    } finally {
      this.loading.set(false);
    }
  }

  get passed(): boolean {
    return this.attempt()?.passed || false;
  }

  get score(): number {
    return this.attempt()?.score || 0;
  }

  get passingScore(): number {
    return this.session()?.passingScore || 80;
  }

  goToDashboard(): void {
    this.router.navigate(['/learner/dashboard']);
  }

  startRetake(): void {
    // Route to re-take exam (would need session re-enrollment)
    this.router.navigate(['/learner/dashboard']);
  }
}
