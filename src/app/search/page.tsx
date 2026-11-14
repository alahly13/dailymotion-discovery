import { redirectToGlobalSearch } from "@/lib/navigation/discovery-redirect";

export default async function SearchPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await redirectToGlobalSearch(props.searchParams);
}
