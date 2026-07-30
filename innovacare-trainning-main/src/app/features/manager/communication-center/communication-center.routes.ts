import { Routes } from '@angular/router';

export const COMMUNICATION_CENTER_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./communication-center.page').then((m) => m.CommunicationCenterPage),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', loadComponent: () => import('./pages/communication-dashboard.page').then((m) => m.CommunicationDashboardPage) },
      { path: 'newsletters', loadComponent: () => import('./pages/newsletter-builder.page').then((m) => m.NewsletterBuilderPage) },
      { path: 'campaigns', loadComponent: () => import('./pages/campaigns.page').then((m) => m.CampaignsPage) },
      { path: 'audience-builder', loadComponent: () => import('./pages/audience-builder.page').then((m) => m.AudienceBuilderPage) },
      { path: 'ai-content-studio', loadComponent: () => import('./pages/ai-content-studio.page').then((m) => m.AiContentStudioPage) },
      { path: 'approval-queue', loadComponent: () => import('./pages/approval-queue.page').then((m) => m.ApprovalQueuePage) },
      { path: 'analytics', loadComponent: () => import('./pages/analytics.page').then((m) => m.AnalyticsPage) },
      { path: '**', redirectTo: 'dashboard' },
    ],
  },
];