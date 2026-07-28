import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { combineLatest, map, of, switchMap } from 'rxjs';

import { AuthService } from '../../../../core/auth';
import { EventsService } from '../../../../shared/services/events.service';
import { LanguageService } from '../../../../shared/services/language';
import { WebinarEvent } from '../../../../data/models';

interface EventCardVm {
  event: WebinarEvent;
  isMember: boolean;
  price: number | null;
}

@Component({
  selector: 'app-events-catalog',
  imports: [CommonModule],
  templateUrl: './events-catalog.html',
  styleUrl: './events-catalog.css',
})
export class EventsCatalog {
  private readonly auth = inject(AuthService);
  private readonly eventsService = inject(EventsService);
  private readonly language = inject(LanguageService);

  private readonly profile = toSignal(this.auth.profile$, { initialValue: null });

  registering = signal<string | null>(null);
  registeredEventIds = signal<Set<string>>(new Set());
  notice = signal('');

  private readonly events = toSignal(
    this.auth.profile$.pipe(
      switchMap((profile) => {
        const orgId = profile?.orgId ?? null;
        const publicEvents$ = this.eventsService.listPublicEvents();
        const orgEvents$ = orgId ? this.eventsService.listForOrg(orgId) : of([] as WebinarEvent[]);
        return combineLatest([publicEvents$, orgEvents$]).pipe(
          map(([publicEvents, orgEvents]) => {
            const byId = new Map<string, WebinarEvent>();
            for (const e of [...orgEvents, ...publicEvents]) {
              if (e.id) byId.set(e.id, e);
            }
            return Array.from(byId.values()).sort((a, b) => {
              const ad = (a.schedule?.date?.toMillis?.() ?? 0) as number;
              const bd = (b.schedule?.date?.toMillis?.() ?? 0) as number;
              return ad - bd;
            });
          })
        );
      })
    ),
    { initialValue: [] as WebinarEvent[] }
  );

  readonly cards = computed<EventCardVm[]>(() => {
    const orgId = this.profile()?.orgId ?? null;
    return this.events().map((event) => {
      const isMember = !!orgId && !!event.assignedOrgIds?.includes(orgId);
      const price = isMember ? event.pricing?.memberPrice ?? null : event.pricing?.guestPrice ?? 0;
      return { event, isMember, price };
    });
  });

  t(key: string): string {
    return this.language.t(key);
  }

  formatDate(vm: EventCardVm): string {
    const date = vm.event.schedule?.date?.toDate?.() as Date | undefined;
    if (!date) return '';
    const datePart = date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    return `${datePart} · ${vm.event.schedule.startTime}–${vm.event.schedule.endTime} ${vm.event.schedule.timezone}`;
  }

  isFree(vm: EventCardVm): boolean {
    return vm.price === null || vm.price === 0;
  }

  isRegistered(eventId?: string): boolean {
    return !!eventId && this.registeredEventIds().has(eventId);
  }

  async register(vm: EventCardVm) {
    const profile = this.profile();
    const eventId = vm.event.id;
    if (!profile || !eventId) return;

    if (!this.isFree(vm)) {
      this.notice.set('Online payment for this event is coming soon.');
      return;
    }

    this.registering.set(eventId);
    this.notice.set('');
    try {
      await this.eventsService.register({
        eventId,
        uid: profile.uid,
        orgId: profile.orgId ?? null,
        tier: vm.isMember ? 'member' : 'guest',
        paymentStatus: 'free',
      });
      this.registeredEventIds.update((set) => new Set(set).add(eventId));
      this.notice.set('You are registered. Check your email for the confirmation.');
    } catch (e: any) {
      this.notice.set(e?.message || 'Registration failed. Please try again.');
    } finally {
      this.registering.set(null);
    }
  }
}
