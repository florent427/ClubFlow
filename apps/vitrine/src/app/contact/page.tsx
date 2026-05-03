import type { Metadata } from 'next';
import { VitrinePageShell } from '@/components/VitrinePageShell';
import { buildPageMetadata } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata({
    pageSlug: 'contact',
    fallbackTitle: 'Contact',
    fallbackDescription: 'Coordonnées, adresse et formulaire de contact.',
  });
}

export default function ContactPage() {
  return <VitrinePageShell slug="contact" />;
}
