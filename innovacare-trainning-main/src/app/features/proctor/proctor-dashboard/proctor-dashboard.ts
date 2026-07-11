import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Firestore, doc, getDoc, serverTimestamp, setDoc, collection, getDocs, query, where, limit, addDoc, onSnapshot } from '@angular/fire/firestore';
import { Storage, ref as storageRef, uploadBytes, getDownloadURL } from '@angular/fire/storage';
import { AuthService } from '../../../core/auth';
import { ProctorService } from '../../../data/proctor.service';
import { ExamSession, ProctorVerification, ProctorAuditLog, ExamCenter } from '../../../data/models';

@Component({
  selector: 'app-proctor-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './proctor-dashboard.html',
  styleUrls: ['./proctor-dashboard.css'],
})
export class ProctorDashboardComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private afs = inject(Firestore);
  private storage = inject(Storage);
  private authService = inject(AuthService);
  private proctorService = inject(ProctorService);
  private profile = this.authService.profile$;

  sessionId = '';
  session = signal<ExamSession | null>(null);
  center = signal<ExamCenter | null>(null);
  verifications = signal<ProctorVerification[]>([]);
  auditLogs = signal<ProctorAuditLog[]>([]);
  candidates = signal<any[]>([]);
  busy = signal(false);
  notice = signal('');

  // Modal state
  modalOpen = signal(false);
  selectedCandidateUid = signal('');
  selectedCandidateName = signal('');
  idPhotoUrl = signal('');
  verifyPhotoUrl = signal('');
  idPhotoFile: File | null = null;
  verifyPhotoFile: File | null = null;

  // Enrollment modal state
  enrollmentModalOpen = signal(false);
  enrollmentForm = {
    email: '',
    name: '',
    phone: '',
  };

  // Exams cache for name lookup
  private examsCache = new Map<string, { id: string; title: string }>();

  readonly verificationStatus = computed(() => {
    const verifs = this.verifications();
    const status: Record<string, boolean | null> = {};
    verifs.forEach((v: ProctorVerification) => {
      status[v.candidateUid] = v.verified;
    });
    return status;
  });

  readonly verifiedCount = computed(() => {
    return Object.values(this.verificationStatus()).filter((v) => v === true).length;
  });

  readonly verificationLabel = computed(() => {
    const status = this.verificationStatus();
    return (uid: string) => {
      const verified = status[uid];
      if (verified === true) return 'Verified ✓';
      if (verified === false) return 'Rejected ✗';
      return 'Pending';
    };
  });

  ngOnInit() {
    this.sessionId = this.route.snapshot.paramMap.get('sessionId') || '';
    if (!this.sessionId) {
      this.notice.set('Session ID missing.');
      return;
    }

    this.loadSession();
    this.loadVerifications();
    this.loadAuditLogs();
  }

  private loadSession(): void {
    this.proctorService.getSession$(this.sessionId).subscribe({
      next: (session) => {
        if (!session) {
          this.notice.set('Session not found.');
          return;
        }
        this.session.set(session);
        this.loadCandidates(session);
        if (session.centerId) {
          this.loadCenter(session.centerId);
        }
      },
      error: (e) => this.notice.set(e?.message || 'Failed to load session.'),
    });
  }

  private loadCenter(centerId: string): void {
    this.proctorService.getCenter$(centerId).subscribe({
      next: (center) => this.center.set(center),
      error: (e) => console.error('Failed to load center:', e),
    });
  }

  private async loadCandidates(session: ExamSession): Promise<void> {
    try {
      // Load verified candidates from candidateVerifications collection
      const verificationsRef = collection(this.afs, `examSessions/${this.sessionId}/candidateVerifications`);
      const snap = await getDocs(verificationsRef);

      const candidateList: any[] = [];
      for (const doc of snap.docs) {
        const data = doc.data() as any;
        candidateList.push({
          uid: data['candidateUid'],
          name: data['displayName'] || data['name'] || 'Candidate',
          email: data['email'],
          photoUrl: data['photoUrl'] || null,
        });
      }
      this.candidates.set(candidateList);
    } catch (e) {
      console.error('Failed to load candidates:', e);
      this.candidates.set([]);
    }
  }

  private loadVerifications(): void {
    this.proctorService.listVerificationsBySession$(this.sessionId).subscribe({
      next: (verifs) => this.verifications.set(verifs),
      error: (e) => console.error('Failed to load verifications:', e),
    });
  }

  private loadAuditLogs(): void {
    this.proctorService.listAuditLogs$(this.sessionId).subscribe({
      next: (logs) => this.auditLogs.set(logs.slice(0, 50)), // Last 50
      error: (e) => console.error('Failed to load audit logs:', e),
    });
  }

  openVerificationModal(uid: string, name: string): void {
    this.selectedCandidateUid.set(uid);
    this.selectedCandidateName.set(name);
    this.idPhotoUrl.set('');
    this.verifyPhotoUrl.set('');
    this.idPhotoFile = null;
    this.verifyPhotoFile = null;
    this.modalOpen.set(true);
  }

  closeModal(): void {
    this.modalOpen.set(false);
    this.selectedCandidateUid.set('');
  }

  onIdPhotoSelected(event: any): void {
    const file = event.target.files?.[0];
    if (file) {
      this.idPhotoFile = file;
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.idPhotoUrl.set(e.target.result);
      };
      reader.readAsDataURL(file);
    }
  }

  onVerifyPhotoSelected(event: any): void {
    const file = event.target.files?.[0];
    if (file) {
      this.verifyPhotoFile = file;
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.verifyPhotoUrl.set(e.target.result);
      };
      reader.readAsDataURL(file);
    }
  }

  async submitVerification(approved: boolean): Promise<void> {
    const sessionId = this.sessionId;
    const candidateUid = this.selectedCandidateUid();
    const profile = await new Promise<any>((resolve) => {
      this.profile.subscribe((p) => resolve(p));
    });

    if (!profile || !profile.uid) {
      this.notice.set('Please sign in first.');
      return;
    }

    this.busy.set(true);
    try {
      // Upload photos to Firebase Storage — data URLs are too large for Firestore documents (1MB limit)
      const idPhotoUrl = this.idPhotoFile
        ? await this.uploadPhoto(this.idPhotoFile, `${candidateUid}_id`)
        : '';
      const verifyPhotoUrl = this.verifyPhotoFile
        ? await this.uploadPhoto(this.verifyPhotoFile, `${candidateUid}_live`)
        : '';

      await this.proctorService.verifyCandidate(
        sessionId,
        candidateUid,
        profile.uid,
        approved,
        idPhotoUrl || verifyPhotoUrl,
        approved ? '' : 'Manual verification failed - ID does not match'
      );

      this.notice.set(
        approved
          ? `✓ ${this.selectedCandidateName()} verified and approved.`
          : `✗ ${this.selectedCandidateName()} verification rejected.`
      );

      this.closeModal();
      this.loadVerifications();
      this.loadAuditLogs();
    } catch (e: any) {
      this.notice.set(e?.message || 'Failed to verify candidate.');
    } finally {
      this.busy.set(false);
    }
  }

  private async uploadPhoto(file: File, baseName: string): Promise<string> {
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `proctorVerifications/${this.sessionId}/${baseName}_${Date.now()}.${ext}`;
    const sRef = storageRef(this.storage, path);
    await uploadBytes(sRef, file);
    return getDownloadURL(sRef);
  }

  formatTime(timestamp: any): string {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString();
  }

  goBack(): void {
    this.router.navigate(['/manager/exam-sessions']);
  }

  openEnrollmentModal(): void {
    this.enrollmentForm = { email: '', name: '', phone: '' };
    this.enrollmentModalOpen.set(true);
  }

  closeEnrollmentModal(): void {
    this.enrollmentModalOpen.set(false);
    this.enrollmentForm = { email: '', name: '', phone: '' };
  }

  async enrollCandidate(): Promise<void> {
    if (!this.enrollmentForm.email || !this.enrollmentForm.name) {
      this.notice.set('Email and name are required.');
      return;
    }

    if (!this.sessionId) return;
    this.busy.set(true);
    try {
      const session = this.session();
      if (!session) {
        this.notice.set('Session not found.');
        return;
      }

      // The candidate must have a user account under this organization —
      // the enrollment is keyed by their real auth uid so exam results land
      // on their own dashboard and the kiosk verifies their real password.
      const profile = await new Promise<any>((resolve) => {
        this.profile.subscribe((p) => resolve(p));
      });
      const orgId = profile?.orgId || '';
      const email = this.enrollmentForm.email.trim().toLowerCase();

      const userSnap = await getDocs(
        query(
          collection(this.afs, 'users'),
          where('orgId', '==', orgId),
          where('email', '==', email),
          limit(1)
        )
      );

      if (userSnap.empty) {
        // No account yet — queue account creation. A Cloud Function creates the
        // Firebase Auth user with an initial password (emailed/SMS'd to the
        // candidate) and enrolls them into this session.
        await this.requestCandidateAccount(orgId, email);
        return;
      }

      const userDoc = userSnap.docs[0];
      const user = userDoc.data() as any;

      // Duplicate guard: already enrolled in this session?
      if (this.candidates().some((c) => c.uid === userDoc.id)) {
        this.notice.set(`${user['displayName'] || email} is already enrolled in this session.`);
        return;
      }

      const newCandidate = {
        uid: userDoc.id,
        name: user['displayName'] || this.enrollmentForm.name,
        email: user['email'] || email,
        photoUrl: user['photoURL'] || null,
      };
      // Doc id = candidate auth uid — one enrollment per user per session
      const candidateRef = doc(this.afs, `examSessions/${this.sessionId}/candidateVerifications/${userDoc.id}`);
      await setDoc(candidateRef, {
        candidateUid: userDoc.id,
        displayName: newCandidate.name,
        email: newCandidate.email,
        phone: this.enrollmentForm.phone.trim() || user['phone'] || null,
        photoUrl: newCandidate.photoUrl,
        verified: false,
        enrolledAt: serverTimestamp(),
      });

      // Add to candidates list
      const currentCandidates = this.candidates();
      this.candidates.set([...currentCandidates, newCandidate]);

      this.notice.set(`✓ ${this.enrollmentForm.name} enrolled successfully.`);
      this.closeEnrollmentModal();
    } catch (e: any) {
      this.notice.set(e?.message || 'Failed to enroll candidate.');
    } finally {
      this.busy.set(false);
    }
  }

  /** Queue account creation for a candidate without an account, then wait for the result. */
  private async requestCandidateAccount(orgId: string, email: string): Promise<void> {
    const profile = await new Promise<any>((resolve) => {
      this.profile.subscribe((p) => resolve(p));
    });

    this.notice.set(`Creating an account for ${email}…`);
    const reqRef = await addDoc(collection(this.afs, 'kioskCandidateCreateRequests'), {
      status: 'pending',
      sessionId: this.sessionId,
      email,
      name: this.enrollmentForm.name.trim(),
      phone: this.enrollmentForm.phone.trim(),
      orgId,
      requestedByUid: profile?.uid || '',
      createdAt: serverTimestamp(),
    });

    // Wait for the Cloud Function to finish (up to 30s)
    const outcome = await new Promise<any>((resolve) => {
      const timeout = setTimeout(() => {
        unsub();
        resolve({ status: 'timeout' });
      }, 30000);
      const unsub = onSnapshot(reqRef, (snap) => {
        const data = snap.data() as any;
        if (data?.status === 'completed' || data?.status === 'failed') {
          clearTimeout(timeout);
          unsub();
          resolve(data);
        }
      });
    });

    if (outcome.status === 'completed') {
      this.notice.set(
        outcome.result?.created
          ? `✓ Account created for ${email}. The initial password was sent to the candidate by email${this.enrollmentForm.phone ? ' and SMS' : ''}, and they are enrolled in this session.`
          : `✓ ${email} enrolled in this session.`
      );
      this.closeEnrollmentModal();
      const session = this.session();
      if (session) await this.loadCandidates(session);
    } else if (outcome.status === 'failed') {
      this.notice.set(`✗ ${outcome.error?.message || 'Failed to create the account.'}`);
    } else {
      this.notice.set('Account creation is taking longer than expected — refresh in a moment.');
    }
  }

  getExamName(examId: string): string {
    if (!examId) return 'N/A';
    // Try to get from cache first
    if (this.examsCache.has(examId)) {
      return this.examsCache.get(examId)?.title || examId;
    }
    // For now, return the ID (in real app, would fetch from Firestore)
    return examId;
  }
}
