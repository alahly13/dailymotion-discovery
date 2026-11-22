// Catalog Partition Engine — Advanced Time-Partitioned Catalog Retrieval & Date Boundaries (2026)
//
// What this controls: Time-partitioned catalog generation, calendar boundaries (UTC midnight, leap days,
// month/year boundaries), user-controlled retrieval strategies (Automatic Maximum Coverage, Month-by-Month,
// Year-by-Year, Custom Date Range), bidirectional traversal, adaptive subdivision for saturated query windows,
// and complete scan ledger management for both Dailymotion API V1 and V2.
// Why it exists: Enables exhaustive retrieval of large Dailymotion channel and playlist catalogs
// without hitting provider 1,000-item query limits, preventing data loss, and keeping page pagination
// strictly separated from time-period pagination.
// Scope: Link Explorer (/link-explorer).

import type { ApiVersion } from "@/lib/discovery/types";
import type { DailymotionResourceKind } from "@/lib/platforms/dailymotion/dailymotion-url-analyzer";

export type RetrievalStrategy =
  | "automatic_maximum_coverage" // DEFAULT
  | "month_by_month"
  | "year_by_year"
  | "custom_range";

export type RetrievalDirection =
  | "newest_to_oldest" // DEFAULT
  | "oldest_to_newest";

export type DateDomain =
  | "video-created-at"
  | "playlist-created-at"
  | "playlist-membership-added-at"
  | "unknown";

export type PeriodGranularity =
  | "year"
  | "month"
  | "ten_day"
  | "week"
  | "day"
  | "entire_range";

export type PeriodStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "capped"
  | "failed";

export interface RetrievalPeriod {
  periodId: string;
  parentPeriodId?: string | null;
  childPeriodIds?: string[];
  granularity: PeriodGranularity;
  label: string;
  isUnbounded?: boolean;
  startIso: string | null; // UTC ISO 8601 (e.g. 2024-10-01T00:00:00.000Z) or null if unbounded
  endIso: string | null;   // UTC ISO 8601 (e.g. 2024-10-31T23:59:59.999Z) or null if unbounded
  startUnix: number | null; // Unix timestamp in seconds for V1 API or null if unbounded
  endUnix: number | null;   // Unix timestamp in seconds for V1 API or null if unbounded
  apiVersion: ApiVersion;
  resourceIdentity: string;
  dateDomain?: DateDomain;
  status: PeriodStatus;
  pagesFetched: number;
  rawItemsReceived: number;
  uniqueItemsRetained: number;
  duplicatesDetected: number;
  isCapped: boolean;
  error?: string | null;
  nextPage: number;
  nextCursor?: string | null;
  hasMore: boolean;
  completedAt?: string | null;
}

export interface CustomDateRangeConfig {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  granularity: PeriodGranularity;
}

