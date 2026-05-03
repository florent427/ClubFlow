export type PublicClub = {
  id: string;
  name: string;
  slug: string;
};

export type PublicAnnouncement = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  publishedAt: string | null;
};

export type PublicEvent = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string;
};

export type PublicBlogPostSummary = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  coverImageUrl: string | null;
  publishedAt: string | null;
};

export type PublicBlogPost = PublicBlogPostSummary & {
  body: string;
};

export type PublicShopProduct = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  priceCents: number;
};

export type PublicClubQueryData = { publicClub: PublicClub };
export type PublicAnnouncementsQueryData = {
  publicClubAnnouncements: PublicAnnouncement[];
};
export type PublicEventsQueryData = { publicClubEvents: PublicEvent[] };
export type PublicBlogPostsQueryData = {
  publicClubBlogPosts: PublicBlogPostSummary[];
};
export type PublicBlogPostQueryData = { publicClubBlogPost: PublicBlogPost };
export type PublicShopProductsQueryData = {
  publicClubShopProducts: PublicShopProduct[];
};
