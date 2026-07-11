import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  Firestore,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from '@angular/fire/firestore';
import { Storage, ref as storageRef, uploadBytes, getDownloadURL } from '@angular/fire/storage';
import { firstValueFrom, take } from 'rxjs';
import { AuthService } from '../../../core/auth';
import { ToDatePipe } from '../../../shared/pipes/to-date.pipe';

export interface CandidateDocument {
  id: string;
  type: string; // 'identity' | 'diploma' | 'payment_proof' | 'other'
  name: string;
  url: string;
  status: 'pending' | 'approved' | 'rejected';
  uploadedAt: number;
}

interface OnsiteSessionView {
  id: string;
  examId: string;
  examTitle: string;
  sessionDate: any;
  status: string;
  centerName: string;
  // My registration state
  registered: boolean;
  verified: boolean;
  examCompleted: boolean;
  candidacyApproved: boolean | null;
  documents: CandidateDocument[];
}

@Component({
  selector: 'app-learner-onsite-exams',
  standalone: true,
  imports: [CommonModule, FormsModule, ToDatePipe],
  templateUrl: './onsite-exams.html',
  styleUrls: ['./onsite-exams.css'],
})
export class LearnerOnsiteExamsComponent implements OnInit {
  private afs = inject(Firestore);
  private auth = inject(AuthService);
  private storage = inject(Storage);

  sessions = signal<OnsiteSessionView[]>([]);
  hasFailedAttempt = signal(false);
  uploadType = 'identity';
  uploadingFor = signal('');
  loading = signal(true);
  busy = signal('');
  notice = signal('');
  error = signal('');

  private profile: any = null;

