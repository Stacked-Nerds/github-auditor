"use client";

import { useAuditorStore } from "@/lib/store";
import type { RepoAudit, BranchInfo, AccessRecord, MemberRecord } from "@/lib/store";
import ExecutiveSummary from "./ExecutiveSummary";
import OrgTeamsTab from "./OrgTeamsTab";
import { ThemeToggle } from "@/components/theme-toggle";
import { exportToCSV } from "@/lib/exportUtils";
import {
  ShieldCheck,
  GitFork,
  Archive,
  Lock,
  Globe,
  Search,
  Loader2,
  AlertCircle,
  FileCheck,
  FileWarning,
  ShieldAlert,
  ShieldOff,
  Eye,
  EyeOff,
  GitBranch,
  ExternalLink,
  Users,
  Star,
  CheckCircle2,
  XCircle,
  SlidersHorizontal,
  X,
  Play,
  Square,
  Clock,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  BarChart3,
  UsersRound,
  RotateCcw,
  Mail,
  AlertTriangle,
  Download,
} from "lucide-react";
import { type FormEvent, useState, useRef, useEffect, useMemo } from "react";

/* ================================================================== */
/*  SHARED COMPONENTS                                                  */
/* ================================================================== */

function Badge({
  children,
  variant,
}: {
  children: React.ReactNode;
  variant: "green" | "yellow" | "red" | "blue" | "gray" | "orange";
}) {
  const colors = {
    green: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
    yellow: "bg-amber-500/15 text-amber-400 border-amber-500/25",
    red: "bg-red-500/15 text-red-400 border-red-500/25",
    blue: "bg-sky-500/15 text-sky-400 border-sky-500/25",
    gray: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25",
    orange: "bg-orange-500/15 text-orange-400 border-orange-500/25",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${colors[variant]}`}
    >
      {children}
    </span>
  );
}

function KpiCard({
  label, value, icon: Icon, color,
}: {
  label: string; value: number; icon: React.ElementType; color: string;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 transition-all duration-300 hover:border-[var(--accent)] hover:shadow-lg hover:shadow-indigo-500/10">
      <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-10 blur-2xl transition-opacity duration-300 group-hover:opacity-25" style={{ backgroundColor: color }} />
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${color}18`, color }}>
          <Icon size={20} />
        </div>
        <p className="text-sm text-[var(--text-secondary)]">{label}</p>
      </div>
      <p className="mt-4 text-4xl font-bold tracking-tight">{value}</p>
    </div>
  );
}

/* ---- Progress Bar ---- */
function ProgressBar({ scanning, processed, total, currentName }: { scanning: boolean; processed: number; total: number; currentName: string }) {
  if (!scanning) return null;
  const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
  return (
    <div className="mb-5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="flex items-center gap-2 text-[var(--text-secondary)]">
          <Loader2 size={14} className="animate-spin" />
          Scanning: <span className="font-semibold text-[var(--text-primary)]">{currentName || "Initializing…"}</span>
        </span>
        <span className="font-mono text-[var(--text-muted)]">{processed} / {total} ({pct}%)</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--border)]">
        <div className="h-full rounded-full bg-[var(--accent)] transition-all duration-300 ease-out" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* ---- Skeleton Row ---- */
function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr className="border-b border-[var(--border)]">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3.5"><div className="h-4 w-20 animate-pulse rounded bg-[var(--border)]" /></td>
      ))}
    </tr>
  );
}

/* ---- Pagination Footer ---- */
const ROWS_PER_PAGE_OPTIONS = [15, 50, 100];

function PaginationFooter({
  currentPage, totalPages, totalItems, rowsPerPage, onPageChange, onRowsPerPageChange,
}: {
  currentPage: number; totalPages: number; totalItems: number; rowsPerPage: number;
  onPageChange: (page: number) => void; onRowsPerPageChange: (rpp: number) => void;
}) {
  if (totalItems === 0) return null;
  const start = (currentPage - 1) * rowsPerPage + 1;
  const end = Math.min(currentPage * rowsPerPage, totalItems);

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
      <span className="text-xs text-[var(--text-muted)]">
        Showing <span className="font-medium text-[var(--text-secondary)]">{start}</span> to{" "}
        <span className="font-medium text-[var(--text-secondary)]">{end}</span> of{" "}
        <span className="font-medium text-[var(--text-secondary)]">{totalItems}</span> results
      </span>
      <div className="flex items-center gap-2">
        <label htmlFor="rpp" className="text-xs text-[var(--text-muted)]">Rows per page</label>
        <select id="rpp" value={rowsPerPage} onChange={(e) => onRowsPerPageChange(Number(e.target.value))}
          className="rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1 text-xs text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none">
          {ROWS_PER_PAGE_OPTIONS.map((n) => (<option key={n} value={n}>{n}</option>))}
        </select>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="mr-2 text-xs text-[var(--text-muted)]">Page {currentPage} of {totalPages || 1}</span>
        <button type="button" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)}
          className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-input)] p-1.5 text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40">
          <ChevronLeft size={16} />
        </button>
        <button type="button" disabled={currentPage >= totalPages || totalItems === 0} onClick={() => onPageChange(currentPage + 1)}
          className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-input)] p-1.5 text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40">
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

