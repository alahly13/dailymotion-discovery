export type { AdvancedVideoFilters, VideoSortOption } from "@/types/filters";

export const defaultAdvancedVideoFilters = {
  keyword: "",
  excludeKeyword: "",
  tags: "",
  minViews: null,
  maxViews: null,
  targetViews: null,
  durationMin: null,
  durationMax: null,
  year: null,
  yearFrom: null,
  yearTo: null,
  dateFrom: null,
  dateTo: null,
  language: "",
  channel: "",
  owner: "",
  hasThumbnail: null,
  hasDescription: null,
  sort: "local_relevance",
  strictMetadataFiltering: false,
} satisfies Required<import("@/types/filters").AdvancedVideoFilters>;
