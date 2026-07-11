import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../../core/auth';
import { ProctorService } from '../../../data/proctor.service';
import { ExamSessionAuthService } from '../../../data/exam-session-auth.service';
import { ExamBlueprintService } from '../../../data/exam-blueprint.service';
import { ExamCenter, ExamSession } from '../../../data/models';
import { Firestore, doc, updateDoc, deleteDoc } from '@angular/fire/firestore';

import { ToDatePipe } from '../../../shared/pipes/to-date.pipe';
@Component({
  selector: 'app-exam-sessions-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, ToDatePipe],
  templateUrl: './exam-sessions-admin.html',
  styleUrls: ['./exam-sessions-admin.css'],
})
export class ExamSessionsAdminComponent implements OnInit {
  private proctorService = inject(ProctorService);
  private examSessionAuthService = inject(ExamSessionAuthService);
  private blueprintService = inject(ExamBlueprintService);
  private afs = inject(Firestore);

  // Tab state
  activeTab = signal<'centers' | 'sessions'>('centers');
  sessionPasswords = signal<Record<string, string>>({});

  // User's organization
  private authService = inject(AuthService);
  userOrgId = signal('');

  // Centers
  centers = signal<ExamCenter[]>([]);
  newCenter = signal({
    name: '',
    address: '',
    city: '',
    state: '',
    country: 'USA',
    timezone: 'America/New_York',
    orgId: '',
  });

  // Sessions
  sessions = signal<ExamSession[]>([]);
  newSession = signal({
    examId: '',
    centerId: '',
    orgId: '',
    sessionDate: new Date().toISOString().split('T')[0],
    startTime: '09:00',
    endTime: '17:00',
    durationMinutes: 120,
    enrolledCandidateIds: [],
    requireIdentityVerification: true,
    status: 'scheduled' as const,
  });

  // Dropdowns data
  availableExams = signal<any[]>([]);
  availableCenters = signal<ExamCenter[]>([]);

  busy = signal(false);
  notice = signal('');

  // Kiosk setup
  kioskModalOpen = signal(false);
  kioskUrls = signal<Array<{ stationId: string; url: string; qrCode?: string }>>([]);

  ngOnInit() {
    // Get current user's organization
    this.authService.profile$.subscribe((profile: any) => {
      if (profile?.orgId) {
        this.userOrgId.set(profile.orgId);
        this.newCenter().orgId = profile.orgId;
        this.newSession().orgId = profile.orgId;

        // Load centers for this org
        this.proctorService.listCentersByOrg$(profile.orgId).subscribe(centers => {
          this.centers.set(centers);
          this.availableCenters.set(centers);
        });

        // Load all sessions for this org
        this.loadSessionsByOrg(profile.orgId);
      }
    });

    // Load available exams when org loads
    this.authService.profile$.subscribe((profile: any) => {
      if (profile?.orgId) {
        this.loadPublishedExams(profile.orgId);
      }
    });
  }

  private loadSessionsByOrg(orgId: string): void {
    this.proctorService.listSessionsByOrg$(orgId).subscribe({
      next: (sessions) => {
        this.sessions.set(sessions);
      },
      error: (err) => {
        console.error('Failed to load sessions:', err);
      },
    });
  }

  private loadPublishedExams(orgId: string): void {
    this.blueprintService.getBlueprintsByOrg(orgId).subscribe({
      next: (blueprints) => {
        // Show only published blueprints as available exams
        const published = blueprints.filter(b => b.status === 'published');
        this.availableExams.set(published.map(b => ({
          id: b.id,
          ...b
        })));
      },
      error: (err) => {
        console.error('Error loading published blueprints:', err);
      },
    });
  }

  async addCenter(): Promise<void> {
    const center = this.newCenter();
    if (!center.name || !center.city || !center.orgId) {
      this.notice.set('Please fill in all required fields.');
      return;
    }

    this.busy.set(true);
    try {
      const centerId = await this.proctorService.createCenter({
        name: center.name,
        address: center.address,
        city: center.city,
        state: center.state,
        country: center.country,
        timezone: center.timezone,
        orgId: center.orgId,
      });

      this.notice.set(`✓ Center created: ${centerId}`);
      this.resetCenterForm();

      // Reload centers
      this.proctorService.listCentersByOrg$(center.orgId).subscribe({
        next: (centers) => this.centers.set(centers),
      });
    } catch (e: any) {
      this.notice.set(e?.message || 'Failed to create center.');
    } finally {
      this.busy.set(false);
    }
  }

