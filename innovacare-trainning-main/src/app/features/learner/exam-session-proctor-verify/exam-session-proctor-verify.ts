import { Component, OnInit, OnDestroy, inject, signal, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Firestore, doc, getDoc, setDoc, serverTimestamp } from '@angular/fire/firestore';

@Component({
  selector: 'app-exam-session-proctor-verify',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './exam-session-proctor-verify.html',
  styleUrls: ['./exam-session-proctor-verify.css'],
})
export class ExamSessionProctorVerifyComponent implements OnInit {
  @ViewChild('videoElement') videoElement!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvasElement') canvasElement!: ElementRef<HTMLCanvasElement>;

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private afs = inject(Firestore);

  sessionId = '';
  candidateUid = '';
  learnerEmail = '';
  token = '';

  learnerInfo = signal<any | null>(null);
  photoTaken = signal(false);
  photoDataUrl = signal<string | null>(null);

  loading = signal(false);
  error = signal('');

  cameraActive = signal(false);
  stream: MediaStream | null = null;

  ngOnInit(): void {
    this.sessionId = this.route.snapshot.queryParamMap.get('sessionId') || '';
    this.candidateUid = this.route.snapshot.queryParamMap.get('candidateUid') || '';
    this.learnerEmail = this.route.snapshot.queryParamMap.get('learnerEmail') || '';
    this.token = this.route.snapshot.queryParamMap.get('token') || '';

    if (!this.sessionId || !this.candidateUid || !this.token) {
      this.error.set('Invalid verification session.');
      return;
    }

    this.loadLearnerInfo();
    this.startCamera();
  }

  private async loadLearnerInfo(): Promise<void> {
    try {
      const userRef = doc(this.afs, `users/${this.candidateUid}`);
      const snap = await getDoc(userRef);

      if (snap.exists()) {
        this.learnerInfo.set(snap.data());
      } else {
        this.learnerInfo.set({ email: this.learnerEmail });
      }
    } catch (e: any) {
      console.error('Failed to load learner info:', e);
      this.learnerInfo.set({ email: this.learnerEmail });
    }
  }

  async startCamera(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });

      if (this.videoElement && this.videoElement.nativeElement) {
        this.videoElement.nativeElement.srcObject = this.stream;
      }
      this.cameraActive.set(true);
    } catch (e: any) {
      this.error.set('Unable to access camera. Please check permissions.');
    }
  }

  capturePhoto(): void {
    if (!this.videoElement || !this.canvasElement) return;

    const video = this.videoElement.nativeElement;
    const canvas = this.canvasElement.nativeElement;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      this.photoDataUrl.set(canvas.toDataURL('image/jpeg'));
      this.photoTaken.set(true);
    }
  }

  retakePhoto(): void {
    this.photoTaken.set(false);
    this.photoDataUrl.set(null);
  }

  async verifyIdentity(): Promise<void> {
    if (!this.photoDataUrl()) {
      this.error.set('Please capture a photo first.');
      return;
    }

    this.loading.set(true);
    try {
      // Save verification record
      const verificationRef = doc(
        this.afs,
        `examSessions/${this.sessionId}/candidateVerifications/${this.candidateUid}`
      );

      await setDoc(verificationRef, {
        candidateUid: this.candidateUid,
        email: this.learnerEmail,
        verified: true,
        verifiedAt: serverTimestamp(),
        photoDataUrl: this.photoDataUrl(),
      });

      // Stop camera and navigate to exam launcher
      this.stopCamera();
      await this.router.navigate(['/exam-session-launcher'], {
        queryParams: {
          sessionId: this.sessionId,
          candidateUid: this.candidateUid,
          learnerEmail: this.learnerEmail,
          token: this.token,
        },
      });
    } catch (e: any) {
      this.error.set(e?.message || 'Verification failed.');
    } finally {
      this.loading.set(false);
    }
  }

  rejectIdentity(): void {
    this.stopCamera();
    this.router.navigate(['/exam-session-login'], {
      queryParams: { sessionId: this.sessionId },
    });
  }

  private stopCamera(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.cameraActive.set(false);
    }
  }

  ngOnDestroy(): void {
    this.stopCamera();
  }
}
