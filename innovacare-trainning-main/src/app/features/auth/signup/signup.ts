import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth';
import { EnrollmentService } from '../../../shared/services/enrollement';
import { CourseCatalogService } from '../../publics/catalogue-page';

@Component({
  standalone: true,
  selector: 'app-signup',
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './signup.html',
  styleUrls: ['./signup.css'],
})
export class SignupComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly enrollment = inject(EnrollmentService);
  private readonly courseService = inject(CourseCatalogService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly selectedCourseId = signal<string | null>(
    this.route.snapshot.queryParamMap.get('courseId')
  );
  readonly requestAccess = signal(
    this.route.snapshot.queryParamMap.get('requestAccess') === '1'
  );

  readonly form = this.fb.group({
    displayName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', [Validators.required]],
  });

  get passwordMismatch(): boolean {
    const { password, confirmPassword } = this.form.getRawValue();
    return !!password && !!confirmPassword && password !== confirmPassword;
  }

  async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.passwordMismatch || this.loading()) return;

    this.loading.set(true);
    this.error.set(null);

    const { displayName, email, password } = this.form.getRawValue();

    try {
      const user = await this.auth.registerIndividualLearner({
        displayName: displayName!,
        email: email!,
        password: password!,
      });

      const courseId = this.selectedCourseId();
      if (courseId) {
        if (this.requestAccess()) {
          await this.requestOrganizationCourseAccess(courseId);
          return;
        }

        try {
          await this.enrollment.ensureEnrollment(user.uid, courseId, 'self');
          await this.router.navigate(['/learner/courses', courseId], { replaceUrl: true });
          return;
        } catch (error: any) {
          if (!this.isPrivateCourseAccessError(error)) throw error;
          await this.requestOrganizationCourseAccess(courseId);
        }
        return;
      }

      await this.router.navigate(['/learner'], { replaceUrl: true });
    } catch (error: any) {
      this.error.set(this.messageForError(error));
    } finally {
      this.loading.set(false);
    }
  }

  private async requestOrganizationCourseAccess(courseId: string): Promise<void> {
    await this.courseService.requestOrganizationCourseAccess({
      courseId,
      source: 'individual-signup',
    });
    await this.router.navigate(['/learner/assignments'], {
      queryParams: { accessRequest: 'submitted' },
      replaceUrl: true,
    });
  }

  private isPrivateCourseAccessError(error: any): boolean {
    const code = String(error?.code ?? '');
    const message = String(error?.message ?? '');
    return code.includes('permission-denied') || message.includes('Missing or insufficient permissions');
  }

  private messageForError(error: any): string {
    const code = String(error?.code ?? '');

    if (code.includes('auth/email-already-in-use')) {
      return 'An account already exists for this email. Sign in instead.';
    }

    if (code.includes('auth/weak-password')) {
      return 'Use a stronger password with at least 8 characters.';
    }

    if (code.includes('permission-denied')) {
      if (this.selectedCourseId()) {
        return 'Your learner profile was created, but this course request could not be submitted. Confirm the organization course link with the admin.';
      }
      return 'This course is not available for public access. Choose a public course or request access from the organization.';
    }

    return error?.message ?? 'Unable to create your learner profile.';
  }
}
