import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { Firestore, doc, getDoc, collection, query, where, orderBy, collectionData } from '@angular/fire/firestore';
import { Observable } from 'rxjs';

interface LearnerStatus {
  uid: string;
  name: string;
  status: 'waiting' | 'consent' | 'in-exam' | 'submitted' | 'viewing-results';
  startedAt?: Date;
  currentQuestion?: number;
  totalQuestions?: number;
  remainingSeconds?: number;
  formattedTime?: string;
}

@Component({
  selector: 'app-session-monitor',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './session-monitor.html',
  styleUrls: ['./session-monitor.css'],
})
export class SessionMonitorComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private afs = inject(Firestore);

  sessionId = '';
  session = signal<any | null>(null);
  learners = signal<LearnerStatus[]>([]);
  loading = signal(true);
  error = signal('');

  // Computed stats
  totalCandidates = signal(0);
  inExam = signal(0);
  completed = signal(0);
  waiting = signal(0);

  readonly statusColors = {
    waiting: '#999',
    consent: '#ff9800',
    'in-exam': '#2196f3',
    submitted: '#ffc107',
    'viewing-results': '#4caf50',
  };

  readonly statusLabels = {
    waiting: '⏳ Waiting',
    consent: '📋 Reviewing Terms',
    'in-exam': '📝 In Exam',
    submitted: '⏱️ Submitted',
    'viewing-results': '✓ Results',
  };

  ngOnInit(): void {
    this.sessionId = this.route.snapshot.paramMap.get('sessionId') || '';
    if (!this.sessionId) {
      this.error.set('Session ID missing.');
      return;
    }

    this.loadSessionInfo();
    this.startMonitoring();
  }

  private async loadSessionInfo(): Promise<void> {
    try {
      const sessionRef = doc(this.afs, `examSessions/${this.sessionId}`);
      const snap = await getDoc(sessionRef);

      if (!snap.exists()) {
        this.error.set('Session not found.');
        return;
      }

      const sessionData = snap.data();
      this.session.set(sessionData);

      // Initialize learners from enrolledCandidateIds
      const learnerStatuses: LearnerStatus[] = (sessionData['enrolledCandidateIds'] || []).map(
        (uid: string) => ({
          uid,
          name: uid.replace(/^onsite_|_/g, ' ').trim(),
          status: 'waiting' as const,
        })
      );

      this.learners.set(learnerStatuses);
    } catch (e: any) {
      this.error.set(e?.message || 'Failed to load session.');
    } finally {
      this.loading.set(false);
    }
  }

  private startMonitoring(): void {
    // Poll for learner exam status every 2 seconds
    setInterval(() => this.updateLearnerStatuses(), 2000);
  }

  private async updateLearnerStatuses(): Promise<void> {
    try {
      // Check for active exam submissions
      const learners = this.learners();

      for (const learner of learners) {
        // Look for active exam draft
        const enrollmentRef = doc(this.afs, `users/${learner.uid}/enrollments/${this.session()?.courseId}`);
        const enrollmentSnap = await getDoc(enrollmentRef);

        if (enrollmentSnap.exists()) {
          const enrollment = enrollmentSnap.data();
          const examDraft = enrollment['examDrafts']?.[this.session()?.examId];

          if (examDraft) {
            learner.status = 'in-exam';
            learner.startedAt = examDraft.startedAt?.toDate?.() || new Date(examDraft.startedAt);
            learner.currentQuestion = (examDraft.currentQuestionIndex || 0) + 1;
            learner.totalQuestions = examDraft.totalQuestions;

            // Calculate remaining time
            const startTime = examDraft.startedAt?.toMillis?.() || new Date(examDraft.startedAt).getTime();
            const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
            const totalSeconds = (this.session()?.durationMinutes || 60) * 60;
            const remaining = Math.max(0, totalSeconds - elapsedSeconds);
            learner.remainingSeconds = remaining;
            learner.formattedTime = this.formatSeconds(remaining);
          }
        }

        // Check for submitted exam
        const submissionsCol = collection(this.afs, `users/${learner.uid}/examSubmissions`);
        const recentSubmissions = query(
          submissionsCol,
          where('examId', '==', this.session()?.examId),
          orderBy('createdAt', 'desc')
        );

        const submissionsObservable = collectionData(recentSubmissions);
        submissionsObservable.subscribe((submissions: any[]) => {
          if (submissions.length > 0) {
            const submission = submissions[0];
            if (submission.status === 'graded') {
              learner.status = 'viewing-results';
            } else if (submission.status === 'pending') {
              learner.status = 'submitted';
            }
          }
        });
      }

      this.learners.set([...learners]);
    } catch (e) {
      console.error('Error updating learner statuses:', e);
    }

    this.updateStats();
  }

  private updateStats(): void {
    const learners = this.learners();
    this.totalCandidates.set(learners.length);
    this.inExam.set(learners.filter(l => l.status === 'in-exam').length);
    this.completed.set(learners.filter(l => l.status === 'submitted' || l.status === 'viewing-results').length);
    this.waiting.set(learners.filter(l => l.status === 'waiting').length);
  }

  private formatSeconds(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  getStatusColor(status: string): string {
    return this.statusColors[status as keyof typeof this.statusColors] || '#999';
  }

  getStatusLabel(status: string): string {
    return this.statusLabels[status as keyof typeof this.statusLabels] || status;
  }

  getProgressPercent(learner: LearnerStatus): number {
    if (!learner.totalQuestions) return 0;
    return Math.round(((learner.currentQuestion || 0) / learner.totalQuestions) * 100);
  }

  isTimeWarning(learner: LearnerStatus): boolean {
    return (learner.remainingSeconds || Infinity) <= 300; // 5 min warning
  }

  isTimeCritical(learner: LearnerStatus): boolean {
    return (learner.remainingSeconds || Infinity) <= 60; // 1 min critical
  }
}