export interface CatalogPartitionLedger {
  scanId: string;
  apiVersion: ApiVersion;
  resourceType: DailymotionResourceKind;
  resourceId: string;
  canonicalUrl: string;
  strategy: RetrievalStrategy;
  direction: RetrievalDirection;
  customRangeConfig?: CustomDateRangeConfig;
  activePeriodId: string | null;
  periods: RetrievalPeriod[];
  earliestContentDate: string | null;
  latestContentDate: string | null;
  catalogTarget?: "videos" | "playlists";
  dateDomain?: DateDomain;
  totalRawObserved: number;
  totalUniqueRetained: number;
  totalDuplicatesDetected: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Checks if a given year is a leap year in UTC Gregorian calendar.
 */
export function isLeapYear(year: number): boolean {
  if (year % 400 === 0) return true;
  if (year % 100 === 0) return false;
  return year % 4 === 0;
}

/**
 * Returns the exact number of days in a calendar month in UTC (handles Feb leap years).
 */
export function getDaysInUtcMonth(year: number, month: number): number {
  // month is 1-indexed (1 = January, 12 = December)
  if (month < 1 || month > 12) {
    throw new Error(`Invalid month: ${month}. Must be between 1 and 12.`);
  }
  // Passing 0 as day to Date.UTC gives the last day of the previous month
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Generates exact UTC boundaries for a single calendar month.
 */
export function generateMonthPeriod(
  year: number,
  month: number,
  apiVersion: ApiVersion = "v1",
  resourceIdentity: string = "",
  parentPeriodId: string | null = null,
  dateDomain: DateDomain = "video-created-at"
): RetrievalPeriod {
  const mStr = String(month).padStart(2, "0");
  const lastDay = getDaysInUtcMonth(year, month);
  const dStr = String(lastDay).padStart(2, "0");

  const startIso = `${year}-${mStr}-01T00:00:00.000Z`;
  const endIso = `${year}-${mStr}-${dStr}T23:59:59.999Z`;
  const startUnix = Math.floor(new Date(startIso).getTime() / 1000);
  const endUnix = Math.floor(new Date(`${year}-${mStr}-${dStr}T23:59:59.000Z`).getTime() / 1000);

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const labelPrefix = dateDomain === "playlist-created-at" ? "Playlist Creation: " : "";
  const label = `${labelPrefix}${monthNames[month - 1]} ${year}`;
  const periodPrefix = dateDomain === "playlist-created-at" ? "period:playlist_catalog:month" : "period:month";
  const periodId = `${periodPrefix}:${year}-${mStr}:${apiVersion}:${resourceIdentity || "target"}`;

  return {
    periodId,
    parentPeriodId,
    granularity: "month",
    label,
    startIso,
    endIso,
    startUnix,
    endUnix,
    apiVersion,
    resourceIdentity,
    dateDomain,
    status: "pending",
    pagesFetched: 0,
    rawItemsReceived: 0,
    uniqueItemsRetained: 0,
    duplicatesDetected: 0,
    isCapped: false,
    nextPage: 1,
    nextCursor: null,
    hasMore: true,
  };
}

/**
 * Generates exact UTC boundaries for a single calendar year.
 */
export function generateYearPeriod(
  year: number,
  apiVersion: ApiVersion = "v1",
  resourceIdentity: string = "",
  parentPeriodId: string | null = null,
  dateDomain: DateDomain = "video-created-at"
): RetrievalPeriod {
  const startIso = `${year}-01-01T00:00:00.000Z`;
  const endIso = `${year}-12-31T23:59:59.999Z`;
  const startUnix = Math.floor(new Date(startIso).getTime() / 1000);
  const endUnix = Math.floor(new Date(`${year}-12-31T23:59:59.000Z`).getTime() / 1000);
  const labelPrefix = dateDomain === "playlist-created-at" ? "Playlist Creation: " : "";
  const periodPrefix = dateDomain === "playlist-created-at" ? "period:playlist_catalog:year" : "period:year";
  const periodId = `${periodPrefix}:${year}:${apiVersion}:${resourceIdentity || "target"}`;

  return {
    periodId,
    parentPeriodId,
    granularity: "year",
    label: `${labelPrefix}Year ${year}`,
    startIso,
    endIso,
    startUnix,
    endUnix,
    apiVersion,
    resourceIdentity,
    dateDomain,
    status: "pending",
    pagesFetched: 0,
    rawItemsReceived: 0,
    uniqueItemsRetained: 0,
    duplicatesDetected: 0,
    isCapped: false,
    nextPage: 1,
    nextCursor: null,
    hasMore: true,
  };
}

/**
 * Generates an arbitrary custom date period with explicit UTC bounds.
 */
export function generateCustomPeriod(
  startUtc: string,
  endUtc: string,
  granularity: PeriodGranularity,
  label: string,
  apiVersion: ApiVersion = "v1",
  resourceIdentity: string = "",
  parentPeriodId: string | null = null,
  dateDomain: DateDomain = "video-created-at"
): RetrievalPeriod {
  const startDate = new Date(startUtc);
  const endDate = new Date(endUtc);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new Error(`Invalid date values passed to generateCustomPeriod: start="${startUtc}", end="${endUtc}"`);
  }
  if (startDate.getTime() > endDate.getTime()) {
    throw new Error(`Start date (${startUtc}) must be earlier than or equal to end date (${endUtc}).`);
  }

  const startIso = startDate.toISOString();
  const endIso = endDate.toISOString();
  const startUnix = Math.floor(startDate.getTime() / 1000);
  const endUnix = Math.floor(endDate.getTime() / 1000);

  const cleanStart = startIso.substring(0, 10);
  const cleanEnd = endIso.substring(0, 10);
  const prefix = dateDomain === "playlist-created-at" ? "period:playlist_catalog" : "period";
  const periodId = `${prefix}:${granularity}:${cleanStart}_${cleanEnd}:${apiVersion}:${resourceIdentity || "target"}`;

  return {
    periodId,
    parentPeriodId,
    granularity,
    label,
    startIso,
    endIso,
    startUnix,
    endUnix,
    apiVersion,
    resourceIdentity,
    dateDomain,
    status: "pending",
    pagesFetched: 0,
    rawItemsReceived: 0,
    uniqueItemsRetained: 0,
    duplicatesDetected: 0,
    isCapped: false,
    nextPage: 1,
    nextCursor: null,
    hasMore: true,
  };
}

/**
 * Partitions a custom date range into granular periods (Yearly, Monthly, Weekly, Daily, or Entire Range).
 */
export function partitionCustomDateRange(
  startDateStr: string,
  endDateStr: string,
  granularity: PeriodGranularity,
  direction: RetrievalDirection = "newest_to_oldest",
  apiVersion: ApiVersion = "v1",
  resourceIdentity: string = "",
  dateDomain: DateDomain = "video-created-at"
): RetrievalPeriod[] {
  // Normalize strings (YYYY-MM-DD)
  const startNorm = startDateStr.length <= 10 ? `${startDateStr}T00:00:00.000Z` : startDateStr;
  const endNorm = endDateStr.length <= 10 ? `${endDateStr}T23:59:59.999Z` : endDateStr;

  const startD = new Date(startNorm);
  const endD = new Date(endNorm);

  if (Number.isNaN(startD.getTime()) || Number.isNaN(endD.getTime())) {
    throw new Error(`Invalid custom date bounds: "${startDateStr}" -> "${endDateStr}"`);
  }
  if (startD.getTime() > endD.getTime()) {
    throw new Error(`Custom date range invalid: start date (${startDateStr}) is later than end date (${endDateStr}).`);
  }

  const labelPrefix = dateDomain === "playlist-created-at" ? "Playlist Creation: " : "";

  if (granularity === "entire_range") {
    const single = generateCustomPeriod(
      startNorm,
      endNorm,
      "entire_range",
      `${labelPrefix}Range ${startDateStr.substring(0, 10)} to ${endDateStr.substring(0, 10)}`,
      apiVersion,
      resourceIdentity,
      null,
      dateDomain
    );
    return [single];
  }

  const periods: RetrievalPeriod[] = [];

  if (granularity === "year") {
    const startYr = startD.getUTCFullYear();
    const endYr = endD.getUTCFullYear();

    for (let yr = startYr; yr <= endYr; yr++) {
      const yrStartIso = yr === startYr ? startNorm : `${yr}-01-01T00:00:00.000Z`;
      const yrEndIso = yr === endYr ? endNorm : `${yr}-12-31T23:59:59.999Z`;
      periods.push(
        generateCustomPeriod(
          yrStartIso,
          yrEndIso,
          "year",
          `${labelPrefix}Year ${yr}`,
          apiVersion,
          resourceIdentity,
          null,
          dateDomain
        )
      );
    }
  } else if (granularity === "month") {
    let cur = new Date(Date.UTC(startD.getUTCFullYear(), startD.getUTCMonth(), 1, 0, 0, 0, 0));
    const endLimit = new Date(Date.UTC(endD.getUTCFullYear(), endD.getUTCMonth(), 1, 0, 0, 0, 0));

    while (cur.getTime() <= endLimit.getTime()) {
      const yr = cur.getUTCFullYear();
      const m = cur.getUTCMonth() + 1;
      const lastDay = getDaysInUtcMonth(yr, m);

      const mStart = cur.getTime() < startD.getTime() ? startNorm : `${yr}-${String(m).padStart(2, "0")}-01T00:00:00.000Z`;
      const mEndMax = new Date(Date.UTC(yr, m - 1, lastDay, 23, 59, 59, 999)).getTime();
      const mEnd = mEndMax > endD.getTime() ? endNorm : new Date(mEndMax).toISOString();

      const monthNames = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
      ];
      periods.push(
        generateCustomPeriod(
          mStart,
          mEnd,
          "month",
          `${labelPrefix}${monthNames[m - 1]} ${yr}`,
          apiVersion,
          resourceIdentity,
          null,
          dateDomain
        )
      );

      cur = new Date(Date.UTC(yr, m, 1, 0, 0, 0, 0)); // Move to 1st of next month
    }
  } else if (granularity === "week") {
    let curStart = startD.getTime();
    const endTime = endD.getTime();
    let weekIndex = 1;

    while (curStart <= endTime) {
      const curEnd = Math.min(endTime, curStart + 7 * 86_400_000 - 1);
      const sIso = new Date(curStart).toISOString();
      const eIso = new Date(curEnd).toISOString();
      periods.push(
        generateCustomPeriod(
          sIso,
          eIso,
          "week",
          `${labelPrefix}Week ${weekIndex} (${sIso.substring(0, 10)})`,
          apiVersion,
          resourceIdentity,
          null,
          dateDomain
        )
      );
      curStart = curEnd + 1;
      weekIndex++;
    }
  } else if (granularity === "day") {
    let curDay = new Date(Date.UTC(startD.getUTCFullYear(), startD.getUTCMonth(), startD.getUTCDate(), 0, 0, 0, 0));
    const endDayLimit = new Date(Date.UTC(endD.getUTCFullYear(), endD.getUTCMonth(), endD.getUTCDate(), 23, 59, 59, 999));

    while (curDay.getTime() <= endDayLimit.getTime()) {
      const dayStart = curDay.getTime() < startD.getTime() ? startNorm : curDay.toISOString();
      const dayEndMax = new Date(curDay.getTime() + 86_400_000 - 1);
      const dayEnd = dayEndMax.getTime() > endD.getTime() ? endNorm : dayEndMax.toISOString();

      periods.push(
        generateCustomPeriod(
          dayStart,
          dayEnd,
          "day",
          `${labelPrefix}Day ${curDay.toISOString().substring(0, 10)}`,
          apiVersion,
          resourceIdentity,
          null,
          dateDomain
        )
      );

      curDay = new Date(curDay.getTime() + 86_400_000);
    }
  }