/* ---- usePagination hook ---- */
function usePagination<T>(data: T[], searchKey?: string) {
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(15);
  const prevSearch = useRef(searchKey);

  useEffect(() => {
    if (searchKey !== prevSearch.current) { setCurrentPage(1); prevSearch.current = searchKey; }
  }, [searchKey]);

  const totalPages = Math.max(1, Math.ceil(data.length / rowsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  if (safePage !== currentPage) setCurrentPage(safePage);

  const paginated = useMemo(
    () => data.slice((safePage - 1) * rowsPerPage, safePage * rowsPerPage),
    [data, safePage, rowsPerPage]
  );
  const handleRowsPerPageChange = (rpp: number) => { setRowsPerPage(rpp); setCurrentPage(1); };
  return { currentPage: safePage, totalPages, rowsPerPage, paginated, setCurrentPage, handleRowsPerPageChange };
}

/* ================================================================== */
/*  REPO AUDIT — Column definitions & picker                          */
/* ================================================================== */

type ColumnKey =
  | "repository" | "owner" | "description" | "topics"
  | "private" | "archived" | "default_branch" | "language"
  | "stars" | "forks" | "admin_count" | "admin_names"
  | "has_codeowners" | "has_required_reviewers" | "allows_direct_push"
  | "url" | "branch_count";

interface ColumnDef { key: ColumnKey; label: string; defaultVisible: boolean; alwaysVisible?: boolean; }

const ALL_COLUMNS: ColumnDef[] = [
  { key: "repository", label: "Repository", defaultVisible: true, alwaysVisible: true },
  { key: "owner", label: "Owner", defaultVisible: false },
  { key: "description", label: "Description", defaultVisible: false },
  { key: "topics", label: "Topics", defaultVisible: false },
  { key: "private", label: "Visibility", defaultVisible: true },
  { key: "archived", label: "Archived", defaultVisible: false },
  { key: "default_branch", label: "Default Branch", defaultVisible: true },
  { key: "language", label: "Language", defaultVisible: false },
  { key: "stars", label: "Stars", defaultVisible: false },
  { key: "forks", label: "Forks", defaultVisible: false },
  { key: "admin_count", label: "Admin Count", defaultVisible: true },
  { key: "admin_names", label: "Admin Names", defaultVisible: false },
  { key: "has_codeowners", label: "CODEOWNERS", defaultVisible: true },
  { key: "has_required_reviewers", label: "Required Reviewers", defaultVisible: true },
  { key: "allows_direct_push", label: "Direct Push", defaultVisible: true },
  { key: "url", label: "URL", defaultVisible: false },
  { key: "branch_count", label: "Branches", defaultVisible: false },
];

const DEFAULT_VISIBLE = new Set(ALL_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key));

/* ---- Column Picker ---- */
function ColumnPicker({ visible, onToggle }: { visible: Set<ColumnKey>; onToggle: (key: ColumnKey) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handleClick(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);
  const toggleable = ALL_COLUMNS.filter((c) => !c.alwaysVisible);

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]">
        <SlidersHorizontal size={14} /> Columns
        <span className="rounded-md bg-[var(--accent)]/20 px-1.5 py-0.5 text-[10px] font-bold text-[var(--accent)]">{visible.size}</span>
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-56 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-2 shadow-xl shadow-black/30">
          <div className="mb-2 flex items-center justify-between px-2 pt-1">
            <span className="text-xs font-semibold text-[var(--text-secondary)]">Toggle Columns</span>
            <button type="button" onClick={() => setOpen(false)} className="rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X size={14} /></button>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {toggleable.map((col) => (
              <label key={col.key} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-input)]">
                <input type="checkbox" checked={visible.has(col.key)} onChange={() => onToggle(col.key)}
                  className="h-3.5 w-3.5 rounded border-[var(--border)] bg-[var(--bg-input)] accent-[var(--accent)]" />
                {col.label}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- Audit Cell renderer ---- */
