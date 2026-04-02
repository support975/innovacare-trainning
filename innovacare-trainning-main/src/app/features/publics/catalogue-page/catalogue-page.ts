import { Component, computed, ElementRef, HostListener, inject, QueryList, signal, ViewChildren } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { CourseCatalogService } from '../catalogue-page';
import { Course } from '../../../data/models';
import { MatDialog } from '@angular/material/dialog';
import { DemoRequestDialog } from '../demo-request-dialog/demo-request-dialog';


interface HeroHighlight {
  icon: string;
  label: string;
}

interface TrustItem {
  icon: string;
  label: string;
}

interface IssueItem {
  icon: string;
  text: string;
}

interface FeatureItem {
  icon: string;
  title: string;
  description: string;
  tint: string;
}

interface CategoryItem {
  icon: string;
  title: string;
  description: string;
}

interface StepItem {
  number: string;
  icon: string;
  title: string;
  description: string;
}

interface PillItem {
  icon: string;
  label: string;
}

interface TestimonialItem {
  quote: string;
  name: string;
  role: string;
  company: string;
  initials: string;
}

interface FaqItem {
  question: string;
  answer: string;
  open?: boolean;
}


@Component({
  selector: 'app-course-catalog-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSnackBarModule,
    RouterModule,
  ],
  templateUrl: './catalogue-page.html',
  styleUrl: './catalogue-page.css',
})
export class CataloguePage  {

   @ViewChildren('revealRef') revealElements!: QueryList<ElementRef<HTMLElement>>;

  private readonly dialog = inject(MatDialog);

  mobileMenuOpen = false;
  headerScrolled = false;
  activeCategory = 2;
  activeTestimonial = 0;

  private revealObserver?: IntersectionObserver;
  private testimonialInterval?: ReturnType<typeof setInterval>;

  readonly heroHighlights: HeroHighlight[] = [
    { icon: '✓', label: 'Onboarding structuré' },
    { icon: '✓', label: 'Conformité et traçabilité' },
    { icon: '✓', label: 'Suivi de progression' },
    { icon: '✓', label: 'Certificats et évaluations' },
  ];

  readonly trustItems: TrustItem[] = [
    { icon: '⌘', label: 'Conçu pour les organisations de santé' },
    { icon: '◎', label: 'Pensé pour la formation des équipes' },
    { icon: '↗', label: 'Suivi clair des complétions' },
    { icon: '◫', label: 'Parcours plus structurés et documentés' },
  ];

  readonly challengeItems: IssueItem[] = [
    { icon: '✕', text: 'Formation dispersée entre documents, PDF, messages et supports multiples' },
    { icon: '✕', text: 'Onboarding du personnel non standardisé selon les services ou sites' },
    { icon: '✕', text: 'Suivi manuel chronophage pour les managers et responsables de formation' },
    { icon: '✕', text: 'Manque de visibilité sur les formations réellement complétées' },
    { icon: '✕', text: 'Difficulté à documenter les résultats, validations et certificats' },
    { icon: '✕', text: 'Manque d’homogénéité entre équipes, services ou structures' },
  ];

  readonly solutionItems: IssueItem[] = [
    { icon: '✓', text: 'Assignation des cours par rôle, équipe ou organisation' },
    { icon: '✓', text: 'Suivi centralisé des apprenants avec vue consolidée' },
    { icon: '✓', text: 'Évaluations et quiz intégrés pour vérifier les acquis' },
    { icon: '✓', text: 'Certificats et historiques de complétion facilement accessibles' },
    { icon: '✓', text: 'Bibliothèque documentaire structurée pour les contenus pédagogiques' },
    { icon: '✓', text: 'Gestion multi-organisations avec meilleure visibilité manager' },
  ];

