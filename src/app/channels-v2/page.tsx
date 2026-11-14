import { redirectToLinkExplorer } from "@/lib/navigation/discovery-redirect";

export default async function ChannelsV2Page(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await redirectToLinkExplorer(props.searchParams, { v: "v2", defaultKind: "channel" });
}