function AuditCell({ col, repo }: { col: ColumnKey; repo: RepoAudit }) {
  const muted = <span className="text-[var(--text-muted)]">—</span>;
  switch (col) {
    case "repository": return <span className="font-semibold text-[var(--text-primary)]">{repo.repository}</span>;
    case "owner": return <span className="text-[var(--text-secondary)]">{repo.owner}</span>;
    case "description": return <span className="block max-w-xs truncate text-[var(--text-secondary)]" title={repo.description ?? ""}>{repo.description || muted}</span>;
    case "topics": return <span className="block max-w-[12rem] truncate text-[var(--text-secondary)]" title={repo.topics}>{repo.topics || muted}</span>;
    case "private": return repo.private ? <Badge variant="blue"><EyeOff size={12} /> Private</Badge> : <Badge variant="gray"><Eye size={12} /> Public</Badge>;
    case "archived": return repo.archived ? <Badge variant="yellow"><Archive size={12} /> Archived</Badge> : <Badge variant="green"><CheckCircle2 size={12} /> Active</Badge>;
    case "default_branch": return <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]"><GitBranch size={14} /> {repo.default_branch}</span>;
    case "language": return <span className="text-[var(--text-secondary)]">{repo.language || muted}</span>;
    case "stars": return <span className="inline-flex items-center gap-1 text-[var(--text-secondary)]"><Star size={14} className="text-amber-400" /> {repo.stars}</span>;
    case "forks": return <span className="inline-flex items-center gap-1 text-[var(--text-secondary)]"><GitFork size={14} /> {repo.forks}</span>;
    case "admin_count": return <span className="inline-flex items-center gap-1 text-[var(--text-secondary)]"><Users size={14} /> {repo.admin_count}</span>;
    case "admin_names": return <span className="block max-w-[12rem] truncate text-[var(--text-secondary)]" title={repo.admin_names}>{repo.admin_names || muted}</span>;
    case "has_codeowners": return repo.has_codeowners ? <Badge variant="green"><FileCheck size={12} /> Configured</Badge> : <Badge variant="yellow"><FileWarning size={12} /> Missing</Badge>;
    case "has_required_reviewers": return repo.has_required_reviewers ? <Badge variant="green"><CheckCircle2 size={12} /> Enabled</Badge> : <Badge variant="yellow"><XCircle size={12} /> Missing</Badge>;
    case "allows_direct_push": return repo.allows_direct_push ? <Badge variant="red"><ShieldOff size={12} /> Allowed — High Risk</Badge> : <Badge variant="green"><ShieldAlert size={12} /> Blocked</Badge>;
    case "url": return <a href={repo.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[var(--accent)] transition-colors hover:text-[var(--accent-hover)]"><ExternalLink size={15} /></a>;
    case "branch_count": return <span className="text-[var(--text-secondary)]">{repo.branch_count}</span>;
  }
}

/* ---- Permission Badge ---- */
function PermissionBadge({ level }: { level: string }) {
  switch (level) {
    case "admin": return <Badge variant="red"><ShieldAlert size={12} /> Admin</Badge>;
    case "maintain": return <Badge variant="orange"><ShieldCheck size={12} /> Maintain</Badge>;
    case "write": return <Badge variant="yellow"><FileCheck size={12} /> Write</Badge>;
    case "read": return <Badge variant="blue"><Eye size={12} /> Read</Badge>;
    default: return <Badge variant="gray">{level}</Badge>;
  }
}

/* ---- Personal email domains ---- */
const PERSONAL_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "live.com",
  "aol.com", "icloud.com", "me.com", "mail.com", "protonmail.com",
  "proton.me", "ymail.com", "gmx.com", "gmx.net", "zoho.com",
]);

function isPersonalEmail(email: string): boolean {
  if (!email || email === "N/A") return false;
  const domain = email.split("@")[1]?.toLowerCase();
  return domain ? PERSONAL_DOMAINS.has(domain) : false;
}

/* ================================================================== */
/*  BRANCHES TAB                                                       */
/* ================================================================== */

