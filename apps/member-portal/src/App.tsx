import { ApolloProvider } from '@apollo/client/react';
import { apolloClient } from './lib/apollo';

export default function App() {
  return (
    <ApolloProvider client={apolloClient}>
      <main style={{ padding: '2rem' }}>
        <h1 style={{ fontSize: '1.25rem', margin: 0 }}>ClubFlow</h1>
        <p style={{ marginTop: '0.5rem', color: '#454652' }}>
          Portail membre — scaffold (auth et pages à venir).
        </p>
      </main>
    </ApolloProvider>
  );
}
