import { createStorage } from '@clubflow/mobile-shared';

/** Storage admin avec préfixe distinct de l'app membre. */
export const storage = createStorage({ prefix: 'clubflow_admin_' });
