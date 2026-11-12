export type VideoSortOption =
  | "local_relevance"
  | "newest"
  | "oldest"
  | "highest_views"
  | "least_views"
  | "duration_asc"
  | "duration_desc"
  | "title_asc"
  | "title_desc";

export interface AdvancedVideoFilters {
  keyword?: string;
  excludeKeyword?: string;
  tags?: string;
  minViews?: number | null;
  maxViews?: number | null;
  targetViews?: number | null;
  durationMin?: number | null;
  durationMax?: number | null;
  year?: number | null;
  yearFrom?: number | null;
  yearTo?: number | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  language?: string;
  channel?: string;
  owner?: string;
  hasThumbnail?: boolean | null;
  hasDescription?: boolean | null;
  sort?: VideoSortOption;
  strictMetadataFiltering?: boolean;
}
