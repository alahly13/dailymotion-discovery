import { redirectToLinkExplorer } from "@/lib/navigation/discovery-redirect";

export default async function UsersV1Page(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await redirectToLinkExplorer(props.searchParams, { v: "v1", defaultKind: "user" });
}
