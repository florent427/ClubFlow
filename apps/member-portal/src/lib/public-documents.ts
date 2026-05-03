import { gql } from '@apollo/client';

export const PUBLIC_CLUB = gql`
  query PublicClub($slug: String!) {
    publicClub(slug: $slug) {
      id
      name
      slug
    }
  }
`;

export const PUBLIC_CLUB_ANNOUNCEMENTS = gql`
  query PublicClubAnnouncements($clubSlug: String!, $limit: Int) {
    publicClubAnnouncements(clubSlug: $clubSlug, limit: $limit) {
      id
      title
      body
      pinned
      publishedAt
    }
  }
`;

export const PUBLIC_CLUB_EVENTS = gql`
  query PublicClubEvents($clubSlug: String!, $limit: Int) {
    publicClubEvents(clubSlug: $clubSlug, limit: $limit) {
      id
      title
      description
      location
      startsAt
      endsAt
    }
  }
`;

export const PUBLIC_CLUB_BLOG_POSTS = gql`
  query PublicClubBlogPosts($clubSlug: String!, $limit: Int) {
    publicClubBlogPosts(clubSlug: $clubSlug, limit: $limit) {
      id
      slug
      title
      excerpt
      coverImageUrl
      publishedAt
    }
  }
`;

export const PUBLIC_CLUB_BLOG_POST = gql`
  query PublicClubBlogPost($clubSlug: String!, $postSlug: String!) {
    publicClubBlogPost(clubSlug: $clubSlug, postSlug: $postSlug) {
      id
      slug
      title
      excerpt
      body
      coverImageUrl
      publishedAt
    }
  }
`;

export const PUBLIC_CLUB_SHOP_PRODUCTS = gql`
  query PublicClubShopProducts($clubSlug: String!) {
    publicClubShopProducts(clubSlug: $clubSlug) {
      id
      name
      description
      imageUrl
      priceCents
    }
  }
`;