  async addSession(): Promise<void> {
    const session = this.newSession();
    if (
      !session.examId ||
      !session.centerId ||
      !session.orgId ||
      !session.sessionDate
    ) {
      this.notice.set('Please fill in all required fields.');
      return;
    }

    this.busy.set(true);
    try {
      const sessionDate = new Date(session.sessionDate);
      const sessionId = await this.proctorService.createSession({
        examId: session.examId,
        centerId: session.centerId,
        orgId: session.orgId,
        sessionDate: sessionDate,
        startTime: session.startTime,
        endTime: session.endTime,
        durationMinutes: session.durationMinutes,
        enrolledCandidateIds: session.enrolledCandidateIds,
        requireIdentityVerification: session.requireIdentityVerification,
        status: session.status,
      });

      this.notice.set(`✓ Session created: ${sessionId}`);
      this.resetSessionForm();

      // Reload sessions
      this.proctorService.listSessionsByExam$(session.examId).subscribe({
        next: (sessions) => this.sessions.set(sessions),
      });
    } catch (e: any) {
      this.notice.set(e?.message || 'Failed to create session.');
    } finally {
      this.busy.set(false);
    }
  }

  private resetCenterForm(): void {
    this.newCenter.set({
      name: '',
      address: '',
      city: '',
      state: '',
      country: 'USA',
      timezone: 'America/New_York',
      orgId: '',
    });
  }

  private resetSessionForm(): void {
    this.newSession.set({
      examId: '',
      centerId: '',
      orgId: '',
      sessionDate: new Date().toISOString().split('T')[0],
      startTime: '09:00',
      endTime: '17:00',
      durationMinutes: 120,
      enrolledCandidateIds: [],
      requireIdentityVerification: true,
      status: 'scheduled',
    });
  }

  async generateAccessPassword(sessionId: string): Promise<void> {
    this.busy.set(true);
    try {
      const password = this.examSessionAuthService.generateAccessPassword();
      const hashedPassword = this.simpleHash(password);

      // Save hashed password to session
      const sessionRef = doc(this.afs, `examSessions/${sessionId}`);
      await updateDoc(sessionRef, {
        accessPassword: hashedPassword,
      });

      // Show password to admin (only once!)
      const passwords = this.sessionPasswords();
      passwords[sessionId] = password;
      this.sessionPasswords.set(passwords);

      this.notice.set(`✓ Password generated: ${password} (Share with proctors only!)`);
    } catch (e: any) {
      this.notice.set(e?.message || 'Failed to generate password.');
    } finally {
      this.busy.set(false);
    }
  }

  private simpleHash(password: string): string {
    // Same hash function as exam-session-auth.service
    let hash = 0;
    for (let i = 0; i < password.length; i++) {
      const char = password.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return 'hash_' + Math.abs(hash).toString(36);
  }

  async deleteSession(sessionId: string): Promise<void> {
    if (!confirm('Are you sure you want to delete this session? This action cannot be undone.')) {
      return;
    }

    this.busy.set(true);
    try {
      const sessionRef = doc(this.afs, `examSessions/${sessionId}`);
      await deleteDoc(sessionRef);
      this.notice.set('✓ Session deleted successfully.');

      // Reload sessions
      const orgId = this.userOrgId();
      if (orgId) {
        this.loadSessionsByOrg(orgId);
      }
    } catch (e: any) {
      this.notice.set(e?.message || 'Failed to delete session.');
    } finally {
      this.busy.set(false);
    }
  }

  async deleteCenter(centerId: string): Promise<void> {
    if (!confirm('Are you sure you want to delete this center? This action cannot be undone.')) {
      return;
    }

    this.busy.set(true);
    try {
      const centerRef = doc(this.afs, `examCenters/${centerId}`);
      await deleteDoc(centerRef);
      this.notice.set('✓ Center deleted successfully.');

      // Reload centers
      const orgId = this.userOrgId();
      if (orgId) {
        this.proctorService.listCentersByOrg$(orgId).subscribe({
          next: (centers) => this.centers.set(centers),
        });
      }
    } catch (e: any) {
      this.notice.set(e?.message || 'Failed to delete center.');
    } finally {
      this.busy.set(false);
    }
  }

  getExamName(examId: string): string {
    const exam = this.availableExams().find(e => e.id === examId);
    return exam?.title || examId;
  }

  getCenterName(centerId: string): string {
    const center = this.availableCenters().find(c => c.id === centerId);
    return center ? `${center.name} (${center.city})` : centerId;
  }

  openKioskSetup(sessionId: string): void {
    const baseUrl = window.location.origin;
    const urls: Array<{ stationId: string; url: string }> = [];

    for (let i = 1; i <= 10; i++) {
      const kioskUrl = `${baseUrl}/kiosk-exam/${sessionId}/${i}`;
      urls.push({
        stationId: String(i),
        url: kioskUrl,
      });
    }

    this.kioskUrls.set(urls);
    this.kioskModalOpen.set(true);
  }

  closeKioskModal(): void {
    this.kioskModalOpen.set(false);
  }

  copyToClipboard(text: string): void {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        this.notice.set('✓ URL copied to clipboard');
      }).catch(() => {
        this.notice.set('Failed to copy URL');
      });
    } else {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        this.notice.set('✓ URL copied to clipboard');
      } catch {
        this.notice.set('Failed to copy URL');
      }
      document.body.removeChild(textArea);
    }
  }
}