  // Sort periods according to selected direction
  if (direction === "newest_to_oldest") {
    periods.sort((a, b) => {
      const aTime = a.startIso ? new Date(a.startIso).getTime() : 0;
      const bTime = b.startIso ? new Date(b.startIso).getTime() : 0;
      return bTime - aTime;
    });
  } else {
    periods.sort((a, b) => {
      const aTime = a.startIso ? new Date(a.startIso).getTime() : 0;
      const bTime = b.startIso ? new Date(b.startIso).getTime() : 0;
      return aTime - bTime;
    });
  }

  return periods;
}

/**
 * Initializes a full set of periods based on selected retrieval strategy, direction, and known catalog dates.
 * Discovers real historical years from actual resource dates — never invents dummy years.
 * For playlists, preserves complete membership ingestion without artificial date partitioning.
 */
export function initializeStrategyPeriods(
  strategy: RetrievalStrategy,
  direction: RetrievalDirection,
  earliestDateIso: string | null,
  latestDateIso: string | null,
  apiVersion: ApiVersion = "v1",
  resourceIdentity: string = "",
  customConfig?: CustomDateRangeConfig,
  resourceType?: DailymotionResourceKind,
  catalogTarget: "videos" | "playlists" = "videos"
): RetrievalPeriod[] {
  const currentUtcYear = new Date().getUTCFullYear();
  const currentUtcMonth = new Date().getUTCMonth() + 1;

  const dateDomain: DateDomain =
    resourceType === "playlist"
      ? "playlist-membership-added-at"
      : catalogTarget === "playlists"
      ? "playlist-created-at"
      : "video-created-at";

  // For a specific playlist: retrieve all membership entries without artificial date partitioning
  if (resourceType === "playlist") {
    const playlistPeriod: RetrievalPeriod = {
      periodId: `period:playlist:${resourceIdentity || "target"}:${apiVersion}`,
      granularity: "entire_range",
      label: "Playlist Membership (Complete Ingestion)",
      isUnbounded: true,
      startIso: null,
      endIso: null,
      startUnix: null,
      endUnix: null,
      apiVersion,
      resourceIdentity,
      dateDomain: "playlist-membership-added-at",
      status: "pending",
      pagesFetched: 0,
      rawItemsReceived: 0,
      uniqueItemsRetained: 0,
      duplicatesDetected: 0,
      isCapped: false,
      nextPage: 1,
      nextCursor: null,
      hasMore: true,
    };
    return [playlistPeriod];
  }

  // Custom date range explicitly specified by user
  if (strategy === "custom_range") {
    if (!customConfig?.startDate || !customConfig?.endDate) {
      const fallbackYear = generateYearPeriod(currentUtcYear, apiVersion, resourceIdentity, null, dateDomain);
      return [fallbackYear];
    }
    return partitionCustomDateRange(
      customConfig.startDate,
      customConfig.endDate,
      customConfig.granularity || "month",
      direction,
      apiVersion,
      resourceIdentity,
      dateDomain
    );
  }

  // Determine real earliest and latest years from verified content dates
  let earliestYear = currentUtcYear;
  if (earliestDateIso) {
    const parsedYr = new Date(earliestDateIso).getUTCFullYear();
    if (!Number.isNaN(parsedYr) && parsedYr >= 2005 && parsedYr <= currentUtcYear) {
      earliestYear = parsedYr;
    }
  }

  let latestYear = currentUtcYear;
  if (latestDateIso) {
    const parsedLatest = new Date(latestDateIso).getUTCFullYear();
    if (!Number.isNaN(parsedLatest) && parsedLatest >= earliestYear) {
      latestYear = Math.min(currentUtcYear, parsedLatest);
    }
  }

  // If no content date has been discovered yet, start with a Primary Discovery Window
  // rather than inventing 20+ years of empty periods. Real years are added progressively
  // as actual records arrive.
  if (!earliestDateIso && (strategy === "automatic_maximum_coverage" || strategy === "year_by_year")) {
    const primaryPeriodId = catalogTarget === "playlists"
      ? `period:primary_playlists:${resourceIdentity || "target"}:${apiVersion}`
      : `period:primary:${resourceIdentity || "target"}:${apiVersion}`;
    const primaryLabel = catalogTarget === "playlists"
      ? "Primary Playlist Discovery Window"
      : "Primary Discovery Window";

    const primaryDiscoveryPeriod: RetrievalPeriod = {
      periodId: primaryPeriodId,
      granularity: "entire_range",
      label: primaryLabel,
      isUnbounded: true,
      startIso: null,
      endIso: null,
      startUnix: null,
      endUnix: null,
      apiVersion,
      resourceIdentity,
      dateDomain,
      status: "pending",
      pagesFetched: 0,
      rawItemsReceived: 0,
      uniqueItemsRetained: 0,
      duplicatesDetected: 0,
      isCapped: false,
      nextPage: 1,
      nextCursor: null,
      hasMore: true,
    };
    return [primaryDiscoveryPeriod];
  }

  if (strategy === "month_by_month") {
    const periods: RetrievalPeriod[] = [];
    const startYr = earliestYear;
    const endYr = latestYear;

    for (let yr = startYr; yr <= endYr; yr++) {
      const minMonth =
        yr === startYr && earliestDateIso
          ? new Date(earliestDateIso).getUTCMonth() + 1
          : 1;
      const maxMonth =
        yr === endYr && latestDateIso
          ? new Date(latestDateIso).getUTCMonth() + 1
          : yr === currentUtcYear
          ? currentUtcMonth
          : 12;

      for (let m = minMonth; m <= maxMonth; m++) {
        periods.push(generateMonthPeriod(yr, m, apiVersion, resourceIdentity, null, dateDomain));
      }
    }

    const sortPeriods = (a: RetrievalPeriod, b: RetrievalPeriod) => {
      if (!a.startIso) return 1;
      if (!b.startIso) return -1;
      return direction === "newest_to_oldest"
        ? new Date(b.startIso).getTime() - new Date(a.startIso).getTime()
        : new Date(a.startIso).getTime() - new Date(b.startIso).getTime();
    };
    periods.sort(sortPeriods);
    return periods;
  }

  // Strategy B: Year by Year (Using only discovered years)
  if (strategy === "year_by_year") {
    const periods: RetrievalPeriod[] = [];
    for (let yr = earliestYear; yr <= latestYear; yr++) {
      periods.push(generateYearPeriod(yr, apiVersion, resourceIdentity, null, dateDomain));
    }

    const sortPeriods = (a: RetrievalPeriod, b: RetrievalPeriod) => {
      if (!a.startIso) return 1;
      if (!b.startIso) return -1;
      return direction === "newest_to_oldest"
        ? new Date(b.startIso).getTime() - new Date(a.startIso).getTime()
        : new Date(a.startIso).getTime() - new Date(b.startIso).getTime();
    };
    periods.sort(sortPeriods);
    return periods;
  }

  // Strategy A: Automatic Maximum Coverage
  const periods: RetrievalPeriod[] = [];
  for (let yr = earliestYear; yr <= latestYear; yr++) {
    periods.push(generateYearPeriod(yr, apiVersion, resourceIdentity, null, dateDomain));
  }

  const sortPeriods = (a: RetrievalPeriod, b: RetrievalPeriod) => {
    if (!a.startIso) return 1;
    if (!b.startIso) return -1;
    return direction === "newest_to_oldest"
      ? new Date(b.startIso).getTime() - new Date(a.startIso).getTime()
      : new Date(a.startIso).getTime() - new Date(b.startIso).getTime();
  };
  periods.sort(sortPeriods);
  return periods;
}