  async ngOnInit(): Promise<void> {
    this.profile = await firstValueFrom(this.auth.profile$.pipe(take(1)));
    if (!this.profile?.orgId || !this.profile?.uid) {
      this.error.set('Your profile is missing an organization.');
      this.loading.set(false);
      return;
    }
    await this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const snap = await getDocs(
        query(collection(this.afs, 'examSessions'), where('orgId', '==', this.profile.orgId))
      );

      const views: OnsiteSessionView[] = [];
      for (const d of snap.docs) {
        const s = d.data() as any;
        if (s['status'] === 'cancelled') continue;

        const [myReg, examTitle, centerName] = await Promise.all([
          getDoc(doc(this.afs, `examSessions/${d.id}/candidateVerifications/${this.profile.uid}`)),
          this.resolveExamTitle(s['examId']),
          this.resolveCenterName(s['centerId']),
        ]);
        const reg = myReg.exists() ? (myReg.data() as any) : null;

        views.push({
          id: d.id,
          examId: s['examId'],
          examTitle,
          sessionDate: s['sessionDate'],
          status: s['status'] || 'scheduled',
          centerName,
          registered: !!reg,
          verified: reg?.['verified'] === true,
          examCompleted: reg?.['examCompleted'] === true,
          candidacyApproved:
            reg?.['candidacyApproved'] === true ? true : reg?.['candidacyApproved'] === false ? false : null,
          documents: (reg?.['documents'] || []) as CandidateDocument[],
        });
      }

      // Retake banner: any failed attempt without a later pass
      try {
        const attemptsSnap = await getDocs(
          query(collection(this.afs, 'examAttempts'), where('candidateUid', '==', this.profile.uid))
        );
        const attempts = attemptsSnap.docs.map((a) => a.data() as any);
        this.hasFailedAttempt.set(
          attempts.some((a) => a['passed'] === false) && !attempts.some((a) => a['passed'] === true)
        );
      } catch {
        this.hasFailedAttempt.set(false);
      }

      views.sort((a, b) => (b.sessionDate?.toMillis?.() ?? 0) - (a.sessionDate?.toMillis?.() ?? 0));
      this.sessions.set(views);
    } catch (e: any) {
      this.error.set(e?.message || 'Failed to load exam sessions.');
    } finally {
      this.loading.set(false);
    }
  }

  private titleCache = new Map<string, string>();
  private async resolveExamTitle(examId: string): Promise<string> {
    if (!examId) return 'Exam';
    if (this.titleCache.has(examId)) return this.titleCache.get(examId)!;
    try {
      const bp = await getDoc(doc(this.afs, `examBlueprints/${examId}`));
      const title = bp.exists() ? ((bp.data() as any)?.title || 'Exam') : 'Exam';
      this.titleCache.set(examId, title);
      return title;
    } catch {
      return 'Exam';
    }
  }

  private centerCache = new Map<string, string>();
  private async resolveCenterName(centerId: string): Promise<string> {
    if (!centerId) return '';
    if (this.centerCache.has(centerId)) return this.centerCache.get(centerId)!;
    try {
      const c = await getDoc(doc(this.afs, `examCenters/${centerId}`));
      const name = c.exists() ? ((c.data() as any)?.name || '') : '';
      this.centerCache.set(centerId, name);
      return name;
    } catch {
      return '';
    }
  }

  statusLabel(s: OnsiteSessionView): string {
    if (s.examCompleted) return 'Exam completed';
    if (s.verified) return 'Verified — ready for exam';
    if (s.candidacyApproved === true) return 'Candidacy approved — verification at the center';
    if (s.candidacyApproved === false) return 'Candidacy rejected — contact your organization';
    if (s.registered) return 'Registered — submit your documents for review';
    return '';
  }

  docTypeLabel(type: string): string {
    switch (type) {
      case 'identity': return 'Identity document';
      case 'diploma': return 'Diploma / qualification';
      case 'payment_proof': return 'Payment proof';
      default: return 'Other document';
    }
  }

  async onDocumentSelected(event: Event, s: OnsiteSessionView): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    // Documents can only be submitted before onsite verification
    if (s.verified || s.examCompleted) {
      input.value = '';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.error.set('File is too large (max 10 MB).');
      input.value = '';
      return;
    }

    this.uploadingFor.set(s.id);
    this.error.set('');
    try {
      const docId = `${this.uploadType}_${Date.now()}`;
      const ext = file.name.split('.').pop() || 'pdf';
      const path = `onsiteExamDocs/${s.id}/${this.profile.uid}/${docId}.${ext}`;
      const sRef = storageRef(this.storage, path);
      await uploadBytes(sRef, file);
      const url = await getDownloadURL(sRef);

      const newDoc: CandidateDocument = {
        id: docId,
        type: this.uploadType,
        name: file.name,
        url,
        status: 'pending',
        uploadedAt: Date.now(),
      };

      await setDoc(
        doc(this.afs, `examSessions/${s.id}/candidateVerifications/${this.profile.uid}`),
        {
          candidateUid: this.profile.uid,
          verified: false,
          examCompleted: false,
          documents: [...s.documents, newDoc],
        },
        { merge: true }
      );

      this.notice.set(`✓ ${file.name} submitted for review.`);
      await this.load();
    } catch (e: any) {
      this.error.set(e?.message || 'Upload failed.');
    } finally {
      this.uploadingFor.set('');
      input.value = '';
    }
  }

  async register(s: OnsiteSessionView): Promise<void> {
    this.busy.set(s.id);
    this.notice.set('');
    this.error.set('');
    try {
      await setDoc(
        doc(this.afs, `examSessions/${s.id}/candidateVerifications/${this.profile.uid}`),
        {
          candidateUid: this.profile.uid,
          displayName: this.profile.displayName || this.profile.email || 'Candidate',
          email: (this.profile.email || '').toLowerCase(),
          phone: this.profile.phone || null,
          photoUrl: this.profile.photoURL || null,
          verified: false,
          examCompleted: false,
          selfRegistered: true,
          enrolledAt: serverTimestamp(),
        }
      );
      this.notice.set(`✓ Registered for ${s.examTitle}. Bring a photo ID and your account password to the exam center — the proctor will verify your identity onsite.`);
      await this.load();
    } catch (e: any) {
      this.error.set(e?.message || 'Registration failed.');
    } finally {
      this.busy.set('');
    }
  }

  async withdraw(s: OnsiteSessionView): Promise<void> {
    if (!confirm(`Withdraw your registration from ${s.examTitle}?`)) return;
    this.busy.set(s.id);
    this.notice.set('');
    this.error.set('');
    try {
      await deleteDoc(doc(this.afs, `examSessions/${s.id}/candidateVerifications/${this.profile.uid}`));
      this.notice.set('Registration withdrawn.');
      await this.load();
    } catch (e: any) {
      this.error.set(e?.message || 'Failed to withdraw.');
    } finally {
      this.busy.set('');
    }
  }
}