function BranchesTab() {
  const { branchResults, branchScanning, branchTotal, branchProcessed, branchCurrentRepo, branchError, startBranchScan, stopBranchScan, org, token } = useAuditorStore();
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => branchResults.filter((b) => b.repository.toLowerCase().includes(search.toLowerCase()) || b.branch_name.toLowerCase().includes(search.toLowerCase())), [branchResults, search]);
  const { currentPage, totalPages, rowsPerPage, paginated, setCurrentPage, handleRowsPerPageChange } = usePagination(filtered, search);
  const hasCredentials = org.trim() && token.trim();

  return (
    <section>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold text-[var(--text-secondary)]">Branch Audit</h2>
        {!branchScanning ? (
          <button type="button" onClick={startBranchScan} disabled={!hasCredentials} className="flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"><Play size={14} /> Scan Branches</button>
        ) : (
          <button type="button" onClick={stopBranchScan} className="flex items-center gap-2 rounded-xl bg-red-500/80 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-600"><Square size={14} /> Stop</button>
        )}
        {branchResults.length > 0 && <span className="text-xs text-[var(--text-muted)]">{filtered.length} branches</span>}
        <div className="ml-auto" />
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input type="text" placeholder="Filter by repo or branch…" value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-56 rounded-xl border border-[var(--border)] bg-[var(--bg-input)] py-2 pl-8 pr-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none transition-colors" />
        </div>
        <button type="button" onClick={() => exportToCSV(filtered, "branch-audit")} disabled={branchScanning || filtered.length === 0}
          className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)] disabled:opacity-50 disabled:cursor-not-allowed">
          <Download size={14} />
        </button>
      </div>
      {branchError && (<div className="mb-5 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400"><AlertCircle size={18} className="mt-0.5 shrink-0" /><p>{branchError}</p></div>)}
      <ProgressBar scanning={branchScanning} processed={branchProcessed} total={branchTotal} currentName={branchCurrentRepo} />

      {!branchScanning && branchResults.length === 0 && !branchError && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] py-16">
          <GitBranch size={40} className="mb-3 text-[var(--text-muted)]" />
          <p className="text-sm text-[var(--text-muted)]">{hasCredentials ? "Click 'Scan Branches' to audit all repository branches." : "Enter your organization details and run a Scan first."}</p>
        </div>
      )}

      {(branchResults.length > 0 || branchScanning) && (
        <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--bg-input)]">
                  <th className="sticky left-0 z-10 whitespace-nowrap bg-[var(--bg-input)] px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Repository</th>
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Branch Name</th>
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Last Commit Date</th>
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Age (Days)</th>
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Protected</th>
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 && branchScanning
                  ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} cols={5} />)
                  : paginated.map((b, i) => {
                    const isStale = b.age_days !== null && b.age_days > 90;
                    return (
                      <tr key={`${b.repository}-${b.branch_name}-${i}`} className={`group border-b border-[var(--border)] transition-colors hover:bg-slate-50 dark:hover:bg-[#1a1a26] ${isStale ? "bg-red-500/[0.04]" : ""}`}>
                        <td className="sticky left-0 z-10 whitespace-nowrap bg-[var(--bg-card)] px-4 py-3 font-semibold text-[var(--text-primary)] group-hover:bg-slate-50 dark:group-hover:bg-[#1a1a26]">{b.repository}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-[var(--text-secondary)]"><span className="inline-flex items-center gap-1.5"><GitBranch size={14} /> {b.branch_name}</span></td>
                        <td className="whitespace-nowrap px-4 py-3 text-[var(--text-secondary)]">{b.last_commit_date ?? <span className="text-[var(--text-muted)]">—</span>}</td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {b.age_days !== null ? (isStale ? <Badge variant="red"><Clock size={12} /> {b.age_days}d — Stale</Badge> : <span className="text-[var(--text-secondary)]">{b.age_days}d</span>) : <span className="text-[var(--text-muted)]">—</span>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {b.protected ? <Badge variant="green"><CheckCircle2 size={12} /> Yes</Badge> : <Badge variant="red"><XCircle size={12} /> No</Badge>}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          <PaginationFooter currentPage={currentPage} totalPages={totalPages} totalItems={filtered.length} rowsPerPage={rowsPerPage} onPageChange={setCurrentPage} onRowsPerPageChange={handleRowsPerPageChange} />
        </div>
      )}
    </section>
  );
}

/* ================================================================== */
/*  USER AUDIT TAB                                                     */
/* ================================================================== */

