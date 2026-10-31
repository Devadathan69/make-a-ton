import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="description">{description}</p></div>{action}</div>;
}
export function Panel({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return <section className="panel"><div className="panel-heading"><h2>{title}</h2>{aside}</div>{children}</section>;
}
export function Badge({ value }: { value: string }) {
  return <span className={`badge badge-${value.toLowerCase()}`}>{value.replaceAll("_", " ")}</span>;
}
export function ResourceState({ loading, error, empty = false }: { loading: boolean; error: string | null; empty?: boolean }) {
  if (error) return <p className="state state-error" role="alert">{error}</p>;
  if (loading) return <p className="state" role="status">Loading records…</p>;
  if (empty) return <p className="state">No records yet.</p>;
  return null;
}
export function Table({ headings, children }: { headings: string[]; children: ReactNode }) {
  return <div className="table-wrap"><table><thead><tr>{headings.map((heading) => <th scope="col" key={heading}>{heading}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}
export function StarterNote({ owner, children }: { owner: string; children: ReactNode }) {
  if (process.env.NEXT_PUBLIC_DATA_MODE === "http") return null;
  return <div className="starter-note"><span className="note-dot" /><p><strong>{owner}&apos;s workspace.</strong> {children}</p></div>;
}
