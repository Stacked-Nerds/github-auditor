"use client";

import { useMemo, useRef, useState } from "react";
import jsPDF from "jspdf";
import { toPng } from "html-to-image";
import { useTheme } from "next-themes";
import {
    ShieldCheck, ShieldOff, ShieldAlert, FileWarning, XCircle,
    Users, Clock, AlertTriangle, CheckCircle2, Star, GitFork,
    GitBranch, Archive, Lock, Mail, Trophy, ArrowDown, ArrowUp,
    Download, Loader2,
} from "lucide-react";
import type { RepoAudit, BranchInfo, MemberRecord } from "@/lib/store";

/* ---- helpers ---- */
const PERSONAL_DOMAINS = new Set([
    "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "live.com",
    "aol.com", "icloud.com", "me.com", "mail.com", "protonmail.com",
    "proton.me", "ymail.com", "gmx.com", "gmx.net", "zoho.com",
]);
function isPersonal(email: string) {
    if (!email || email === "N/A") return false;
    const d = email.split("@")[1]?.toLowerCase();
    return d ? PERSONAL_DOMAINS.has(d) : false;
}

/* ---- sub-components ---- */
const AlertCard = ({ label, value, icon: Icon, ok }: { label: string; value: number; icon: React.ElementType; ok: boolean }) => (
    <div className={`group relative overflow-hidden rounded-xl border p-5 transition-all duration-300 ${ok
        ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400"
        : "border-red-200 bg-red-50 text-red-900 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400"
        }`}>
        <div className="flex items-start justify-between">
            <div>
                <p className="text-xs font-semibold uppercase tracking-wider opacity-70">{label}</p>
                <p className="mt-2 text-3xl font-bold">{value}</p>
            </div>
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${ok ? "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400" : "bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400"}`}>
                {ok ? <CheckCircle2 size={20} /> : <Icon size={20} />}
            </div>
        </div>
        <p className="mt-2 text-xs opacity-70">
            {ok ? "No issues detected" : "Requires attention"}
        </p>
    </div>
);

const StatBox = ({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: React.ElementType; color: string }) => (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-indigo-500 dark:border-[#27272a] dark:bg-[#0a0a0a] dark:hover:border-indigo-500">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100/50 text-slate-700 dark:bg-slate-700/50 dark:text-slate-200">
            <Icon size={18} style={{ color }} />
        </div>
        <div>
            <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
        </div>
    </div>
);

function Leaderboard({ title, icon: Icon, items, dir }: { title: string; icon: React.ElementType; items: { name: string; count: number }[]; dir: "top" | "bottom" }) {
    const color = dir === "top" ? "text-amber-400" : "text-sky-400";
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-[#27272a] dark:bg-[#0a0a0a]">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
                <Icon size={16} className={color} /> {title}
            </h3>
            {items.length === 0 ? (
                <p className="text-xs text-slate-400 dark:text-slate-500">No data yet</p>
            ) : (
                <ol className="space-y-2">
                    {items.map((it, i) => (
                        <li key={it.name} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <span className="flex items-center gap-2.5">
                                <span className={`flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold ${dir === "top" ? "bg-amber-500/15 text-amber-400" : "bg-sky-500/15 text-sky-400"
                                    }`}>{i + 1}</span>
                                <span className="font-medium text-slate-900 dark:text-slate-100">{it.name}</span>
                            </span>
                            <span className="flex items-center gap-1 font-mono text-xs text-slate-500 dark:text-slate-400">
                                <GitBranch size={12} /> {it.count}
                            </span>
                        </li>
                    ))}
                </ol>
            )}
        </div>
    );
}

/* ================================================================== */
/*  EXECUTIVE SUMMARY TAB                                              */
/* ================================================================== */
/* ================================================================== */
/*  REPORT CONTENT COMPONENT (Reusable)                               */
/* ================================================================== */
function ReportContent({
    repo, branch, sec, identity, auditResults, top10, bottom10, memberResults
}: {
    repo: any; branch: any; sec: any; identity: any; auditResults: RepoAudit[];
    top10: any[]; bottom10: any[]; memberResults: MemberRecord[];
}) {
    return (
        <div className="space-y-8 rounded-xl border border-slate-200 bg-white p-8 text-slate-900 shadow-sm dark:border-[#27272a] dark:bg-[#0a0a0a] dark:text-zinc-100">
            {/* PDF Header */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-6 dark:border-[#27272a]">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">GitHub Audit Report</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Executive Summary & Security Posture</p>
                </div>
                <div className="text-right text-xs text-slate-500 dark:text-slate-400">
                    <p>Generated on</p>
                    <p className="font-mono text-slate-900 dark:text-slate-300">{new Date().toLocaleDateString()}</p>
                </div>
            </div>
            <div>
                <h2 className="mb-5 flex items-center gap-2 text-lg font-semibold text-slate-700 dark:text-slate-300">
                    <ShieldAlert size={20} className="text-red-500 dark:text-red-400" /> Security Posture
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    <AlertCard label="Missing CODEOWNERS" value={sec.missingCodeowners} icon={FileWarning} ok={sec.missingCodeowners === 0} />
                    <AlertCard label="No Required Reviewers" value={sec.noReviewers} icon={XCircle} ok={sec.noReviewers === 0} />
                    <AlertCard label="Direct Push Allowed" value={sec.directPush} icon={ShieldOff} ok={sec.directPush === 0} />
                    <AlertCard label="Repos with > 5 Admins" value={sec.tooManyAdmins} icon={Users} ok={sec.tooManyAdmins === 0} />
                    <AlertCard label="Stale Branches (> 90d)" value={branch.stale} icon={Clock} ok={branch.stale === 0} />
                    <AlertCard label="Inactive Members (> 90d)" value={identity.inactive} icon={Clock} ok={identity.inactive === 0} />
                    <AlertCard label="Personal Emails" value={identity.personalEmails} icon={AlertTriangle} ok={identity.personalEmails === 0} />
                    <AlertCard label="Org-level Admins" value={identity.orgAdmins} icon={ShieldAlert} ok={identity.orgAdmins <= 2} />
                </div>
            </div>

            {/* ---- General Stats ---- */}
            <div>
                <h2 className="mb-5 flex items-center gap-2 text-lg font-semibold text-slate-700 dark:text-slate-300">
                    <ShieldCheck size={20} className="text-indigo-500 dark:text-indigo-400" /> General Statistics
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    <StatBox label="Total Repositories" value={repo.total} icon={GitFork} color="#6366f1" />
                    <StatBox label="Archived" value={repo.archived} icon={Archive} color="#f59e0b" />
                    <StatBox label="Private" value={repo.priv} icon={Lock} color="#8b5cf6" />
                    <StatBox label="Total Stars" value={repo.stars.toLocaleString()} icon={Star} color="#eab308" />
                    <StatBox label="Total Forks" value={repo.forks.toLocaleString()} icon={GitFork} color="#06b6d4" />
                    <StatBox label="Total Branches" value={branch.total.toLocaleString()} icon={GitBranch} color="#22c55e" />
                    <StatBox label="Avg Branches / Repo" value={branch.avgPerRepo} icon={GitBranch} color="#10b981" />
                    <StatBox label="Total Members" value={memberResults.length} icon={Users} color="#ec4899" />
                    <StatBox label="Org Admins" value={identity.orgAdmins} icon={ShieldAlert} color="#ef4444" />
                    <StatBox label="Personal Emails" value={identity.personalEmails} icon={Mail} color="#f59e0b" />
                </div>
            </div>

            {/* ---- Leaderboards ---- */}
            {auditResults.length > 0 && (
                <div>
                    <h2 className="mb-5 flex items-center gap-2 text-lg font-semibold text-slate-700 dark:text-slate-300">
                        <Trophy size={20} className="text-amber-400" /> Branch Count Leaderboards
                    </h2>
                    <div className="grid gap-4 md:grid-cols-2">
                        <Leaderboard title="Top 10 by Branch Count" icon={ArrowUp} items={top10} dir="top" />
                        <Leaderboard title="Bottom 10 by Branch Count" icon={ArrowDown} items={bottom10} dir="bottom" />
                    </div>
                </div>
            )}
            {/* PDF Footer */}
            <div className="mt-8 border-t border-slate-200 pt-6 text-center text-xs text-slate-500 dark:border-[#27272a] dark:text-zinc-400">
                <p>Confidential Security Report • Generated by GitHub Security Auditor</p>
            </div>
        </div>
    );
}

/* ================================================================== */
/*  EXECUTIVE SUMMARY TAB                                              */
/* ================================================================== */
export default function ExecutiveSummary({
    auditResults, branchResults, memberResults,
}: {
    auditResults: RepoAudit[];
    branchResults: BranchInfo[];
    memberResults: MemberRecord[];
}) {
    const hasData = auditResults.length > 0 || branchResults.length > 0 || memberResults.length > 0;
    const hiddenReportRef = useRef<HTMLDivElement>(null); // Ref for the hidden dark mode report
    const [pdfLoading, setPdfLoading] = useState(false);

    const handleExportPDF = async () => {
        if (!hiddenReportRef.current) return;
        setPdfLoading(true);

        try {
            // We capture the hidden, forced-dark-mode element
            // No need to toggle classes on document.documentElement anymore!

            const dataUrl = await toPng(hiddenReportRef.current, {
                cacheBust: true,
                backgroundColor: "#000000", // Ensure Pitch Black background
            });

            const img = new Image();
            img.src = dataUrl;
            img.onload = () => {
                const pdf = new jsPDF({
                    unit: "px",
                    format: [img.width, img.height],
                });

                pdf.addImage(dataUrl, "PNG", 0, 0, img.width, img.height);
                pdf.save("GitHub-Audit-Executive-Summary.pdf");
                setPdfLoading(false);
            };
        } catch (err) {
            console.error("PDF generation failed", err);
            setPdfLoading(false);
        }
    };

    /* ---- repo stats ---- */
    const repo = useMemo(() => {
        const total = auditResults.length;
        const archived = auditResults.filter((r) => r.archived).length;
        const priv = auditResults.filter((r) => r.private).length;
        const stars = auditResults.reduce((s, r) => s + r.stars, 0);
        const forks = auditResults.reduce((s, r) => s + r.forks, 0);
        return { total, archived, priv, stars, forks };
    }, [auditResults]);

    /* ---- branch stats ---- */
    const branch = useMemo(() => {
        const total = branchResults.length;
        const stale = branchResults.filter((b) => b.age_days !== null && b.age_days > 90).length;
        const avgPerRepo = repo.total > 0 ? +(total / repo.total).toFixed(1) : 0;
        return { total, stale, avgPerRepo };
    }, [branchResults, repo.total]);

    /* ---- security metrics ---- */
    const sec = useMemo(() => ({
        missingCodeowners: auditResults.filter((r) => !r.has_codeowners).length,
        noReviewers: auditResults.filter((r) => !r.has_required_reviewers).length,
        directPush: auditResults.filter((r) => r.allows_direct_push).length,
        tooManyAdmins: auditResults.filter((r) => r.admin_count > 5).length,
    }), [auditResults]);

    /* ---- identity metrics ---- */
    const identity = useMemo(() => ({
        inactive: memberResults.filter((m) => m.days_inactive > 90).length,
        personalEmails: memberResults.filter((m) => isPersonal(m.email)).length,
        orgAdmins: memberResults.filter((m) => m.role === "admin").length,
    }), [memberResults]);

    /* ---- leaderboards ---- */
    const top10 = useMemo(() =>
        [...auditResults].sort((a, b) => b.branch_count - a.branch_count).slice(0, 10).map((r) => ({ name: r.repository, count: r.branch_count })),
        [auditResults]
    );
    const bottom10 = useMemo(() =>
        [...auditResults].sort((a, b) => a.branch_count - b.branch_count).slice(0, 10).map((r) => ({ name: r.repository, count: r.branch_count })),
        [auditResults]
    );

    /* ---- empty state ---- */
    if (!hasData) {
        return (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 py-20 dark:border-slate-800">
                <Trophy size={48} className="mb-4 text-slate-300 dark:text-slate-600" />
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    Run scans from the other tabs to populate the Executive Summary.
                </p>
            </div>
        );
    }

    const reportProps = { repo, branch, sec, identity, auditResults, top10, bottom10, memberResults };

    return (
        <section className="space-y-10">
            {/* data-source hint */}
            <p className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-500 dark:border-[#27272a] dark:bg-[#0a0a0a] dark:text-zinc-400">
                <AlertTriangle size={14} className="shrink-0 text-amber-400" />
                Data populates automatically as you run scans in the other tabs.
            </p>

            {/* PDF Export Button */}
            <div className="flex justify-end">
                <button onClick={handleExportPDF} disabled={pdfLoading}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-indigo-600 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-[#27272a] dark:bg-[#0a0a0a] dark:text-indigo-400 dark:hover:bg-[#27272a]">
                    {pdfLoading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                    {pdfLoading ? "Generating PDF..." : "Export PDF Report"}
                </button>
            </div>

            {/* Visible Report (Responsive Theme) */}
            <ReportContent {...reportProps} />

            {/* Hidden Dark Mode Report (For PDF Export) */}
            {/* We place it behind everything (z-index -50) so it's technically "visible" for the screenshot library */}
            <div ref={hiddenReportRef} className="dark fixed left-0 top-0 -z-50 w-[1280px] bg-[#000000] p-8 text-zinc-100">
                <ReportContent {...reportProps} />
            </div>
        </section>
    );
}