  readonly features: FeatureItem[] = [
    {
      icon: '☑',
      title: 'Assignation des cours',
      description: 'Attribuez les formations selon les rôles, équipes ou structures.',
      tint: 'blue',
    },
    {
      icon: '↗',
      title: 'Progression des apprenants',
      description: 'Suivez l’avancement, les complétions et les retards.',
      tint: 'green',
    },
    {
      icon: '≣',
      title: 'Quiz & évaluations',
      description: 'Vérifiez les acquis avec des évaluations structurées.',
      tint: 'purple',
    },
    {
      icon: '✦',
      title: 'Certificats',
      description: 'Documentez les résultats et les validations.',
      tint: 'gold',
    },
    {
      icon: '◉',
      title: 'Gestion des rôles',
      description: 'Expériences distinctes pour admins, managers et apprenants.',
      tint: 'red',
    },
    {
      icon: '▥',
      title: 'Bibliothèque de ressources',
      description: 'Centralisez politiques, procédures et supports pédagogiques.',
      tint: 'indigo',
    },
    {
      icon: '⌂',
      title: 'Onboarding structuré',
      description: 'Standardisez l’intégration du personnel et les parcours clés.',
      tint: 'cyan',
    },
    {
      icon: '◲',
      title: 'Vue manager / admin',
      description: 'Donnez une vision claire de l’activité de formation.',
      tint: 'emerald',
    },
  ];

  readonly categories: CategoryItem[] = [
    { icon: '⌂', title: 'Home Care', description: 'Parcours pour coordination à domicile et équipes terrain.' },
    { icon: '♡', title: 'Home Health', description: 'Modules conçus pour les besoins de soins à domicile.' },
    { icon: '⌘', title: 'Skilled Nursing', description: 'Pour SNF, préparation clinique et standardisation.' },
    { icon: '◌', title: 'Hospice', description: 'Parcours adaptés à l’accompagnement et à la coordination.' },
    { icon: '✚', title: 'Hospital', description: 'Organisation plus fluide des parcours hospitaliers.' },
    { icon: '⚕', title: 'Private Practice', description: 'Pour cabinets, cliniques et petites structures.' },
    { icon: '🛡', title: 'Compliance & Policies', description: 'Formation conformité, procédures et traçabilité.' },
    { icon: '▣', title: 'Workforce Readiness', description: 'Préparez les équipes avec des parcours concrets.' },
  ];

  readonly steps: StepItem[] = [
    {
      number: '01',
      icon: '▤',
      title: 'Organiser les contenus',
      description: 'Regroupez modules, procédures, ressources et évaluations.',
    },
    {
      number: '02',
      icon: '◔',
      title: 'Assigner les parcours',
      description: 'Diffusez les formations selon les rôles ou structures.',
    },
    {
      number: '03',
      icon: '⌁',
      title: 'Suivre les progrès',
      description: 'Visualisez l’avancement et les complétions.',
    },
    {
      number: '04',
      icon: '☰',
      title: 'Documenter les résultats',
      description: 'Conservez un historique clair des validations et certificats.',
    },
  ];

  readonly organizationBenefits: string[] = [
    'Standardiser l’onboarding',
    'Structurer les parcours de formation',
    'Améliorer la visibilité managériale',
    'Réduire le suivi manuel',
    'Renforcer la traçabilité',
    'Soutenir la préparation organisationnelle',
  ];

  readonly learnerBenefits: string[] = [
    'Accéder facilement aux formations assignées',
    'Suivre une progression claire',
    'Compléter les modules plus simplement',
    'Réussir les évaluations',
    'Retrouver certificats et contenus dans un espace unique',
  ];

  readonly credibilityPills: PillItem[] = [
    { icon: '◔', label: 'Visibilité' },
    { icon: '🛡', label: 'Responsabilité' },
    { icon: '◫', label: 'Traçabilité' },
    { icon: '▤', label: 'Standardisation' },
    { icon: '◎', label: 'Préparation des équipes' },
    { icon: '⚙', label: 'Meilleure gouvernance' },
  ];

