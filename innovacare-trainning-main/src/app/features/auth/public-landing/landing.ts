import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  QueryList,
  ViewChildren,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { DemoRequestDialog } from '../../publics/demo-request-dialog/demo-request-dialog';
import { PublicSiteNavComponent } from '../../../shared/components/public-site-nav/public-site-nav';
import { PublicTranslateDirective } from '../../../shared/directives/public-translate.directive';

interface TrustItem {
  icon: string;
  label: string;
}

interface FeatureItem {
  icon: string;
  title: string;
  description: string;
}

interface StepItem {
  number: string;
  title: string;
  description: string;
}

interface OrderCategory {
  icon: string;
  label: string;
}

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, RouterModule, MatDialogModule, PublicSiteNavComponent, PublicTranslateDirective],
  templateUrl: './landing.html',
  styleUrl: './landing.css',
})
export class PublicLandingComponent implements AfterViewInit, OnDestroy {
  @ViewChildren('revealRef') revealElements!: QueryList<ElementRef<HTMLElement>>;

  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);

  private revealObserver?: IntersectionObserver;

  readonly heroHighlights: TrustItem[] = [
    { icon: '✓', label: 'Structure régionale déléguée' },
    { icon: '✓', label: 'Image de marque personnalisée' },
    { icon: '✓', label: 'Certifications officielles' },
    { icon: '✓', label: 'Conformité vérifiable' },
  ];

  readonly trustItems: TrustItem[] = [
    { icon: '⌘', label: 'Conçu pour les ordres et associations professionnelles' },
    { icon: '◎', label: 'Une structure par région, un pilotage central' },
    { icon: '↗', label: 'Rapports de conformité en un clic' },
    { icon: '◫', label: 'Gouvernance et traçabilité complètes' },
  ];

  readonly features: FeatureItem[] = [
    {
      icon: '◈',
      title: 'Hiérarchie de conseil régional',
      description:
        'Créez des sections ou régions sous votre ordre, nommez leurs administrateurs et laissez chacune gérer ses propres membres, tout en gardant une vue d’ensemble centralisée.',
    },
    {
      icon: '◐',
      title: 'Image de marque personnalisée',
      description:
        'Logo, couleurs et identité visuelle propres à votre ordre sur chaque page apprenant — vos membres restent dans votre univers, pas dans un portail générique.',
    },
    {
      icon: '◆',
      title: 'Certifications officielles',
      description:
        'Sessions d’examen encadrées, surveillance à distance et délivrance de cartes de certification reconnues par votre autorité de certification.',
    },
    {
      icon: '▦',
      title: 'Suivi de conformité',
      description:
        'Matrice de conformité, politiques à faire acquitter et rappels automatisés pour savoir en tout temps qui est à jour — et qui ne l’est pas.',
    },
    {
      icon: '◉',
      title: 'Tableau de bord multi-organisation',
      description:
        'Une vue consolidée des membres inscrits, des taux de complétion et des dossiers en retard, agrégée automatiquement à travers toutes vos régions.',
    },
    {
      icon: '▣',
      title: 'Sécurité et gouvernance',
      description:
        'Rôles et permissions granulaires, journaux d’audit et règles d’accès strictes — chaque action reste tracée et attribuable.',
    },
  ];

  readonly steps: StepItem[] = [
    {
      number: '1',
      title: 'Enregistrez votre ordre',
      description: 'Créez le compte de votre organisation et configurez son identité visuelle.',
    },
    {
      number: '2',
      title: 'Déployez votre structure',
      description: 'Ajoutez vos régions ou sections et déléguez-en l’administration.',
    },
    {
      number: '3',
      title: 'Invitez vos membres',
      description: 'Vos professionnels rejoignent la plateforme sous votre organisation.',
    },
    {
      number: '4',
      title: 'Suivez la conformité',
      description: 'Progression, certifications et conformité, visibles en temps réel.',
    },
  ];

  readonly orderCategories: OrderCategory[] = [
    { icon: '✚', label: 'Ordres en soins infirmiers' },
    { icon: '⚕', label: 'Ordres et collèges de médecins' },
    { icon: '⌇', label: 'Ordres dentaires' },
    { icon: '✛', label: 'Ordres pharmaceutiques' },
    { icon: '◫', label: 'Associations et collèges professionnels' },
  ];

  ngAfterViewInit(): void {
    this.initRevealObserver();
  }

  ngOnDestroy(): void {
    this.revealObserver?.disconnect();
  }

  trackByIndex(index: number): number {
    return index;
  }

  openDemoDialog(): void {
    this.dialog.open(DemoRequestDialog, {
      width: '100%',
      maxWidth: '720px',
      autoFocus: false,
      panelClass: 'demo-request-dialog-panel',
      backdropClass: 'demo-request-dialog-backdrop',
      data: { source: 'public-nav-ordre' },
    });
  }

  goToRegister(): void {
    void this.router.navigate(['/register-organization']);
  }

  goToOrgLogin(): void {
    void this.router.navigate(['/login-org']);
  }

  private initRevealObserver(): void {
    if (typeof IntersectionObserver === 'undefined' || this.prefersReducedMotionOrSmallScreen()) {
      queueMicrotask(() => {
        this.revealElements.forEach((item) => item.nativeElement.classList.add('is-visible'));
      });
      return;
    }

    this.revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            this.revealObserver?.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.16, rootMargin: '0px 0px -60px 0px' }
    );

    queueMicrotask(() => {
      this.revealElements.forEach((item) => this.revealObserver?.observe(item.nativeElement));
    });
  }

  private prefersReducedMotionOrSmallScreen(): boolean {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return (
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      window.matchMedia('(max-width: 768px)').matches
    );
  }
}
