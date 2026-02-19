"use client";

import { create } from "zustand";
import { persist, createJSONStorage, subscribeWithSelector } from "zustand/middleware";
import localforage from "localforage";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
export interface StatsResult {
  total_repositories: number;
  active_repositories: number;
  archived_repositories: number;
  private_repositories: number;
  public_repositories: number;
}

export interface RepoAudit {
  repository: string;
  owner: string;
  description: string | null;
  topics: string;
  private: boolean;
  archived: boolean;
  default_branch: string;
  language: string | null;
  stars: number;
  forks: number;
  admin_count: number;
  admin_names: string;
  has_codeowners: boolean;
  has_required_reviewers: boolean;
  allows_direct_push: boolean;
  url: string;
  branch_count: number;
}

export interface BranchInfo {
  repository: string;
  branch_name: string;
  last_commit_date: string | null;
  age_days: number | null;
  protected: boolean;
}

export interface AccessRecord {
  repository: string;
  username: string;
  permission: "admin" | "maintain" | "write" | "read";
}

export interface MemberRecord {
  username: string;
  role: string;
  email: string;
  last_activity: string;
  days_inactive: number;
}

export interface TeamRecord {
  name: string;
  description: string;
  privacy: string;
  members_count: number;
  repos_count: number;
}

interface AuditorState {
  /* persisted */
  org: string;
  results: StatsResult | null;

  /* transient */
  token: string;
  loading: boolean;
  error: string | null;

  /* repo audit streaming */
  auditResults: RepoAudit[];
  auditScanning: boolean;
  auditTotal: number;
  auditProcessed: number;
  auditCurrentRepo: string;
  auditError: string | null;

  /* branch scan streaming */
  branchResults: BranchInfo[];
  branchScanning: boolean;
  branchTotal: number;
  branchProcessed: number;
  branchCurrentRepo: string;
  branchError: string | null;

  /* access audit streaming */
  accessResults: AccessRecord[];
  accessScanning: boolean;
  accessTotal: number;
  accessProcessed: number;
  accessCurrentRepo: string;
  accessError: string | null;

  /* member audit streaming */
  memberResults: MemberRecord[];
  memberScanning: boolean;
  memberTotal: number;
  memberProcessed: number;
  memberCurrentName: string;
  memberError: string | null;

  /* team audit streaming */
  teamResults: TeamRecord[];
  teamScanning: boolean;
  teamTotal: number;
  teamProcessed: number;
  teamCurrentName: string;
  teamError: string | null;

  /* actions */
  setOrg: (org: string) => void;
  setToken: (token: string) => void;
  hydrateData: () => Promise<void>;
  clearCache: () => Promise<void>;
  fetchStats: () => Promise<void>;
  startAuditScan: () => void;
  stopAuditScan: () => void;
  startBranchScan: () => void;
  stopBranchScan: () => void;
  startAccessScan: () => void;
  stopAccessScan: () => void;
  startMemberScan: () => void;
  stopMemberScan: () => void;
  startTeamScan: () => void;
  stopTeamScan: () => void;
}

/* ------------------------------------------------------------------ */
/*  Store                                                              */
/* ------------------------------------------------------------------ */
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** Helper: create an SSE EventSource and wire up state updates */
function createSSEStream(
  url: string,
  windowKey: string,
  set: (fn: (s: AuditorState) => Partial<AuditorState>) => void,
  statePrefix: "audit" | "branch" | "access" | "member" | "team",
  totalField: string,
  progressNameField: string,
  dataHandler: (
    payload: Record<string, unknown>,
    set: (fn: (s: AuditorState) => Partial<AuditorState>) => void
  ) => void
) {
  const es = new EventSource(url);

  const scanningKey = statePrefix === "member" ? "memberScanning" :
    `${statePrefix}Scanning` as keyof AuditorState;
  const currentKey = statePrefix === "member" ? "memberCurrentName" :
    `${statePrefix}CurrentRepo` as keyof AuditorState;
  const errorKey = statePrefix === "member" ? "memberError" :
    `${statePrefix}Error` as keyof AuditorState;

  es.onmessage = (event) => {
    try {
      const p = JSON.parse(event.data);
      switch (p.type) {
        case "start":
          set(() => ({ [`${statePrefix}Total`]: p[totalField] }) as Partial<AuditorState>);
          break;
        case "progress":
          set(() => ({
            [`${statePrefix}Processed`]: p.processed,
            [currentKey]: p[progressNameField],
          }) as Partial<AuditorState>);
          break;
        case "data":
          dataHandler(p, set);
          break;
        case "done":
          set(() => ({ [scanningKey]: false, [currentKey]: "" }) as Partial<AuditorState>);
          es.close();
          break;
        case "error":
          set(() => ({ [errorKey]: p.detail, [scanningKey]: false }) as Partial<AuditorState>);
          es.close();
          break;
      }
    } catch { /* ignore parse errors */ }
  };

  es.onerror = () => {
    set(() => ({ [scanningKey]: false, [errorKey]: "Stream connection lost." }) as Partial<AuditorState>);
    es.close();
  };

  (window as unknown as Record<string, EventSource>)[windowKey] = es;
}