  readonly testimonials: TestimonialItem[] = [
    {
      quote:
        'Depuis que nous utilisons Innovacare Training, l’onboarding de nos nouveaux soignants est devenu beaucoup plus structuré. Nous avons enfin un suivi clair des parcours, des validations et des ressources à transmettre.',
      name: 'Sophie Martinet',
      role: 'Administratrice Home Care',
      company: 'Structure de soins à domicile',
      initials: 'SM',
    },
    {
      quote:
        'La plateforme nous aide à mieux standardiser la formation conformité et à suivre les complétions sans multiplier les tableaux manuels. La visibilité managériale est nettement meilleure.',
      name: 'Thomas Lefebvre',
      role: 'Responsable formation',
      company: 'Organisation multi-sites',
      initials: 'TL',
    },
    {
      quote:
        'En tant que manager, j’apprécie énormément la clarté de l’interface et le pilotage efficace qu’elle offre. On voit rapidement ce qui avance, ce qui bloque et ce qui doit être relancé.',
      name: 'Claire Rousseau',
      role: 'Manager de structure',
      company: 'Établissement de santé',
      initials: 'CR',
    },
  ];

  readonly faqs: FaqItem[] = [
    {
      question: 'À qui s’adresse Innovacare Training ?',
      answer:
        'Innovacare Training s’adresse aux organisations de santé, responsables de formation, administrateurs, managers et professionnels qui souhaitent mieux structurer la formation du personnel, l’onboarding et le suivi des parcours.',
      open: true,
    },
    {
      question: 'Peut-on assigner des cours selon les rôles ou équipes ?',
      answer:
        'Oui. Les contenus peuvent être assignés selon les rôles, équipes, services ou structures, pour une gestion de la formation plus cohérente et plus adaptée au terrain.',
    },
    {
      question: 'Les apprenants peuvent-ils suivre leur progression ?',
      answer:
        'Oui. Les apprenants disposent d’une vue claire sur leurs modules assignés, leur progression, leurs évaluations et leurs validations dans un espace unique.',
    },
    {
      question: 'La plateforme permet-elle de gérer les certificats ?',
      answer:
        'Oui. Innovacare Training aide à documenter les complétions et à conserver un historique clair des certificats, validations et résultats associés à chaque parcours.',
    },
    {
      question: 'Innovacare Training peut-il être utilisé pour plusieurs structures ou organisations ?',
      answer:
        'Oui. Le produit est pensé pour une gestion multi-organisations permettant de piloter plusieurs structures tout en gardant une logique de standardisation et de visibilité centralisée.',
    },
  ];

  readonly kpis = [
    { label: 'Parcours actifs', value: '24' },
    { label: 'Taux de complétion', value: '86%' },
    { label: 'Certificats validés', value: '312' },
  ];

  readonly progressBars = [
    { label: 'Onboarding du personnel', value: 92 },
    { label: 'Formation conformité', value: 81 },
    { label: 'Prévention clinique', value: 74 },
  ];

  readonly dashboardCards = [
    { icon: '▤', title: 'Parcours par rôle', description: 'Assignez par équipe, manager ou organisation.' },
    { icon: '☰', title: 'Quiz intégrés', description: 'Évaluez les acquis avec plus de cohérence.' },
    { icon: '✦', title: 'Certificats', description: 'Documentez les validations et les complétions.' },
    { icon: '⌘', title: 'Multi-organisations', description: 'Pilotez plusieurs structures depuis une base claire.' },
  ];

  ngAfterViewInit(): void {
    this.initRevealObserver();
    this.startTestimonialsAutoplay();
  }

  ngOnDestroy(): void {
    this.revealObserver?.disconnect();
    if (this.testimonialInterval) {
      clearInterval(this.testimonialInterval);
    }
  }

  @HostListener('window:scroll')
  onWindowScroll(): void {
    this.headerScrolled = window.scrollY > 10;
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen = !this.mobileMenuOpen;
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen = false;
  }

