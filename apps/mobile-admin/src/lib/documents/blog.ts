import { gql } from '@apollo/client';

export const CLUB_BLOG_POSTS = gql`
  query ClubBlogPosts {
    clubBlogPosts {
      id
      title
      slug
      excerpt
      body
      coverImageUrl
      status
      publishedAt
      createdAt
      updatedAt
    }
  }
`;

export const PUBLISH_BLOG_POST = gql`
  mutation PublishBlogPost($id: ID!) {
    publishClubBlogPost(id: $id) {
      id
      status
      publishedAt
    }
  }
`;

export const ARCHIVE_BLOG_POST = gql`
  mutation ArchiveBlogPost($id: ID!) {
    archiveClubBlogPost(id: $id) {
      id
      status
    }
  }
`;

export const DELETE_BLOG_POST = gql`
  mutation DeleteBlogPost($id: ID!) {
    deleteClubBlogPost(id: $id)
  }
`;
