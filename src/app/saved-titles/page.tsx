import type { Metadata } from "next";
import { SavedTitlesWorkspace } from "@/components/saved-titles/saved-titles-workspace";

export const metadata: Metadata = {
  title: "Saved Titles & References | Dailymotion Discovery",
  description:
    "Owner-scoped collection of search terms, Dailymotion URLs, resource IDs, and manual references stored in IndexedDB and Cloudflare R2.",
};

export default function SavedTitlesPage() {
  return <SavedTitlesWorkspace />;
}