/**
 * Adaptive Subdivision Engine (Section 5):
 * When a period hits the provider ceiling (1,000 items in V1 or saturated page count):
 * - Year -> Subdivides into 12 calendar Months
 * - Month -> Subdivides into three 10-day intervals (1-10, 11-20, 21-end)
 * - 10-day -> Subdivides into Daily intervals
 * Bounded recursion prevents infinite splitting.
 */
export function subdivideSaturatedPeriod(
  period: RetrievalPeriod,
  direction: RetrievalDirection = "newest_to_oldest"
): RetrievalPeriod[] {
  if (!period.startIso || !period.endIso || period.granularity === "entire_range") {
    return [];
  }
  const startDate = new Date(period.startIso);
  const endDate = new Date(period.endIso);
  const yr = startDate.getUTCFullYear();
  const apiVersion = period.apiVersion;
  const resId = period.resourceIdentity;
  const dateDomain = period.dateDomain || "video-created-at";

  const childPeriods: RetrievalPeriod[] = [];

  if (period.granularity === "year") {
    // Subdivide Year into 12 calendar Months
    for (let m = 1; m <= 12; m++) {
      const monthPeriod = generateMonthPeriod(yr, m, apiVersion, resId, period.periodId, dateDomain);
      childPeriods.push(monthPeriod);
    }
  } else if (period.granularity === "month") {
    // Subdivide Month into three intervals: 1-10, 11-20, 21-lastDay
    const m = startDate.getUTCMonth() + 1;
    const mStr = String(m).padStart(2, "0");
    const lastDay = getDaysInUtcMonth(yr, m);

    // Interval 1: 1 to 10
    const int1 = generateCustomPeriod(
      `${yr}-${mStr}-01T00:00:00.000Z`,
      `${yr}-${mStr}-10T23:59:59.999Z`,
      "ten_day",
      `${period.label} (Days 1–10)`,
      apiVersion,
      resId,
      period.periodId,
      dateDomain
    );
    // Interval 2: 11 to 20
    const int2 = generateCustomPeriod(
      `${yr}-${mStr}-11T00:00:00.000Z`,
      `${yr}-${mStr}-20T23:59:59.999Z`,
      "ten_day",
      `${period.label} (Days 11–20)`,
      apiVersion,
      resId,
      period.periodId,
      dateDomain
    );
    // Interval 3: 21 to lastDay
    const int3 = generateCustomPeriod(
      `${yr}-${mStr}-21T00:00:00.000Z`,
      `${yr}-${mStr}-${String(lastDay).padStart(2, "0")}T23:59:59.999Z`,
      "ten_day",
      `${period.label} (Days 21–${lastDay})`,
      apiVersion,
      resId,
      period.periodId,
      dateDomain
    );

    childPeriods.push(int1, int2, int3);
  } else if (period.granularity === "ten_day") {
    // Subdivide into daily intervals
    const startDay = startDate.getUTCDate();
    const endDay = endDate.getUTCDate();
    const m = startDate.getUTCMonth() + 1;
    const mStr = String(m).padStart(2, "0");

    for (let d = startDay; d <= endDay; d++) {
      const dStr = String(d).padStart(2, "0");
      const dayPeriod = generateCustomPeriod(
        `${yr}-${mStr}-${dStr}T00:00:00.000Z`,
        `${yr}-${mStr}-${dStr}T23:59:59.999Z`,
        "day",
        `${period.label} (Day ${d})`,
        apiVersion,
        resId,
        period.periodId,
        dateDomain
      );
      childPeriods.push(dayPeriod);
    }
  }

  // Sort child periods according to the ledger's retrieval direction
  if (direction === "newest_to_oldest") {
    childPeriods.sort((a, b) => {
      const aTime = a.startIso ? new Date(a.startIso).getTime() : 0;
      const bTime = b.startIso ? new Date(b.startIso).getTime() : 0;
      return bTime - aTime;
    });
  } else {
    childPeriods.sort((a, b) => {
      const aTime = a.startIso ? new Date(a.startIso).getTime() : 0;
      const bTime = b.startIso ? new Date(b.startIso).getTime() : 0;
      return aTime - bTime;
    });
  }

  return childPeriods;
}

