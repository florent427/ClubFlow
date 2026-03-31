import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ApolloProvider } from '@apollo/client/react';
import { apolloClient } from './lib/apollo';
import { getClubId, getToken, hasMemberSession } from './lib/storage';
import { LoginPage } from './pages/LoginPage';
import { SelectProfilePage } from './pages/SelectProfilePage';
import { HomePage } from './pages/HomePage';

function Protected({ children }: { children: ReactNode }) {
  if (!getToken()) {
    return <Navigate to="/login" replace />;
  }
  if (!getClubId()) {
    return <Navigate to="/select-profile" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <ApolloProvider client={apolloClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/select-profile" element={<SelectProfilePage />} />
          <Route
            path="/"
            element={
              <Protected>
                <HomePage />
              </Protected>
            }
          />
          <Route
            path="*"
            element={
              <Navigate
                to={hasMemberSession() ? '/' : '/login'}
                replace
              />
            }
          />
        </Routes>
      </BrowserRouter>
    </ApolloProvider>
  );
}
