import { Linking } from 'react-native';

export function adminAppTargetUrl(): string {
  const v = process.env.EXPO_PUBLIC_ADMIN_APP_URL;
  if (typeof v === 'string' && v.trim()) {
    return v.trim();
  }
  return 'http://localhost:5173/';
}

/** Ouvre l’admin dans le navigateur. Pas de copie JWT dans le localStorage de l’admin (voir README). */
export function openAdminInBrowser(): void {
  const url = adminAppTargetUrl();
  void Linking.openURL(url);
}