/**
 * Creates a brand new CatalogPartitionLedger.
 */
export function createPartitionLedger(params: {
  scanId: string;
  apiVersion: ApiVersion;
  resourceType: DailymotionResourceKind;
  resourceId: string;
  canonicalUrl: string;
  strategy?: RetrievalStrategy;
  direction?: RetrievalDirection;
  earliestContentDate?: string | null;
  latestContentDate?: string | null;
  customConfig?: CustomDateRangeConfig;
  catalogTarget?: "videos" | "playlists";
}): CatalogPartitionLedger {
  const strategy = params.strategy || "automatic_maximum_coverage";
  const direction = params.direction || "newest_to_oldest";
  const catalogTarget = params.catalogTarget || (params.resourceType === "playlist" ? "videos" : "videos");
  const dateDomain: DateDomain =
    params.resourceType === "playlist"
      ? "playlist-membership-added-at"
      : catalogTarget === "playlists"
      ? "playlist-created-at"
      : "video-created-at";

  const initialPeriods = initializeStrategyPeriods(
    strategy,
    direction,
    params.earliestContentDate || null,
    params.latestContentDate || null,
    params.apiVersion,
    params.resourceId,
    params.customConfig,
    params.resourceType,
    catalogTarget
  );

  const activePeriodId = initialPeriods[0]?.periodId || null;

  return {
    scanId: params.scanId,
    apiVersion: params.apiVersion,
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    canonicalUrl: params.canonicalUrl,
    strategy,
    direction,
    customRangeConfig: params.customConfig,
    activePeriodId,
    periods: initialPeriods,
    earliestContentDate: params.earliestContentDate || null,
    latestContentDate: params.latestContentDate || null,
    catalogTarget,
    dateDomain,
    totalRawObserved: 0,
    totalUniqueRetained: 0,
    totalDuplicatesDetected: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Identifies the next unprocessed period in the ledger.
 */
export function getNextPendingPeriod(ledger: CatalogPartitionLedger): RetrievalPeriod | null {
  // First, check if the current active period is incomplete
  if (ledger.activePeriodId) {
    const active = ledger.periods.find((p) => p.periodId === ledger.activePeriodId);
    if (active && (active.status === "pending" || active.status === "in_progress") && active.hasMore) {
      return active;
    }

    // Search forward from current active period index to preserve natural chronological traversal
    const activeIdx = ledger.periods.findIndex((p) => p.periodId === ledger.activePeriodId);
    if (activeIdx !== -1) {
      for (let i = activeIdx + 1; i < ledger.periods.length; i++) {
        const p = ledger.periods[i];
        if (p.isCapped && p.childPeriodIds && p.childPeriodIds.length > 0) continue;
        if (p.status === "pending" || (p.status === "in_progress" && p.hasMore)) {
          return p;
        }
      }
    }
  }

  // Fallback: look for any period that is pending or in_progress and not a capped parent (with children)
  const candidate = ledger.periods.find((p) => {
    if (p.isCapped && p.childPeriodIds && p.childPeriodIds.length > 0) {
      return false; // Parent was split; its children take precedence
    }
    return p.status === "pending" || (p.status === "in_progress" && p.hasMore);
  });

  return candidate || null;
}

/**
 * Returns overall completion status for the entire partition ledger.
 */
export function isLedgerFullyCompleted(ledger: CatalogPartitionLedger): boolean {
  if (ledger.periods.length === 0) return false;
  return ledger.periods.every((p) => {
    // If period was split into children, it is complete only if all children are complete
    if (p.childPeriodIds && p.childPeriodIds.length > 0) {
      const children = ledger.periods.filter((c) => p.childPeriodIds?.includes(c.periodId));
      return children.length > 0 && children.every((c) => c.status === "completed");
    }
    return p.status === "completed";
  });
}
