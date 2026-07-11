import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Firestore, collection, query, where, collectionData } from '@angular/fire/firestore';
import { Observable } from 'rxjs';

interface ExamSession {
  id: string;
  examId: string;
  examName?: string;
  duration: number;
  enrolledCandidateIds: string[];
  accessPassword: string;
  startedAt: any;
  createdAt: any;
}

@Component({
  selector: 'app-kiosk-setup',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './kiosk-setup.html',
  styleUrls: ['./kiosk-setup.css'],
})
export class KioskSetupComponent implements OnInit {
  private afs = inject(Firestore);
  private router = inject(Router);

  sessions$!: Observable<ExamSession[]>;
  sessionId = signal('');
  loading = signal(false);
  error = signal('');
  success = signal('');

  ngOnInit(): void {
    this.loadSessions();
  }

  private loadSessions(): void {
    const q = query(collection(this.afs, 'examSessions'));
    this.sessions$ = collectionData(q, { idField: 'id' }) as Observable<ExamSession[]>;
  }

  startKiosk(sessionId: string): void {
    if (!sessionId.trim()) {
      this.error.set('Please enter a session ID');
      return;
    }
    this.router.navigate(['/exam-session-login'], {
      queryParams: { sessionId: sessionId.trim() },
    });
  }

  openSession(session: ExamSession): void {
    this.router.navigate(['/exam-session-login'], {
      queryParams: { sessionId: session.id },
    });
  }
}
