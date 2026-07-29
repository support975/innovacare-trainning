import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, combineLatest, map, of, switchMap } from 'rxjs';

import { AuthService } from '../../../../core/auth';
import { EventsService } from '../../../../shared/services/events.service';
import { FacultyService } from '../../../../shared/services/faculty.service';
import { SponsorsService } from '../../../../shared/services/sponsors.service';
import { AccreditationService } from '../../../../shared/services/accreditation.service';
import { LanguageService } from '../../../../shared/services/language';
import { PublicSiteNavComponent } from '../../../../shared/components/public-site-nav/public-site-nav';
import { Tilt3dDirective } from '../../../../shared/directives/tilt-3d.directive';
import { Accreditation, EventRegistration, Faculty, Sponsor, WebinarEvent } from '../../../../data/models';

@Component({
  selector: 'app-webinar-detail-page',
  standalone: true,
  imports: [CommonModule, RouterModule, PublicSiteNavComponent, Tilt3dDirective],
  templateUrl: './webinar-detail-page.html',
  styleUrl: './webinar-detail-page.css',
})
export class WebinarDetailPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly eventsService = inject(EventsService);
  private readonly facultyService = inject(FacultyService);
  private readonly sponsorsService = inject(SponsorsService);
  private readonly accreditationService = inject(AccreditationService);
  private readonly language = inject(LanguageService);

  readonly registering = signal(false);
  readonly justRegistered = signal(false);
  readonly notice = signal('');

  readonly profile = toSignal(this.auth.profile$, { initialValue: null });

  // null = still loading, undefined = not found / not permitted, else the event.
  private readonly eventResult = toSignal(
    this.route.paramMap.pipe(
      map((params) => params.get('id') ?? ''),
      switchMap((id) => (id ? this.eventsService.getById(id).pipe(catchError(() => of(undefined))) : of(undefined))),
      map((event): WebinarEvent | undefined | null => event)
    ),
    { initialValue: null as WebinarEvent | undefined | null }
  );

  readonly loading = computed(() => this.eventResult() === null);
  readonly notFound = computed(() => !this.loading() && this.eventResult() === undefined);
  readonly event = computed<WebinarEvent | null>(() => this.eventResult() || null);

  readonly faculty = toSignal(
    toObservable(this.event).pipe(
      switchMap((event) => {
        const ids = event?.facultyIds ?? [];
        return ids.length ? combineLatest(ids.map((id) => this.facultyService.getById(id))) : of([] as (Faculty | undefined)[]);
      })
    ),
    { initialValue: [] as (Faculty | undefined)[] }
  );

  readonly sponsors = toSignal(
    toObservable(this.event).pipe(
      switchMap((event) => {
        const ids = event?.sponsorIds ?? [];
        return ids.length ? combineLatest(ids.map((id) => this.sponsorsService.getById(id))) : of([] as (Sponsor | undefined)[]);
      })
    ),
    { initialValue: [] as (Sponsor | undefined)[] }
  );

  readonly accreditation = toSignal(
    toObservable(this.event).pipe(
      switchMap((event) => (event?.accreditationId ? this.accreditationService.getById(event.accreditationId) : of(undefined)))
    ),
    { initialValue: undefined as Accreditation | undefined }
  );

  readonly isMember = computed(() => {
    const orgId = this.profile()?.orgId;
    const event = this.event();
    return !!orgId && !!event?.assignedOrgIds?.includes(orgId);
  });

  readonly price = computed<number | null>(() => {
    const event = this.event();
    if (!event) return null;
    return this.isMember() ? event.pricing?.memberPrice ?? null : event.pricing?.guestPrice ?? 0;
  });

  readonly isFree = computed(() => {
    const price = this.price();
    return price === null || price === 0;
  });

  private readonly myRegistrations = toSignal(
    this.route.paramMap.pipe(
      switchMap((params) => {
        const uid = this.auth.currentUid;
        const id = params.get('id');
        return uid && id ? this.eventsService.myRegistrationsForEvent(id, uid) : of([] as EventRegistration[]);
      })
    ),
    { initialValue: [] as EventRegistration[] }
  );

  readonly alreadyRegistered = computed(() => this.myRegistrations().length > 0 || this.justRegistered());

  readonly spotsRemaining = computed<number | null>(() => {
    const event = this.event();
    if (!event?.capacity) return null;
    return Math.max(0, event.capacity - (event.registeredCount || 0));
  });

  readonly durationLabel = computed(() => {
    const event = this.event();
    if (!event) return '';
    const [sh, sm] = (event.schedule.startTime || '0:0').split(':').map(Number);
    const [eh, em] = (event.schedule.endTime || '0:0').split(':').map(Number);
    const minutes = eh * 60 + em - (sh * 60 + sm);
    if (!Number.isFinite(minutes) || minutes <= 0) return '';
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours}h ${rest}min` : `${hours}h`;
  });

  readonly accreditationPills = computed(() => {
    const accr = this.accreditation();
    if (!accr) return [] as string[];
    const pills: string[] = [];
    if (accr.providerNumber) pills.push(`${accr.accreditingOrganization} · #${accr.providerNumber}`);
    else pills.push(accr.accreditingOrganization);
    (accr.applicableBoards || []).forEach((board: string) => pills.push(board));
    (accr.applicableCertifications || []).forEach((cert: string) => pills.push(cert));
    return pills;
  });

  readonly shareUrl = computed(() => (typeof window !== 'undefined' ? window.location.href : ''));

  readonly shareLinks = computed(() => {
    const url = encodeURIComponent(this.shareUrl());
    const title = encodeURIComponent(this.event()?.title || 'Webinar');
    return {
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
      twitter: `https://twitter.com/intent/tweet?url=${url}&text=${title}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
      email: `mailto:?subject=${title}&body=${url}`,
    };
  });

  readonly tabs = computed(() => {
    const list: { id: string; label: string }[] = [{ id: 'overview', label: this.t('publicWebinarDetail.tab.overview') }];
    if (this.accreditation()) list.push({ id: 'accreditation', label: this.t('publicWebinarDetail.tab.accreditation') });
    if (this.knownFaculty().length) list.push({ id: 'faculty', label: this.t('publicWebinarDetail.tab.faculty') });
    if (this.knownSponsors().length) list.push({ id: 'supporters', label: this.t('publicWebinarDetail.tab.supporters') });
    list.push({ id: 'faq', label: this.t('publicWebinarDetail.tab.faq') });
    return list;
  });

  readonly activeTab = signal('overview');

  setTab(id: string): void {
    this.activeTab.set(id);
  }

  addToCalendar(): void {
    const event = this.event();
    const date = event?.schedule?.date?.toDate?.() as Date | undefined;
    if (!event || !date) return;

    const toIcsDate = (base: Date, time: string): string => {
      const [h, m] = time.split(':').map(Number);
      const d = new Date(base);
      d.setHours(h || 0, m || 0, 0, 0);
      return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Innovacare Training//Webinars//EN',
      'BEGIN:VEVENT',
      `UID:${event.id}@innovacaretraining`,
      `DTSTART:${toIcsDate(date, event.schedule.startTime)}`,
      `DTEND:${toIcsDate(date, event.schedule.endTime)}`,
      `SUMMARY:${(event.title || '').replace(/\r?\n/g, ' ')}`,
      `DESCRIPTION:${(event.description || '').replace(/\r?\n/g, '\\n')}`,
      event.zoom?.joinUrl ? `URL:${event.zoom.joinUrl}` : '',
      'END:VEVENT',
      'END:VCALENDAR',
    ]
      .filter(Boolean)
      .join('\r\n');

    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(event.title || 'webinar').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.ics`;
    link.click();
    URL.revokeObjectURL(url);
  }

  t(key: string): string {
    return this.language.t(key);
  }

  formatDate(): string {
    const event = this.event();
    const date = event?.schedule?.date?.toDate?.() as Date | undefined;
    if (!date || !event) return '';
    return date.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }

  knownFaculty(): Faculty[] {
    return this.faculty().filter((f): f is Faculty => !!f);
  }

  knownSponsors(): Sponsor[] {
    return this.sponsors().filter((s): s is Sponsor => !!s);
  }

  async register(): Promise<void> {
    const event = this.event();
    if (!event?.id || this.registering() || this.alreadyRegistered()) return;

    const uid = this.auth.currentUid;
    if (!uid) {
      await this.router.navigate(['/signup'], { queryParams: { eventId: event.id } });
      return;
    }

    this.registering.set(true);
    this.notice.set('');
    try {
      const profile = this.profile();
      const free = this.isFree();
      const registrationId = await this.eventsService.register({
        eventId: event.id,
        uid,
        orgId: profile?.orgId ?? null,
        tier: this.isMember() ? 'member' : 'guest',
        paymentStatus: free ? 'free' : 'pending',
      });

      if (free) {
        this.justRegistered.set(true);
        return;
      }

      const { url } = await this.eventsService.createCheckoutSession(event.id, registrationId);
      if (!url) {
        this.notice.set('Could not start checkout. Please try again.');
        return;
      }
      window.location.href = url;
    } catch (e: any) {
      this.notice.set(e?.message || 'Registration failed. Please try again.');
    } finally {
      this.registering.set(false);
    }
  }
}
