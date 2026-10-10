// GitHub list setup as plain choices (what to show, which repo) and the search text they stand for.

export type Show = "prs" | "issues" | "review" | "project";
export const SHOWS: { value: Show; label: string }[] = [
  { value: "prs", label: "PRs" },
  { value: "issues", label: "Issues" },
  { value: "review", label: "My reviews" },
  { value: "project", label: "Project" },
];
const BASE: Record<Exclude<Show, "project">, string> = { prs: "is:pr is:open", issues: "is:issue is:open", review: "is:pr is:open review-requested:@me" };

/** `repo` "": every repo the token reads. For a project, `repo` is its `owner/number`. */
export const buildQuery = (show: Show, repo: string) => (show === "project" ? `project:${repo}` : `${BASE[show]}${repo ? ` repo:${repo}` : ""}`);

/** undefined when the search was written by hand. */
export function readQuery(query: string): { show: Show; repo: string } | undefined {
  const project = /^project:(\S+)$/.exec(query.trim())?.[1];
  if (project) return { show: "project", repo: project };
  const repo = /(?:^|\s)repo:(\S+)/.exec(query)?.[1] ?? "";
  const show = SHOWS.find((s) => buildQuery(s.value, repo) === query.trim())?.value;
  return show && { show, repo };
}
