"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import {
    Search, Loader2, AlertCircle, Play, Square,
    ChevronLeft, ChevronRight, Users, ShieldAlert,
    EyeOff, Eye, AlertTriangle, GitFork, UsersRound,
    Download,
} from "lucide-react";
import { exportToCSV } from "@/lib/exportUtils";
import { useAuditorStore } from "@/lib/store";

/* ---- shared helpers (mirrored from page.tsx to keep independent) ---- */

function Badge({
    children, variant,
}: {
    children: React.ReactNode;
    variant: "green" | "yellow" | "red" | "blue" | "gray" | "orange";
}) {
    const c: Record<string, string> = {
        green: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
        yellow: "bg-amber-500/15 text-amber-400 border-amber-500/25",
        red: "bg-red-500/15 text-red-400 border-red-500/25",
        blue: "bg-sky-500/15 text-sky-400 border-sky-500/25",
        gray: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25",
        orange: "bg-orange-500/15 text-orange-400 border-orange-500/25",
    };
    return (
        <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${c[variant]}`}>
            {children}
        </span>
    );
}

function ProgressBar({ scanning, processed, total, currentName }: { scanning: boolean; processed: number; total: number; currentName: string }) {
    if (!scanning) return null;
    const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
    return (
        <div className="mb-5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <div className="mb-2 flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 text-[var(--text-secondary)]">
                    <Loader2 size={14} className="animate-spin" />
                    Scanning team: <span className="font-semibold text-[var(--text-primary)]">{currentName || "Initializing…"}</span>
                </span>
                <span className="font-mono text-[var(--text-muted)]">{processed} / {total} ({pct}%)</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--border)]">
                <div className="h-full rounded-full bg-[var(--accent)] transition-all duration-300 ease-out" style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}

function SkeletonRow({ cols }: { cols: number }) {
    return (
        <tr className="border-b border-[var(--border)]">
            {Array.from({ length: cols }).map((_, i) => (
                <td key={i} className="px-4 py-3.5"><div className="h-4 w-20 animate-pulse rounded bg-[var(--border)]" /></td>
            ))}
        </tr>
    );
}

const ROWS_PER_PAGE_OPTIONS = [15, 50, 100];
function PaginationFooter({
    currentPage, totalPages, totalItems, rowsPerPage, onPageChange, onRowsPerPageChange,
}: {
    currentPage: number; totalPages: number; totalItems: number; rowsPerPage: number;
    onPageChange: (p: number) => void; onRowsPerPageChange: (r: number) => void;
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
                <label htmlFor="rpp-team" className="text-xs text-[var(--text-muted)]">Rows per page</label>
                <select id="rpp-team" value={rowsPerPage} onChange={(e) => onRowsPerPageChange(Number(e.target.value))}
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
    const paginated = useMemo(() => data.slice((safePage - 1) * rowsPerPage, safePage * rowsPerPage), [data, safePage, rowsPerPage]);
    const handleRowsPerPageChange = (rpp: number) => { setRowsPerPage(rpp); setCurrentPage(1); };
    return { currentPage: safePage, totalPages, rowsPerPage, paginated, setCurrentPage, handleRowsPerPageChange };
}

/* ================================================================== */
/*  ORG TEAMS TAB                                                      */
/* ================================================================== */

export default function OrgTeamsTab() {
    const {
        teamResults, teamScanning, teamTotal, teamProcessed, teamCurrentName,
        teamError, startTeamScan, stopTeamScan, org, token,
    } = useAuditorStore();

    const [search, setSearch] = useState("");
    const filtered = useMemo(
        () => teamResults.filter((t) => t.name.toLowerCase().includes(search.toLowerCase())),
        [teamResults, search]
    );
    const { currentPage, totalPages, rowsPerPage, paginated, setCurrentPage, handleRowsPerPageChange } = usePagination(filtered, search);
    const hasCredentials = org.trim() && token.trim();

    return (
        <section>
            {/* toolbar */}
            <div className="mb-5 flex flex-wrap items-center gap-3">
                <h2 className="text-lg font-semibold text-[var(--text-secondary)]">Org Teams</h2>
                {!teamScanning ? (
                    <button type="button" onClick={startTeamScan} disabled={!hasCredentials}
                        className="flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50">
                        <Play size={14} /> Scan Teams
                    </button>
                ) : (
                    <button type="button" onClick={stopTeamScan}
                        className="flex items-center gap-2 rounded-xl bg-red-500/80 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-600">
                        <Square size={14} /> Stop
                    </button>
                )}
                {teamResults.length > 0 && <span className="text-xs text-[var(--text-muted)]">{filtered.length} teams</span>}
                <div className="ml-auto" />
                <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                    <input type="text" placeholder="Filter by team name…" value={search} onChange={(e) => setSearch(e.target.value)}
                        className="w-56 rounded-xl border border-[var(--border)] bg-[var(--bg-input)] py-2 pl-8 pr-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none transition-colors" />
                </div>
                <button type="button" onClick={() => exportToCSV(filtered, "org-teams-audit")} disabled={teamScanning || filtered.length === 0}
                    className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)] disabled:opacity-50 disabled:cursor-not-allowed">
                    <Download size={14} />
                </button>
            </div>

            {teamError && (
                <div className="mb-5 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
                    <AlertCircle size={18} className="mt-0.5 shrink-0" /><p>{teamError}</p>
                </div>
            )}
            <ProgressBar scanning={teamScanning} processed={teamProcessed} total={teamTotal} currentName={teamCurrentName} />

            {/* empty state */}
            {!teamScanning && teamResults.length === 0 && !teamError && (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] py-16">
                    <UsersRound size={40} className="mb-3 text-[var(--text-muted)]" />
                    <p className="text-sm text-[var(--text-muted)]">{hasCredentials ? "Click 'Scan Teams' to audit organization teams." : "Enter your organization details and run a Scan first."}</p>
                </div>
            )}

            {/* data table */}
            {(teamResults.length > 0 || teamScanning) && (
                <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead>
                                <tr className="border-b border-[var(--border)] bg-[var(--bg-input)]">
                                    <th className="sticky left-0 z-10 whitespace-nowrap bg-[var(--bg-input)] px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Team Name</th>
                                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Description</th>
                                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Privacy</th>
                                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Members Count</th>
                                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Repositories Count</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginated.length === 0 && teamScanning
                                    ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} cols={5} />)
                                    : paginated.map((t, i) => {
                                        const isOrphaned = t.members_count === 0;
                                        return (
                                            <tr key={`${t.name}-${i}`} className={`group border-b border-[var(--border)] transition-colors hover:bg-slate-50 dark:hover:bg-[#1a1a26] ${isOrphaned ? "bg-amber-500/[0.04]" : ""}`}>
                                                <td className="sticky left-0 z-10 whitespace-nowrap bg-[var(--bg-card)] px-4 py-3 font-semibold text-[var(--text-primary)] group-hover:bg-slate-50 dark:group-hover:bg-[#1a1a26]">
                                                    <span className="inline-flex items-center gap-1.5"><UsersRound size={14} /> {t.name}</span>
                                                </td>
                                                <td className="max-w-xs truncate px-4 py-3 text-[var(--text-secondary)]" title={t.description}>{t.description}</td>
                                                <td className="whitespace-nowrap px-4 py-3">
                                                    {t.privacy === "secret"
                                                        ? <Badge variant="red"><EyeOff size={12} /> Secret</Badge>
                                                        : <Badge variant="blue"><Eye size={12} /> {t.privacy === "closed" ? "Visible" : t.privacy}</Badge>}
                                                </td>
                                                <td className="whitespace-nowrap px-4 py-3">
                                                    {isOrphaned ? (
                                                        <span className="inline-flex items-center gap-2">
                                                            <span className="text-[var(--text-secondary)]">{t.members_count}</span>
                                                            <Badge variant="yellow"><AlertTriangle size={12} /> Orphaned</Badge>
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]"><Users size={14} /> {t.members_count}</span>
                                                    )}
                                                </td>
                                                <td className="whitespace-nowrap px-4 py-3 text-[var(--text-secondary)]">
                                                    <span className="inline-flex items-center gap-1.5"><GitFork size={14} /> {t.repos_count}</span>
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
