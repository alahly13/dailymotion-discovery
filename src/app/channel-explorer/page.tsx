import { redirectToLinkExplorer } from "@/lib/navigation/discovery-redirect";

export default async function ChannelExplorerPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await redirectToLinkExplorer(props.searchParams, { defaultKind: "channel" });
}