export const useAuditorStore = create<AuditorState>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        org: "",
        results: null,
        token: "",
        loading: false,
        error: null,

        auditResults: [],
        auditScanning: false,
        auditTotal: 0,
        auditProcessed: 0,
        auditCurrentRepo: "",
        auditError: null,

        branchResults: [],
        branchScanning: false,
        branchTotal: 0,
        branchProcessed: 0,
        branchCurrentRepo: "",
        branchError: null,

        accessResults: [],
        accessScanning: false,
        accessTotal: 0,
        accessProcessed: 0,
        accessCurrentRepo: "",
        accessError: null,

        memberResults: [],
        memberScanning: false,
        memberTotal: 0,
        memberProcessed: 0,
        memberCurrentName: "",
        memberError: null,

        teamResults: [],
        teamScanning: false,
        teamTotal: 0,
        teamProcessed: 0,
        teamCurrentName: "",
        teamError: null,

        setOrg: (org) => set({ org }),
        setToken: (token) => set({ token }),

        hydrateData: async () => {
          const [audit, branch, access, member, team] = await Promise.all([
            localforage.getItem<RepoAudit[]>("auditResults"),
            localforage.getItem<BranchInfo[]>("branchResults"),
            localforage.getItem<AccessRecord[]>("accessResults"),
            localforage.getItem<MemberRecord[]>("memberResults"),
            localforage.getItem<TeamRecord[]>("teamResults"),
          ]);
          set({
            auditResults: audit || [],
            branchResults: branch || [],
            accessResults: access || [],
            memberResults: member || [],
            teamResults: team || [],
          });
        },

        clearCache: async () => {
          await localforage.clear();
          sessionStorage.clear(); // clears credentials
          set({
            org: "", token: "", results: null, error: null,
            auditResults: [], auditScanning: false, auditProcessed: 0, auditTotal: 0, auditCurrentRepo: "", auditError: null,
            branchResults: [], branchScanning: false, branchProcessed: 0, branchTotal: 0, branchCurrentRepo: "", branchError: null,
            accessResults: [], accessScanning: false, accessProcessed: 0, accessTotal: 0, accessCurrentRepo: "", accessError: null,
            memberResults: [], memberScanning: false, memberProcessed: 0, memberTotal: 0, memberCurrentName: "", memberError: null,
            teamResults: [], teamScanning: false, teamProcessed: 0, teamTotal: 0, teamCurrentName: "", teamError: null,
          });
        },

        /* ---- Quick stats fetch ---- */
        fetchStats: async () => {
          const { org, token } = get();
          if (!org.trim() || !token.trim()) {
            set({ error: "Organization name and token are required." });
            return;
          }
          set({ loading: true, error: null });
          try {
            const res = await fetch(`${API_BASE}/api/stats/basic`, {
              headers: { "gh-token": token, "gh-org": org },
            });
            if (!res.ok) {
              const body = await res.json().catch(() => null);
              throw new Error(body?.detail ?? `Stats request failed (${res.status})`);
            }
            set({ results: await res.json(), loading: false });
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
            set({ error: msg, loading: false });
          }
        },

        /* ---- Repo audit SSE ---- */
        startAuditScan: () => {
          const { org, token } = get();
          if (!org.trim() || !token.trim()) { set({ auditError: "Organization name and token are required." }); return; }
          set({ auditResults: [], auditScanning: true, auditTotal: 0, auditProcessed: 0, auditCurrentRepo: "", auditError: null });
          const url = `${API_BASE}/api/audit/repos/stream?gh_token=${encodeURIComponent(token)}&gh_org=${encodeURIComponent(org)}`;
          createSSEStream(url, "__auditES", set as never, "audit", "total_repos", "repo", (p, s) => {
            s((state) => ({ auditResults: [...state.auditResults, p.repo_data as RepoAudit] }));
          });
        },
        stopAuditScan: () => {
          const es = (window as unknown as Record<string, EventSource>).__auditES;
          if (es) es.close();
          set({ auditScanning: false });
        },

        /* ---- Branch audit SSE ---- */
        startBranchScan: () => {
          const { org, token } = get();
          if (!org.trim() || !token.trim()) { set({ branchError: "Organization name and token are required." }); return; }
          set({ branchResults: [], branchScanning: true, branchTotal: 0, branchProcessed: 0, branchCurrentRepo: "", branchError: null });
          const url = `${API_BASE}/api/audit/branches/stream?gh_token=${encodeURIComponent(token)}&gh_org=${encodeURIComponent(org)}`;
          createSSEStream(url, "__branchES", set as never, "branch", "total_repos", "repo", (p, s) => {
            s((state) => ({ branchResults: [...state.branchResults, ...(p.branches as BranchInfo[])] }));
          });
        },
        stopBranchScan: () => {
          const es = (window as unknown as Record<string, EventSource>).__branchES;
          if (es) es.close();
          set({ branchScanning: false });
        },

        /* ---- Access audit SSE ---- */
        startAccessScan: () => {
          const { org, token } = get();
          if (!org.trim() || !token.trim()) { set({ accessError: "Organization name and token are required." }); return; }
          set({ accessResults: [], accessScanning: true, accessTotal: 0, accessProcessed: 0, accessCurrentRepo: "", accessError: null });
          const url = `${API_BASE}/api/audit/access/stream?gh_token=${encodeURIComponent(token)}&gh_org=${encodeURIComponent(org)}`;
          createSSEStream(url, "__accessES", set as never, "access", "total_repos", "repo", (p, s) => {
            s((state) => ({ accessResults: [...state.accessResults, ...(p.access_data as AccessRecord[])] }));
          });
        },
        stopAccessScan: () => {
          const es = (window as unknown as Record<string, EventSource>).__accessES;
          if (es) es.close();
          set({ accessScanning: false });
        },

        /* ---- Member audit SSE ---- */
        startMemberScan: () => {
          const { org, token } = get();
          if (!org.trim() || !token.trim()) { set({ memberError: "Organization name and token are required." }); return; }
          set({ memberResults: [], memberScanning: true, memberTotal: 0, memberProcessed: 0, memberCurrentName: "", memberError: null });
          const url = `${API_BASE}/api/audit/members/stream?gh_token=${encodeURIComponent(token)}&gh_org=${encodeURIComponent(org)}`;
          createSSEStream(url, "__memberES", set as never, "member", "total_members", "member", (p, s) => {
            s((state) => ({ memberResults: [...state.memberResults, p.member_data as MemberRecord] }));
          });
        },
        stopMemberScan: () => {
          const es = (window as unknown as Record<string, EventSource>).__memberES;
          if (es) es.close();
          set({ memberScanning: false });
        },

        /* ---- Team audit SSE ---- */
        startTeamScan: () => {
          const { org, token } = get();
          if (!org.trim() || !token.trim()) { set({ teamError: "Organization name and token are required." }); return; }
          set({ teamResults: [], teamScanning: true, teamTotal: 0, teamProcessed: 0, teamCurrentName: "", teamError: null });
          const url = `${API_BASE}/api/audit/teams/stream?gh_token=${encodeURIComponent(token)}&gh_org=${encodeURIComponent(org)}`;
          createSSEStream(url, "__teamES", set as never, "team", "total_teams", "team", (p, s) => {
            s((state) => ({ teamResults: [...state.teamResults, p.team_data as TeamRecord] }));
          });
        },
        stopTeamScan: () => {
          const es = (window as unknown as Record<string, EventSource>).__teamES;
          if (es) es.close();
          set({ teamScanning: false });
        },
      }),
      {
        name: "gh-auditor-storage",
        storage: createJSONStorage(() => sessionStorage),
        partialize: (state) => ({
          org: state.org,
          token: state.token,
          results: state.results,
        }),
      }
    )
  )
);

/* ---- Auto-save massive arrays to IndexedDB ---- */
useAuditorStore.subscribe((state) => state.auditResults, (val) => localforage.setItem("auditResults", val));
useAuditorStore.subscribe((state) => state.branchResults, (val) => localforage.setItem("branchResults", val));
useAuditorStore.subscribe((state) => state.accessResults, (val) => localforage.setItem("accessResults", val));
useAuditorStore.subscribe((state) => state.memberResults, (val) => localforage.setItem("memberResults", val));
useAuditorStore.subscribe((state) => state.teamResults, (val) => localforage.setItem("teamResults", val));
