import { redirectToGlobalSearch } from "@/lib/navigation/discovery-redirect";

export default async function GeneralV1Page(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await redirectToGlobalSearch(props.searchParams, { v: "v1" });
}
