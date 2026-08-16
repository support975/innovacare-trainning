import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/auth';
import { EnrollmentService } from '../../../shared/services/enrollement';
import { CourseCatalogService } from '../../publics/catalogue-page';
import { EventsService } from '../../../shared/services/events.service';
import { PublicTranslateDirective } from '../../../shared/directives/public-translate.directive';

@Component({
  standalone: true,
  selector: 'app-signup',
  imports: [CommonModule, ReactiveFormsModule, RouterLink, PublicTranslateDirective],
  templateUrl: './signup.html',
  styleUrls: ['./signup.css'],
})
export class SignupComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly enrollment = inject(EnrollmentService);
  private readonly courseService = inject(CourseCatalogService);
  private readonly eventsService = inject(EventsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly selectedCourseId = signal<string | null>(
    this.route.snapshot.queryParamMap.get('courseId')
  );
  readonly selectedEventId = signal<string | null>(
    this.route.snapshot.queryParamMap.get('eventId')
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

      const eventId = this.selectedEventId();
      if (eventId) {
        await this.registerForEvent(user.uid, eventId);
        return;
      }

      await this.router.navigate(['/learner'], { replaceUrl: true });
    } catch (error: any) {
      this.error.set(this.messageForError(error));
    } finally {
      this.loading.set(false);
    }
  }

  private async registerForEvent(uid: string, eventId: string): Promise<void> {
    const event = await firstValueFrom(this.eventsService.getById(eventId));
    if (!event) {
      await this.router.navigate(['/webinars'], { replaceUrl: true });
      return;
    }

    // New individual signups always land in the guest tier — there's no
    // orgId yet for member pricing to apply against.
    const guestPrice = event.pricing?.guestPrice ?? 0;
    const free = guestPrice === 0;

    const registrationId = await this.eventsService.register({
      eventId,
      uid,
      orgId: null,
      tier: 'guest',
      paymentStatus: free ? 'free' : 'pending',
    });

    if (free) {
      await this.router.navigate(['/webinars', eventId], { replaceUrl: true });
      return;
    }

    const { url } = await this.eventsService.createCheckoutSession(eventId, registrationId);
    if (url) {
      window.location.href = url;
      return;
    }
    await this.router.navigate(['/webinars', eventId], { replaceUrl: true });
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
      return 'Un compte existe déjà pour ce courriel. Connectez-vous plutôt.';
    }

    if (code.includes('auth/weak-password')) {
      return 'Utilisez un mot de passe plus robuste d\'au moins 8 caractères.';
    }

    if (code.includes('permission-denied')) {
      if (this.selectedCourseId()) {
        return 'Votre profil apprenant a été créé, mais cette demande de cours n\'a pas pu être soumise. Confirmez le lien du cours avec l\'administrateur de l\'organisation.';
      }
      if (this.selectedEventId()) {
        return 'Votre profil apprenant a été créé, mais cette inscription au webinaire n\'a pas pu être soumise. Veuillez réessayer de vous inscrire depuis la page du webinaire.';
      }
      return 'Ce cours n\'est pas disponible en accès public. Choisissez un cours public ou demandez l\'accès à l\'organisation.';
    }

    if (this.selectedEventId() && (code.includes('internal') || code.includes('unavailable') || code.includes('functions/'))) {
      return 'Votre profil apprenant a été créé, mais nous n\'avons pas pu démarrer le paiement pour ce webinaire. Veuillez vous connecter et réessayer de vous inscrire depuis la page du webinaire.';
    }

    // Firebase surfaces some failures (network/CORS, unhandled function
    // errors) with a bare technical code as the message — e.g. "internal" —
    // never show that raw string to the user.
    const message = String(error?.message ?? '').trim();
    const looksTechnical = !message || /^[a-z0-9_-]+$/i.test(message) || message.length > 160;
    return looksTechnical ? 'Impossible de créer votre profil apprenant. Veuillez réessayer.' : message;
  }
}