function UserAuditTab() {
  const { accessResults, accessScanning, accessTotal, accessProcessed, accessCurrentRepo, accessError, startAccessScan, stopAccessScan, org, token } = useAuditorStore();
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => accessResults.filter((r) => r.repository.toLowerCase().includes(search.toLowerCase()) || r.username.toLowerCase().includes(search.toLowerCase())), [accessResults, search]);
  const { currentPage, totalPages, rowsPerPage, paginated, setCurrentPage, handleRowsPerPageChange } = usePagination(filtered, search);
  const hasCredentials = org.trim() && token.trim();

  return (
    <section>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold text-[var(--text-secondary)]">User Access Audit</h2>
        {!accessScanning ? (
          <button type="button" onClick={startAccessScan} disabled={!hasCredentials} className="flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"><Play size={14} /> Scan User Access</button>
        ) : (
          <button type="button" onClick={stopAccessScan} className="flex items-center gap-2 rounded-xl bg-red-500/80 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-600"><Square size={14} /> Stop</button>
        )}
        {accessResults.length > 0 && <span className="text-xs text-[var(--text-muted)]">{filtered.length} records</span>}
        <div className="ml-auto" />
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input type="text" placeholder="Filter by repo or user…" value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-56 rounded-xl border border-[var(--border)] bg-[var(--bg-input)] py-2 pl-8 pr-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none transition-colors" />
        </div>
        <button type="button" onClick={() => exportToCSV(filtered, "user-access-audit")} disabled={accessScanning || filtered.length === 0}
          className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)] disabled:opacity-50 disabled:cursor-not-allowed">
          <Download size={14} />
        </button>
      </div>
      {accessError && (<div className="mb-5 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400"><AlertCircle size={18} className="mt-0.5 shrink-0" /><p>{accessError}</p></div>)}
      <ProgressBar scanning={accessScanning} processed={accessProcessed} total={accessTotal} currentName={accessCurrentRepo} />

      {!accessScanning && accessResults.length === 0 && !accessError && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] py-16">
          <Users size={40} className="mb-3 text-[var(--text-muted)]" />
          <p className="text-sm text-[var(--text-muted)]">{hasCredentials ? "Click 'Scan User Access' to map user permissions across all repositories." : "Enter your organization details and run a Scan first."}</p>
        </div>
      )}

      {(accessResults.length > 0 || accessScanning) && (
        <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--bg-input)]">
                  <th className="sticky left-0 z-10 whitespace-nowrap bg-[var(--bg-input)] px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Repository</th>
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Username</th>
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Permission</th>
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 && accessScanning
                  ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} cols={3} />)
                  : paginated.map((r, i) => (
                    <tr key={`${r.repository}-${r.username}-${i}`} className="group border-b border-[var(--border)] transition-colors hover:bg-slate-50 dark:hover:bg-[#1a1a26]">
                      <td className="sticky left-0 z-10 whitespace-nowrap bg-[var(--bg-card)] px-4 py-3 font-semibold text-[var(--text-primary)] group-hover:bg-slate-50 dark:group-hover:bg-[#1a1a26]">{r.repository}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-[var(--text-secondary)]"><span className="inline-flex items-center gap-1.5"><UserCheck size={14} /> {r.username}</span></td>
                      <td className="whitespace-nowrap px-4 py-3"><PermissionBadge level={r.permission} /></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <PaginationFooter currentPage={currentPage} totalPages={totalPages} totalItems={filtered.length} rowsPerPage={rowsPerPage} onPageChange={setCurrentPage} onRowsPerPageChange={handleRowsPerPageChange} />
        </div>
      )}
    </section>
  );
}

/* ================================================================== */
/*  ORG MEMBERS TAB                                                    */
/* ================================================================== */

