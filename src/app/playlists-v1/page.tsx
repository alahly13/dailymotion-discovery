import { redirectToLinkExplorer } from "@/lib/navigation/discovery-redirect";

export default async function PlaylistsV1Page(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await redirectToLinkExplorer(props.searchParams, { v: "v1", defaultKind: "playlist" });
}
