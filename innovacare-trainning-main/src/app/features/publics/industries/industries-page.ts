import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { RouterModule } from '@angular/router';

import { PublicSiteNavComponent } from '../../../shared/components/public-site-nav/public-site-nav';
import { PublicTranslateDirective } from '../../../shared/directives/public-translate.directive';
import { DemoRequestDialog } from '../demo-request-dialog/demo-request-dialog';

interface IndustryCard {
  icon: string;
  title: string;
  description: string;
}

interface UseCaseCard {
  icon: string;
  title: string;
  text: string;
}

@Component({
  selector: 'app-industries-page',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatChipsModule,
    MatIconModule,
    RouterModule,
    PublicSiteNavComponent,
    PublicTranslateDirective,
  ],
  templateUrl: './industries-page.html',
  styleUrl: './industries-page.css',
})
export class IndustriesPage {
  private readonly dialog = inject(MatDialog);

  readonly industries: IndustryCard[] = [
    {
      icon: 'business_center',
      title: 'Services professionnels',
      description: 'Onboarding, politiques internes, formation client et montée en compétence des équipes.',
    },
    {
      icon: 'precision_manufacturing',
      title: 'Industrie & fabrication',
      description: 'SOP, sécurité, qualité, maintenance et formation des opérateurs sur plusieurs sites.',
    },
    {
      icon: 'construction',
      title: 'Construction & sécurité',
      description: 'Parcours sécurité, procédures terrain, attestations et suivi des formations obligatoires.',
    },
    {
      icon: 'storefront',
      title: 'Commerce & franchises',
      description: 'Formation produit, service client, standards de marque et intégration des nouveaux employés.',
    },
    {
      icon: 'local_shipping',
      title: 'Logistique & équipes terrain',
      description: 'Procédures opérationnelles, conformité, checklists et préparation des équipes mobiles.',
    },
    {
      icon: 'school',
      title: 'Éducation & associations',
      description: 'Programmes de formation, ressources, quiz et certificats pour communautés et apprenants.',
    },
    {
      icon: 'hotel',
      title: 'Hôtellerie & services',
      description: 'Standards de service, hygiène, accueil, procédures internes et suivi des compétences.',
    },
    {
      icon: 'support_agent',
      title: 'Technologie & support',
      description: 'Base de connaissances, formation produit, support client et certification interne.',
    },
  ];

  readonly useCases: UseCaseCard[] = [
    {
      icon: 'person_add',
      title: 'Onboarding des nouveaux employés',
      text: 'Créez des parcours cohérents pour accélérer l’intégration et réduire les oublis.',
    },
    {
      icon: 'verified_user',
      title: 'Formation sécurité et conformité',
      text: 'Assignez les modules obligatoires, suivez les retards et conservez les preuves.',
    },
    {
      icon: 'rule',
      title: 'Procédures internes et SOP',
      text: 'Transformez vos procédures en contenus clairs avec quiz, ressources et validation.',
    },
    {
      icon: 'workspace_premium',
      title: 'Certificats et rapports',
      text: 'Gardez un historique lisible des complétions, scores, certificats et validations.',
    },
  ];

  readonly proofPoints = [
    'Plateforme multi-organisations',
    'Assignation par rôle ou équipe',
    'Suivi manager et relances',
    'Quiz, attestations et certificats',
    'Bibliothèque de ressources',
    'Pages publiques multilingues',
  ];

  openDemoDialog(): void {
    this.dialog.open(DemoRequestDialog, {
      width: '100%',
      maxWidth: '720px',
      autoFocus: false,
      panelClass: 'demo-request-dialog-panel',
      backdropClass: 'demo-request-dialog-backdrop',
      data: {
        source: 'industries-page',
      },
    });
  }
}
