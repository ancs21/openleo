// GitHub list rules: what a list's source may be, and how GitHub's answers become rows.
import type { GithubRow, ListSource } from "../../shared/types";

export const MAX_ROWS = 100;
const MAX_QUERY = 500;

/** `project:owner/12`: a GitHub project board instead of a search. */
export const PROJECT = /^project:([\w-]+)\/(\d+)$/;

export function githubSource(raw: unknown): ListSource | undefined {
  const r = raw as { kind?: unknown; query?: unknown } | null;
  const query = typeof r?.query === "string" ? r.query.trim().slice(0, MAX_QUERY) : "";
  return r?.kind === "github" && query ? { kind: "github", query } : undefined;
}

/** GitHub's state in plain words: a pull request is open, draft, merged or closed (not merged); an issue is open or done. */
function statusOf(n: any) {
  if (n.state === "MERGED") return "merged";
  if (n.state === "CLOSED") return n.__typename === "PullRequest" ? "closed" : "done";
  return n.isDraft ? "draft" : "open";
}

/** Search results as rows; anything malformed is left out. */
export function rowsOf(json: any): GithubRow[] {
  const nodes = json?.data?.search?.nodes;
  if (!Array.isArray(nodes)) return [];
  return nodes.flatMap((n) => {
    const repo = n?.repository?.nameWithOwner;
    if (typeof n?.number !== "number" || typeof n.title !== "string" || typeof n.url !== "string" || typeof repo !== "string") return [];
    const ref = `${repo}#${n.number}`;
    return [{ key: `github:${ref}`, ref, title: n.title.slice(0, 300), url: n.url, status: statusOf(n), ...(typeof n.author?.login === "string" ? { by: n.author.login } : {}) }];
  });
}

/** A project's items as rows, with the project's own Status (Todo, In Progress…). Drafts link to the project. */
export function projectRowsOf(json: any): GithubRow[] {
  const project = json?.data?.owner?.projectV2;
  if (!project) throw new Error("No such project, or this token can't see it");
  return (project.items?.nodes ?? []).flatMap((n: any) => {
    const c = n?.content, status = typeof n?.status?.name === "string" ? n.status.name : "No status";
    if (c?.__typename === "DraftIssue" && typeof c.title === "string") {
      return [{ key: `github:project-item:${n.id}`, ref: "Draft", title: c.title.slice(0, 300), url: project.url, status }];
    }
    const [row] = rowsOf({ data: { search: { nodes: [c] } } });
    return row ? [{ ...row, status }] : [];
  });
}
