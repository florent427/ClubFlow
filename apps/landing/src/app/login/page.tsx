import { redirect } from 'next/navigation';

export default function LoginPage() {
  const adminUrl = process.env.LANDING_ADMIN_URL ?? 'http://localhost:5173';
  redirect(`${adminUrl}/login`);
}
