import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

type MembersUiContextValue = {
  drawerFamilyId: string | null;
  setDrawerFamilyId: (id: string | null) => void;
  drawerMemberId: string | null;
  setDrawerMemberId: (id: string | null) => void;
};

const MembersUiContext = createContext<MembersUiContextValue | null>(null);

export function MembersUiProvider({ children }: { children: ReactNode }) {
  const [drawerFamilyId, setDrawerFamilyId] = useState<string | null>(null);
  const [drawerMemberId, setDrawerMemberId] = useState<string | null>(null);

  const value = useMemo(
    () => ({
      drawerFamilyId,
      setDrawerFamilyId,
      drawerMemberId,
      setDrawerMemberId,
    }),
    [drawerFamilyId, drawerMemberId],
  );

  return (
    <MembersUiContext.Provider value={value}>
      {children}
    </MembersUiContext.Provider>
  );
}

/** Hook colocalisé au provider (pattern React context). */
// eslint-disable-next-line react-refresh/only-export-components -- export pair avec MembersUiProvider
export function useMembersUi(): MembersUiContextValue {
  const ctx = useContext(MembersUiContext);
  if (!ctx) {
    throw new Error('useMembersUi doit être utilisé sous MembersUiProvider');
  }
  return ctx;
}