function OrgMembersTab() {
  const { memberResults, memberScanning, memberTotal, memberProcessed, memberCurrentName, memberError, startMemberScan, stopMemberScan, org, token } = useAuditorStore();
  const [search, setSearch] = useState("");
  const filtered = useMemo(
    () => memberResults.filter((m) =>
      m.username.toLowerCase().includes(search.toLowerCase()) ||
      m.email.toLowerCase().includes(search.toLowerCase())
    ), [memberResults, search]
  );
  const { currentPage, totalPages, rowsPerPage, paginated, setCurrentPage, handleRowsPerPageChange } = usePagination(filtered, search);
  const hasCredentials = org.trim() && token.trim();

  return (
    <section>
      {/* toolbar */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold text-[var(--text-secondary)]">Org Members</h2>
        {!memberScanning ? (
          <button type="button" onClick={startMemberScan} disabled={!hasCredentials}
            className="flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50">
            <Play size={14} /> Scan Members
          </button>
        ) : (
          <button type="button" onClick={stopMemberScan}
            className="flex items-center gap-2 rounded-xl bg-red-500/80 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-600">
            <Square size={14} /> Stop
          </button>
        )}
        {memberResults.length > 0 && <span className="text-xs text-[var(--text-muted)]">{filtered.length} members</span>}
        <div className="ml-auto" />
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input type="text" placeholder="Filter by username or email…" value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-56 rounded-xl border border-[var(--border)] bg-[var(--bg-input)] py-2 pl-8 pr-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none transition-colors" />
        </div>
        <button type="button" onClick={() => exportToCSV(filtered, "org-members-audit")} disabled={memberScanning || filtered.length === 0}
          className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)] disabled:opacity-50 disabled:cursor-not-allowed">
          <Download size={14} />
        </button>
      </div>

      {memberError && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          <AlertCircle size={18} className="mt-0.5 shrink-0" /><p>{memberError}</p>
        </div>
      )}
      <ProgressBar scanning={memberScanning} processed={memberProcessed} total={memberTotal} currentName={memberCurrentName} />

      {/* empty state */}
      {!memberScanning && memberResults.length === 0 && !memberError && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] py-16">
          <Users size={40} className="mb-3 text-[var(--text-muted)]" />
          <p className="text-sm text-[var(--text-muted)]">{hasCredentials ? "Click 'Scan Members' to audit organization member accounts." : "Enter your organization details and run a Scan first."}</p>
        </div>
      )}

      {/* data table */}
      {(memberResults.length > 0 || memberScanning) && (
        <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--bg-input)]">
                  <th className="sticky left-0 z-10 whitespace-nowrap bg-[var(--bg-input)] px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Username</th>
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Role</th>
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Email</th>
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Last Activity</th>
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Days Inactive</th>
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 && memberScanning
                  ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} cols={5} />)
                  : paginated.map((m, i) => {
                    const isStale = m.days_inactive > 90;
                    const personalEmail = isPersonalEmail(m.email);
                    return (
                      <tr key={`${m.username}-${i}`} className={`group border-b border-[var(--border)] transition-colors hover:bg-slate-50 dark:hover:bg-[#1a1a26] ${isStale ? "bg-red-500/[0.04]" : ""}`}>
                        <td className="sticky left-0 z-10 whitespace-nowrap bg-[var(--bg-card)] px-4 py-3 font-semibold text-[var(--text-primary)] group-hover:bg-slate-50 dark:group-hover:bg-[#1a1a26]">
                          <span className="inline-flex items-center gap-1.5"><UserCheck size={14} /> {m.username}</span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {m.role === "admin"
                            ? <Badge variant="red"><ShieldAlert size={12} /> Admin</Badge>
                            : <span className="text-[var(--text-secondary)]">{m.role}</span>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {m.email === "N/A" ? (
                            <span className="text-[var(--text-muted)]">N/A</span>
                          ) : personalEmail ? (
                            <span className="inline-flex items-center gap-2">
                              <span className="text-[var(--text-secondary)]">{m.email}</span>
                              <Badge variant="yellow"><AlertTriangle size={12} /> Personal</Badge>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]"><Mail size={14} /> {m.email}</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-[var(--text-secondary)]">{m.last_activity}</td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {isStale
                            ? <Badge variant="red"><Clock size={12} /> {m.days_inactive}d — Stale</Badge>
                            : <span className="text-[var(--text-secondary)]">{m.days_inactive}d</span>}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          <PaginationFooter currentPage={currentPage} totalPages={totalPages} totalItems={filtered.length} rowsPerPage={rowsPerPage} onPageChange={setCurrentPage} onRowsPerPageChange={handleRowsPerPageChange} />
        </div>
      )}
    </section>
  );
}

/* ================================================================== */
/*  DASHBOARD                                                          */
/* ================================================================== */

export default function Dashboard() {
  const {
    org, token, results, auditResults, branchResults, memberResults,
    loading, error,
    auditScanning, auditTotal, auditProcessed, auditCurrentRepo, auditError,
    setOrg, setToken, hydrateData, clearCache, fetchStats, startAuditScan, stopAuditScan,
  } = useAuditorStore();

  const [activeTab, setActiveTab] = useState<"summary" | "audit" | "branches" | "access" | "members" | "teams">("summary");

  /* column visibility */
  const [visibleCols, setVisibleCols] = useState<Set<ColumnKey>>(() => new Set(DEFAULT_VISIBLE));
  const toggleColumn = (key: ColumnKey) => {
    setVisibleCols((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  };
  const activeCols = ALL_COLUMNS.filter((c) => visibleCols.has(c.key));

  /* repo audit search + pagination */
  const [auditSearch, setAuditSearch] = useState("");
  const filteredAudit = useMemo(() => auditResults.filter((r) => r.repository.toLowerCase().includes(auditSearch.toLowerCase())), [auditResults, auditSearch]);
  const { currentPage: auditPage, totalPages: auditTotalPages, rowsPerPage: auditRowsPerPage, paginated: paginatedAudit, setCurrentPage: setAuditPage, handleRowsPerPageChange: handleAuditRppChange } = usePagination(filteredAudit, auditSearch);

  const [connState, setConnState] = useState<"idle" | "connecting" | "connected" | "error">("idle");

  /* hydrate big data from IndexedDB & auto-connect if session has token */
  useEffect(() => {
    hydrateData();
    const st = useAuditorStore.getState();
    if (st.token && st.org) {
      setConnState("connected");
    }
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setConnState("connecting");
    try {
      await fetchStats();
      // fetchStats sets error in store on failure
      const err = useAuditorStore.getState().error;
      if (err) {
        setConnState("error");
      } else {
        setConnState("connected");
      }
    } catch {
      setConnState("error");
    }
  };

  const handleDisconnect = () => {
    setConnState("idle");
    clearCache();
  };

  const inputsLocked = connState === "connecting" || connState === "connected";
  const showTabs = results || auditResults.length > 0 || loading || auditScanning;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors duration-200 dark:bg-black dark:text-zinc-100">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 border-b border-slate-200 bg-white transition-colors duration-200 dark:border-[#27272a] dark:bg-[#0a0a0a]">
        <div className="mx-auto flex h-16 max-w-[96rem] items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="flex flex-col">
              <span className="text-xl font-black tracking-tighter text-slate-900 dark:text-white">
                GitHub Auditor
              </span>
              <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                Open Source Security Edition
              </span>
            </div>
          </div>

          {/* Right: Auth + Theme */}
          <div className="flex items-center gap-4">
            <form onSubmit={handleSubmit} className="hidden items-center gap-3 md:flex">
              <div className={`flex items-center gap-2 rounded-lg border bg-white px-3 py-1.5 transition-colors dark:bg-[#0a0a0a] ${connState === "connected" ? "border-emerald-500/50" : "border-slate-200 dark:border-[#27272a]"}`}>
                <input
                  type="text" placeholder="Org" value={org} onChange={(e) => setOrg(e.target.value)} disabled={inputsLocked}
                  className="w-24 bg-transparent text-xs font-medium focus:outline-none disabled:opacity-50 text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
                />
                <div className="h-4 w-px bg-slate-200 dark:bg-slate-800" />
                <input
                  type="password" placeholder="Token" value={token} onChange={(e) => setToken(e.target.value)} disabled={inputsLocked}
                  className="w-32 bg-transparent text-xs font-medium focus:outline-none disabled:opacity-50 text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
                />
              </div>

              {connState === "connected" ? (
                <button type="button" onClick={handleDisconnect} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:border-red-400 hover:text-red-400 transition-colors dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400" title="Disconnect">
                  <RotateCcw size={16} />
                </button>
              ) : (
                <button type="submit" disabled={connState === "connecting"} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400">
                  {connState === "connecting" ? "..." : "Connect"}
                </button>
              )}
            </form>
            <div className="h-5 w-px bg-slate-200 dark:bg-slate-800" />
            <ThemeToggle />
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="mx-auto max-w-[96rem] px-4 py-8 sm:px-6 lg:px-8">
        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-500">
            <AlertCircle size={18} className="mt-0.5 shrink-0" /><p>{error}</p>
          </div>
        )}


        {/* Tab bar */}
        {showTabs && (
          <div className="mb-6 flex w-fit gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 transition-colors duration-200 dark:border-[#27272a] dark:bg-[#0a0a0a]">
            {([
              { id: "summary" as const, label: "Executive Summary", icon: BarChart3 },
              { id: "audit" as const, label: "Repository Audit", icon: ShieldCheck },
              { id: "branches" as const, label: "Branches", icon: GitBranch },
              { id: "access" as const, label: "User Audit", icon: UserCheck },
              { id: "members" as const, label: "Org Members", icon: Users },
              { id: "teams" as const, label: "Org Teams", icon: UsersRound },
            ]).map((tab) => (
              <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap rounded-lg px-5 py-2 text-sm font-medium transition-colors ${activeTab === tab.id ? "bg-[var(--accent)] text-white shadow-sm" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>
                <span className="inline-flex items-center gap-2"><tab.icon size={15} /> {tab.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* TAB: Executive Summary */}
        {activeTab === "summary" && showTabs && (
          <ExecutiveSummary auditResults={auditResults} branchResults={branchResults} memberResults={memberResults} />
        )}

        {/* TAB: Repository Audit */}
        {activeTab === "audit" && showTabs && (
          <section>
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-semibold text-[var(--text-secondary)]">Repository Audit</h2>
              {!auditScanning ? (
                <button type="button" onClick={startAuditScan} disabled={!org.trim() || !token.trim()}
                  className="flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"><Play size={14} /> Scan Repositories</button>
              ) : (
                <button type="button" onClick={stopAuditScan}
                  className="flex items-center gap-2 rounded-xl bg-red-500/80 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-600"><Square size={14} /> Stop</button>
              )}
              {!auditScanning && auditResults.length > 0 && <span className="text-xs text-[var(--text-muted)]">{filteredAudit.length} repositories</span>}
              <div className="ml-auto" />
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <input type="text" placeholder="Search repos…" value={auditSearch} onChange={(e) => setAuditSearch(e.target.value)}
                  className="w-48 rounded-xl border border-[var(--border)] bg-[var(--bg-input)] py-2 pl-8 pr-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none transition-colors" />
              </div>
              <button type="button" onClick={() => exportToCSV(filteredAudit, "repo-audit")} disabled={auditScanning || filteredAudit.length === 0}
                className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)] disabled:opacity-50 disabled:cursor-not-allowed">
                <Download size={14} />
              </button>
              <ColumnPicker visible={visibleCols} onToggle={toggleColumn} />
            </div>
            {auditError && (<div className="mb-5 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400"><AlertCircle size={18} className="mt-0.5 shrink-0" /><p>{auditError}</p></div>)}
            <ProgressBar scanning={auditScanning} processed={auditProcessed} total={auditTotal} currentName={auditCurrentRepo} />

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-[#27272a] dark:bg-[#0a0a0a]">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-100 dark:border-[#27272a] dark:bg-[#111111]">
                      {activeCols.map((col, i) => (
                        <th key={col.key} className={`whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 ${i === 0 ? "sticky left-0 z-10 bg-slate-100 dark:bg-[#111111]" : ""}`}>{col.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedAudit.length === 0 && auditScanning
                      ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} cols={activeCols.length} />)
                      : paginatedAudit.map((repo) => (
                        <tr key={repo.repository} className="group border-b border-slate-200 transition-colors hover:bg-slate-50 dark:border-[#27272a] dark:hover:bg-[#18181b]">
                          {activeCols.map((col, i) => (
                            <td key={col.key} className={`whitespace-nowrap px-4 py-3.5 text-slate-900 dark:text-slate-200 ${i === 0 ? "sticky left-0 z-10 bg-white group-hover:bg-slate-50 dark:bg-[#0a0a0a] dark:group-hover:bg-[#18181b]" : ""}`}>
                              <AuditCell col={col.key} repo={repo} />
                            </td>
                          ))}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <PaginationFooter currentPage={auditPage} totalPages={auditTotalPages} totalItems={filteredAudit.length} rowsPerPage={auditRowsPerPage} onPageChange={setAuditPage} onRowsPerPageChange={handleAuditRppChange} />
            </div>
          </section>
        )}

        {/* TAB: Branches */}
        {activeTab === "branches" && <BranchesTab />}

        {/* TAB: User Audit */}
        {activeTab === "access" && <UserAuditTab />}

        {/* TAB: Org Members */}
        {activeTab === "members" && <OrgMembersTab />}

        {/* TAB: Org Teams */}
        {activeTab === "teams" && <OrgTeamsTab />}

        {/* Empty state */}
        {!results && !loading && !error && auditResults.length === 0 && !auditScanning && (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] py-20">
            <ShieldCheck size={48} className="mb-4 text-[var(--text-muted)]" />
            <p className="text-[var(--text-muted)]">
              Enter your organization details above and click{" "}
              <span className="font-semibold text-[var(--text-secondary)]">Connect</span> to get started.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
