export type AppRole = 'super_admin' | 'manager' | 'admin' | 'learner' | 'guest';

export function defaultRouteForRole(role: AppRole): string {
  switch (role) {
    case 'super_admin':
      return '/super-admin/dashboard';
    case 'admin':
    case 'manager':
      return '/manager/dashboard';
    case 'learner':
      return '/learner';
    case 'guest':
      return '/guest';
    default:
      return '/login';
  }
}