import { Component, inject, signal, computed, OnInit, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';

import { Auth } from '@angular/fire/auth';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';

type HonorLabel = 'Pass' | 'Merit' | 'Honors' | 'High Honors';

@Component({
  selector: 'app-certifications',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './certifications.html',
  styleUrl: './certifications.css'
})
export class Certifications implements OnInit {
  private route = inject(ActivatedRoute);
  private afs = inject(Firestore);
  private auth = inject(Auth);

  courseId = '';
  examId = '';

  notice = signal('');
  busy = signal(false);

  // Loaded
  userName = signal('Learner');
  userEmail = signal('');
  courseTitle = signal('Course');
  completedAt = signal<string>(new Date().toLocaleDateString());

  // For “honor” label
  percent = signal<number>(0); // optional if you store score somewhere
  honor = computed<HonorLabel>(() => {
    const p = this.percent();
    if (p >= 95) return 'High Honors';
    if (p >= 90) return 'Honors';
    if (p >= 80) return 'Merit';
    return 'Pass';
  });

  // Certificate meta
  certificateNo = signal<string>('');
  issuedOn = signal<string>(new Date().toLocaleDateString());

  @ViewChild('certArea', { static: false }) certArea?: ElementRef<HTMLElement>;

  ngOnInit(): void {
    this.courseId = this.route.snapshot.queryParamMap.get('courseId') ?? '';
    this.examId = this.route.snapshot.queryParamMap.get('examId') ?? '';
  
    if (!this.courseId) {
      this.notice.set('Missing course id.');
      return;
    }
  
    this.loadAll();
  }

  private async loadAll() {
    this.busy.set(true);
    this.notice.set('');
    try {
      const user = this.auth.currentUser;
      if (!user) {
        this.notice.set('Please sign in first.');
        return;
      }

      // user profile from users/{uid}
      const uSnap = await getDoc(doc(this.afs, `users/${user.uid}`) as any);
      const u: any = uSnap.exists() ? uSnap.data() : {};
      this.userName.set(String(u?.displayName || user.displayName || 'Learner'));
      //this.userEmail.set(String(u?.email || user.email || ''));

      // course from courses/{courseId}
      const cSnap = await getDoc(doc(this.afs, `courses/${this.courseId}`) as any);
      const c: any = cSnap.exists() ? cSnap.data() : {};
      this.courseTitle.set(String(c?.title || this.courseId));

      // OPTIONAL: score if stored on enrollment
      const eSnap = await getDoc(doc(this.afs, `users/${user.uid}/enrollments/${this.courseId}`) as any);
      const enr: any = eSnap.exists() ? eSnap.data() : {};
      const score = typeof enr?.score === 'number' ? enr.score : 0;
      this.percent.set(score);

      // completedAt
      const completedAt =
        enr?.completedAt?.toDate?.() ? enr.completedAt.toDate()
        : enr?.completedAt ? new Date(enr.completedAt)
        : new Date();

      this.completedAt.set(completedAt.toLocaleDateString());

      // certificate number (local deterministic-ish)
      this.certificateNo.set(this.makeCertNo(user.uid, this.courseId, completedAt));
      this.issuedOn.set(new Date().toLocaleDateString());
    } catch (e: any) {
      this.notice.set(e?.message || 'Failed to load certificate data.');
    } finally {
      this.busy.set(false);
    }
  }

  private makeCertNo(uid: string, courseId: string, d: Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const shortUid = uid.slice(0, 6).toUpperCase();
    const shortCourse = courseId.slice(0, 6).toUpperCase();
    return `ICT-${y}${m}${dd}-${shortCourse}-${shortUid}`;
  }

  print() {
    window.print();
  }

  /**
   * Download PDF
   * Option 1 (no lib): relies on browser “Print to PDF”
   * Option 2 (1-click PDF): install libs and use html2canvas + jspdf.
   */
  async downloadPdf() {
    // If you want 1-click PDF, install:
    // npm i jspdf html2canvas
    // Then keep this code.

    if (!this.certArea?.nativeElement) {
      this.notice.set('Certificate area not ready.');
      return;
    }

    this.busy.set(true);
    this.notice.set('');
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);

      const el = this.certArea.nativeElement;

      const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/png');

      const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();

      // Fit image in page
      const imgW = pageW;
      const imgH = (canvas.height * imgW) / canvas.width;
      const y = (pageH - imgH) / 2;

      pdf.addImage(imgData, 'PNG', 0, y > 0 ? y : 0, imgW, imgH);
      pdf.save(`${this.courseTitle().replace(/\s+/g, '_')}_Certificate.pdf`);
    } catch (e: any) {
      // fallback suggestion
      console.error(e);
      this.notice.set('PDF download failed. Use Print → Save as PDF, or install html2canvas + jspdf.');
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Email sending:
   * - Client cannot attach PDF via mailto reliably.
   * - Recommended: Cloud Function sendCertificateEmail (stub below).
   */
  async sendEmail() {
    const to = this.userEmail();
    if (!to) {
      this.notice.set('No user email found.');
      return;
    }

    // Minimal: open mailto with message (no attachment)
    const subject = encodeURIComponent(`Certificate of Completion — ${this.courseTitle()}`);
    const body = encodeURIComponent(
      `Hello,\n\nHere is your certificate for:\n${this.courseTitle()}\n\nCertificate #: ${this.certificateNo()}\nIssued: ${this.issuedOn()}\n\nInnovacare Training`
    );
    window.location.href = `mailto:${encodeURIComponent(to)}?subject=${subject}&body=${body}`;

    // Recommended: call Cloud Function to send with attached PDF or a Storage link.
    // Example (callable function):
    // await httpsCallable(this.functions, 'sendCertificateEmail')({ to, courseId: this.courseId, certNo: this.certificateNo() });
  }
}
