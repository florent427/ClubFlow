export enum ModuleCode {
  MEMBERS = 'MEMBERS',
  FAMILIES = 'FAMILIES',
  PAYMENT = 'PAYMENT',
  PLANNING = 'PLANNING',
  COMMUNICATION = 'COMMUNICATION',
  MESSAGING = 'MESSAGING',
  ACCOUNTING = 'ACCOUNTING',
  SUBSIDIES = 'SUBSIDIES', // spec « Subventions » — code technique court
  SPONSORING = 'SPONSORING',
  WEBSITE = 'WEBSITE',
  BLOG = 'BLOG',
  SHOP = 'SHOP',
  CLUB_LIFE = 'CLUB_LIFE',
  EVENTS = 'EVENTS',
  BOOKING = 'BOOKING',
  /// Projets long-terme (gala, stage international, compétition régionale,
  /// subvention…) avec sections, contributeurs, phases LIVE, comptes-rendus
  /// IA et listes de diffusion. Distinct du module EVENTS (simple bookings).
  PROJECTS = 'PROJECTS',
}