  openDemoDialog(): void {
    this.dialog.open(DemoRequestDialog, {
      width: '100%',
      maxWidth: '720px',
      autoFocus: false,
      panelClass: 'demo-request-dialog-panel',
      backdropClass: 'demo-request-dialog-backdrop',
    });
  }

  setActiveCategory(index: number): void {
    this.activeCategory = index;
  }

  setActiveTestimonial(index: number): void {
    this.activeTestimonial = index;
    this.restartTestimonialsAutoplay();
  }

  nextTestimonial(): void {
    this.activeTestimonial = (this.activeTestimonial + 1) % this.testimonials.length;
  }

  prevTestimonial(): void {
    this.activeTestimonial =
      (this.activeTestimonial - 1 + this.testimonials.length) % this.testimonials.length;
  }

  toggleFaq(index: number): void {
    this.faqs.forEach((item, itemIndex) => {
      item.open = itemIndex === index ? !item.open : false;
    });
  }

  trackByIndex(index: number): number {
    return index;
  }

  private initRevealObserver(): void {
    this.revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            this.revealObserver?.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.16,
        rootMargin: '0px 0px -60px 0px',
      }
    );

    queueMicrotask(() => {
      this.revealElements.forEach((item) => this.revealObserver?.observe(item.nativeElement));
    });
  }

  private startTestimonialsAutoplay(): void {
    this.testimonialInterval = setInterval(() => {
      this.nextTestimonial();
    }, 5000);
  }

  private restartTestimonialsAutoplay(): void {
    if (this.testimonialInterval) {
      clearInterval(this.testimonialInterval);
    }
    this.startTestimonialsAutoplay();
  }
  login(): void {
    // Redirige vers la page de connexion
    window.location.href = '/login';
  }
  private readonly courseService = inject(CourseCatalogService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);

  readonly loading = signal(true);
  readonly courses = signal<Course[]>([]);

  readonly searchTerm = signal('');
  readonly selectedType = signal<'all' | 'It' | 'Health' | 'Hr' | 'safety'>('all');
  readonly selectedKind = signal<'all' | 'Course' | 'Text' | 'Module'>('all');
  readonly selectedLang = signal<'all' | 'EN' | 'FR' | 'ES'>('all');
  readonly selectedAudience = signal('all');
  readonly selectedCareSetting = signal('all');
  readonly sortBy = signal<'featured' | 'title' | 'duration' | 'ceCredit'>('featured');

  readonly availableAudiences = computed(() => {
    const values = new Set<string>();
    this.courses().forEach((course) => {
      (course.targetAudience ?? []).forEach((item) => values.add(item));
    });
    return ['all', ...Array.from(values).sort((a, b) => a.localeCompare(b))];
  });

  readonly availableCareSettings = computed(() => {
    const values = new Set<string>();
    this.courses().forEach((course) => {
      (course.healthMeta?.careSetting ?? []).forEach((item) => values.add(item));
    });
    return ['all', ...Array.from(values).sort((a, b) => a.localeCompare(b))];
  });

  readonly featuredCourses = computed(() =>
    this.courses().filter((course) => course.active !== false && !!course.imageUrl).slice(0, 4)
  );

  readonly filteredCourses = computed(() => {
    let items = [...this.courses()].filter((course) => course.active !== false);

    const search = this.searchTerm().trim().toLowerCase();
    const selectedType = this.selectedType();
    const selectedKind = this.selectedKind();
    const selectedLang = this.selectedLang();
    const selectedAudience = this.selectedAudience();
    const selectedCareSetting = this.selectedCareSetting();
    const sortBy = this.sortBy();

    if (search) {
      items = items.filter((course) => {
        const haystack = [
          course.title,
          course.subtitle ?? '',
          course.description,
          course.lecturer,
          course.level,
          ...(course.tags ?? []),
          ...(course.targetAudience ?? []),
          ...(course.prerequisites ?? []),
          ...(course.healthMeta?.clinicalTopics ?? []),
          ...(course.healthMeta?.careSetting ?? []),
        ]
          .join(' ')
          .toLowerCase();

        return haystack.includes(search);
      });
    }

    if (selectedType !== 'all') {
      items = items.filter((course) => course.type === selectedType);
    }

    if (selectedKind !== 'all') {
      items = items.filter((course) => course.kind === selectedKind);
    }

    if (selectedLang !== 'all') {
      items = items.filter((course) => course.lang === selectedLang);
    }

    if (selectedAudience !== 'all') {
      items = items.filter((course) =>
        (course.targetAudience ?? []).includes(selectedAudience)
      );
    }

    if (selectedCareSetting !== 'all') {
      items = items.filter((course) =>
        (course.healthMeta?.careSetting ?? []).includes(selectedCareSetting)
      );
    }

    switch (sortBy) {
      case 'title':
        items.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'duration':
        items.sort((a, b) => a.durationMin - b.durationMin);
        break;
      case 'ceCredit':
        items.sort((a, b) => (b.ceCredit ?? 0) - (a.ceCredit ?? 0));
        break;
      default:
        items.sort((a, b) => Number(Boolean(b.imageUrl)) - Number(Boolean(a.imageUrl)));
        break;
    }

    return items;
  });

  constructor() {
    this.courseService
      .getPublicActiveCourses()
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (courses) => {
          console.log('Courses loaded:', courses);
          this.courses.set(courses);
          this.loading.set(false);
        },
        error: (error) => {
          console.error('Erreur chargement catalogue', error);
          this.loading.set(false);
          this.snackBar.open(
            'Impossible de charger le catalogue pour le moment.',
            'Fermer',
            { duration: 6000 }
          );
        },
      });
  }

  setSearchTerm(value: string): void {
    this.searchTerm.set(value);
  }

  setType(value: 'all' | 'It' | 'Health' | 'Hr' | 'safety'): void {
    this.selectedType.set(value);
  }

  setKind(value: 'all' | 'Course' | 'Text' | 'Module'): void {
    this.selectedKind.set(value);
  }

  setLang(value: 'all' | 'EN' | 'FR' | 'ES'): void {
    this.selectedLang.set(value);
  }

  setAudience(value: string): void {
    this.selectedAudience.set(value);
  }

  setCareSetting(value: string): void {
    this.selectedCareSetting.set(value);
  }

  setSort(value: 'featured' | 'title' | 'duration' | 'ceCredit'): void {
    this.sortBy.set(value);
  }

  clearFilters(): void {
    this.searchTerm.set('');
    this.selectedType.set('all');
    this.selectedKind.set('all');
    this.selectedLang.set('all');
    this.selectedAudience.set('all');
    this.selectedCareSetting.set('all');
    this.sortBy.set('featured');
  }

  openCourse(courseId?: string): void {
    if (!courseId) return;
    this.router.navigate(['/catalogue', courseId]);
  }

  addToPathway(course: Course): void {
    if (!course.id) return;

    this.courseService.addToPathway({
      courseId: course.id,
      courseTitle: course.title,
      source: 'catalog-page',
    }).pipe(takeUntilDestroyed()).subscribe({
      next: () => {
        this.snackBar.open(`"${course.title}" ajouté au parcours.`, 'Fermer', {
          duration: 4000,
        });
      },
      error: (error) => {
        console.error('Erreur addToPathway', error);
        this.snackBar.open(
          'Impossible d’ajouter ce cours au parcours.',
          'Fermer',
          { duration: 5000 }
        );
      },
    });
  }

  totalLessonCount(course: Course): number {
    return (course.sections ?? []).reduce(
      (sum, section) => sum + (section.lessons?.length ?? 0),
      0
    );
  }
}