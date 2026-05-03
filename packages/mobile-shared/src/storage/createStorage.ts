import AsyncStorage from '@react-native-async-storage/async-storage';

export type AppStorage = {
  prefix: string;
  getToken: () => Promise<string | null>;
  setToken: (token: string) => Promise<void>;
  getClubId: () => Promise<string | null>;
  setClubId: (clubId: string) => Promise<void>;
  getActiveMemberId: () => Promise<string | null>;
  setActiveMemberId: (memberId: string | null) => Promise<void>;
  getContactOnly: () => Promise<boolean>;
  setContactOnly: (v: boolean) => Promise<void>;
  setSession: (token: string, clubId: string) => Promise<void>;
  setContactSession: (token: string, clubId: string) => Promise<void>;
  clearAuth: () => Promise<void>;
  hasSession: () => Promise<boolean>;
  raw: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<void>;
    remove: (key: string) => Promise<void>;
  };
};

/**
 * Crée une instance de storage typée avec un préfixe (ex : "clubflow_member_"
 * ou "clubflow_admin_") pour pouvoir installer plusieurs apps en parallèle
 * sans collision.
 */
export function createStorage({ prefix }: { prefix: string }): AppStorage {
  const k = (suffix: string) => `${prefix}${suffix}`;

  const TOKEN = k('token');
  const CLUB_ID = k('club_id');
  const ACTIVE_MEMBER = k('active_member_id');
  const CONTACT_ONLY = k('contact_only');

  return {
    prefix,
    async getToken() {
      return AsyncStorage.getItem(TOKEN);
    },
    async setToken(token) {
      await AsyncStorage.setItem(TOKEN, token);
    },
    async getClubId() {
      return AsyncStorage.getItem(CLUB_ID);
    },
    async setClubId(clubId) {
      await AsyncStorage.setItem(CLUB_ID, clubId);
    },
    async getActiveMemberId() {
      return AsyncStorage.getItem(ACTIVE_MEMBER);
    },
    async setActiveMemberId(memberId) {
      if (memberId == null) {
        await AsyncStorage.removeItem(ACTIVE_MEMBER);
      } else {
        await AsyncStorage.setItem(ACTIVE_MEMBER, memberId);
      }
    },
    async getContactOnly() {
      const v = await AsyncStorage.getItem(CONTACT_ONLY);
      return v === '1';
    },
    async setContactOnly(v) {
      if (v) {
        await AsyncStorage.setItem(CONTACT_ONLY, '1');
      } else {
        await AsyncStorage.removeItem(CONTACT_ONLY);
      }
    },
    async setSession(token, clubId) {
      await AsyncStorage.multiSet([
        [TOKEN, token],
        [CLUB_ID, clubId],
      ]);
      await AsyncStorage.removeItem(CONTACT_ONLY);
    },
    async setContactSession(token, clubId) {
      await AsyncStorage.multiSet([
        [TOKEN, token],
        [CLUB_ID, clubId],
        [CONTACT_ONLY, '1'],
      ]);
    },
    async clearAuth() {
      await AsyncStorage.multiRemove([
        TOKEN,
        CLUB_ID,
        ACTIVE_MEMBER,
        CONTACT_ONLY,
      ]);
    },
    async hasSession() {
      const [t, c] = await Promise.all([
        AsyncStorage.getItem(TOKEN),
        AsyncStorage.getItem(CLUB_ID),
      ]);
      return !!t && !!c;
    },
    raw: {
      get: (key) => AsyncStorage.getItem(k(key)),
      set: (key, value) => AsyncStorage.setItem(k(key), value),
      remove: (key) => AsyncStorage.removeItem(k(key)),
    },
  };
}
