"""GitHub Security Auditor — Backend API (V4 – SSE branch streaming)"""

import asyncio
import json
import time
from datetime import datetime, timezone

from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import aiohttp

app = FastAPI(
    title="GitHub Security Auditor",
    description="Fetch high-level repository statistics for a GitHub organization.",
    version="4.0.0",
)

# ---------------------------------------------------------------------------
# CORS — allow the local Next.js frontend
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------
GH_API = "https://api.github.com"


def _gh_headers(token: str) -> dict:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


async def _fetch_with_retry(
    session: aiohttp.ClientSession,
    url: str,
    headers: dict,
    params: dict | None = None,
    max_retries: int = 3,
) -> aiohttp.ClientResponse:
    """Fetch a URL with automatic retry on 403 rate-limit errors."""
    for attempt in range(max_retries):
        resp = await session.get(url, headers=headers, params=params)

        if resp.status == 403:
            reset_ts = resp.headers.get("X-RateLimit-Reset")
            if reset_ts:
                wait = max(int(reset_ts) - int(time.time()), 1)
                wait = min(wait, 120)  # cap at 2 min
            else:
                wait = 30 * (attempt + 1)
            await resp.release()
            await asyncio.sleep(wait)
            continue

        return resp

    # Last attempt — return whatever we get
    return await session.get(url, headers=headers, params=params)


async def _fetch_all_repos(
    session: aiohttp.ClientSession, org: str, headers: dict
) -> list[dict]:
    """Paginate through all repos for an org."""
    all_repos: list[dict] = []
    page = 1
    while True:
        resp = await _fetch_with_retry(
            session,
            f"{GH_API}/orgs/{org}/repos",
            headers,
            params={"per_page": 100, "page": page},
        )
        async with resp:
            if resp.status == 401:
                raise HTTPException(status_code=401, detail="Invalid GitHub token.")
            if resp.status == 404:
                raise HTTPException(
                    status_code=404, detail=f"Organization '{org}' not found."
                )
            if resp.status != 200:
                body = await resp.text()
                raise HTTPException(
                    status_code=resp.status, detail=f"GitHub API error: {body}"
                )
            repos = await resp.json()
            if not repos:
                break
            all_repos.extend(repos)
            page += 1
    return all_repos


# ---------------------------------------------------------------------------
# GET /api/stats/basic
# ---------------------------------------------------------------------------
@app.get("/api/stats/basic")
async def get_basic_stats(
    gh_token: str = Header(..., description="GitHub Personal Access Token"),
    gh_org: str = Header(..., description="GitHub Organization slug"),
):
    """Return high-level repo metrics for a GitHub organization."""
    async with aiohttp.ClientSession() as session:
        all_repos = await _fetch_all_repos(session, gh_org, _gh_headers(gh_token))

    archived = sum(1 for r in all_repos if r.get("archived"))
    private = sum(1 for r in all_repos if r.get("private"))
    total = len(all_repos)

    return {
        "total_repositories": total,
        "active_repositories": total - archived,
        "archived_repositories": archived,
        "private_repositories": private,
        "public_repositories": total - private,
    }


# ---------------------------------------------------------------------------
# GET /api/audit/repos — 17-column security audit (Phase 4)
# ---------------------------------------------------------------------------


async def _check_codeowners(
    session: aiohttp.ClientSession, org: str, repo: str, headers: dict
) -> bool:
    """Return True if a CODEOWNERS file exists in any valid location."""
    paths = ["CODEOWNERS", "docs/CODEOWNERS", ".github/CODEOWNERS"]

    async def _check_path(path: str) -> bool:
        resp = await _fetch_with_retry(
            session, f"{GH_API}/repos/{org}/{repo}/contents/{path}", headers
        )
        status = resp.status
        await resp.release()
        return status == 200

    results = await asyncio.gather(*[_check_path(p) for p in paths])
    return any(results)


async def _check_branch_rules(
    session: aiohttp.ClientSession, org: str, repo: str, branch: str, headers: dict
) -> tuple[bool, bool]:
    """
    Check branch rulesets. Returns (allows_direct_push, has_required_reviewers).
    """
    allows_direct_push = True
    has_required_reviewers = False

    resp = await _fetch_with_retry(
        session,
        f"{GH_API}/repos/{org}/{repo}/rules/branches/{branch}",
        headers,
    )
    async with resp:
        if resp.status == 200:
            rules = await resp.json()
            for rule in rules:
                rule_type = rule.get("type")
                if rule_type == "pull_request":
                    allows_direct_push = False
                    params = rule.get("parameters", {})
                    if params.get("required_approving_review_count", 0) > 0:
                        has_required_reviewers = True

    return allows_direct_push, has_required_reviewers


async def _get_admins(
    session: aiohttp.ClientSession, org: str, repo: str, headers: dict
) -> tuple[int, str]:
    """Return (admin_count, comma-separated admin usernames)."""
    admins: list[str] = []
    page = 1
    while True:
        resp = await _fetch_with_retry(
            session,
            f"{GH_API}/repos/{org}/{repo}/collaborators",
            headers,
            params={"permission": "admin", "per_page": 100, "page": page},
        )
        async with resp:
            if resp.status != 200:
                return 0, ""
            users = await resp.json()
            if not users:
                break
            admins.extend(u.get("login", "") for u in users)
            page += 1
    return len(admins), ", ".join(admins)


async def _get_branch_count(
    session: aiohttp.ClientSession, org: str, repo: str, headers: dict
) -> int:
    """Return the total number of branches."""
    count = 0
    page = 1
    while True:
        resp = await _fetch_with_retry(
            session,
            f"{GH_API}/repos/{org}/{repo}/branches",
            headers,
            params={"per_page": 100, "page": page},
        )
        async with resp:
            if resp.status != 200:
                return count
            branches = await resp.json()
            if not branches:
                break
            count += len(branches)
            page += 1
    return count


async def _audit_single_repo(
    sem: asyncio.Semaphore,
    session: aiohttp.ClientSession,
    org: str,
    repo: dict,
    headers: dict,
) -> dict:
    """Run all security checks for a single repo, respecting the semaphore."""
    async with sem:
        name = repo["name"]
        branch = repo.get("default_branch", "main")

        (
            has_codeowners,
            (allows_direct_push, has_required_reviewers),
            (admin_count, admin_names),
            branch_count,
        ) = await asyncio.gather(
            _check_codeowners(session, org, name, headers),
            _check_branch_rules(session, org, name, branch, headers),
            _get_admins(session, org, name, headers),
            _get_branch_count(session, org, name, headers),
        )

        return {
            "repository": name,
            "owner": org,
            "description": repo.get("description"),
            "topics": ", ".join(repo.get("topics", [])),
            "private": repo.get("private", False),
            "archived": repo.get("archived", False),
            "default_branch": branch,
            "language": repo.get("language"),
            "stars": repo.get("stargazers_count", 0),
            "forks": repo.get("forks_count", 0),
            "admin_count": admin_count,
            "admin_names": admin_names,
            "has_codeowners": has_codeowners,
            "has_required_reviewers": has_required_reviewers,
            "allows_direct_push": allows_direct_push,
            "url": repo.get("html_url", ""),
            "branch_count": branch_count,
        }


_AUDIT_SEM = asyncio.Semaphore(5)


@app.get("/api/audit/repos/stream")
async def stream_audit_repos(
    gh_token: str = Query(..., description="GitHub Personal Access Token"),
    gh_org: str = Query(..., description="GitHub Organization slug"),
):
    """SSE endpoint — streams repo audit data repo-by-repo (17 columns)."""

    async def event_generator():
        headers = _gh_headers(gh_token)

        async with aiohttp.ClientSession() as session:
            try:
                all_repos = await _fetch_all_repos(session, gh_org, headers)
            except HTTPException as exc:
                yield _sse_event({"type": "error", "detail": exc.detail})
                return

            total = len(all_repos)
            yield _sse_event({"type": "start", "total_repos": total})

            processed = 0

            async def _process_one(repo: dict):
                return await _audit_single_repo(
                    _AUDIT_SEM, session, gh_org, repo, headers
                )

            tasks = {
                asyncio.ensure_future(_process_one(repo)): repo["name"]
                for repo in all_repos
            }

            for coro in asyncio.as_completed(tasks):
                repo_data = await coro
                processed += 1

                yield _sse_event({
                    "type": "progress",
                    "repo": repo_data["repository"],
                    "processed": processed,
                })
                yield _sse_event({
                    "type": "data",
                    "repo_data": repo_data,
                })

            yield _sse_event({"type": "done"})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# GET /api/audit/branches/stream — SSE branch audit (Phase 5)
# ---------------------------------------------------------------------------

# Global semaphore for branch scanning (tighter limit — many API calls)
_BRANCH_SEM = asyncio.Semaphore(5)


async def _get_branch_details(
    session: aiohttp.ClientSession,
    org: str,
    repo_name: str,
    headers: dict,
) -> list[dict]:
    """Fetch all branches for a repo with commit date and protection status."""
    branches_out: list[dict] = []
    page = 1
    now = datetime.now(timezone.utc)

    while True:
        resp = await _fetch_with_retry(
            session,
            f"{GH_API}/repos/{org}/{repo_name}/branches",
            headers,
            params={"per_page": 100, "page": page},
        )
        async with resp:
            if resp.status != 200:
                break
            branches = await resp.json()
            if not branches:
                break

            for b in branches:
                branch_name = b.get("name", "")
                protected = b.get("protected", False)

                # Get last commit date from the commit object
                commit_data = b.get("commit", {})
                sha = commit_data.get("sha", "")

                last_commit_date = None
                age_days = None

                # Fetch the full commit for date info
                if sha:
                    c_resp = await _fetch_with_retry(
                        session,
                        f"{GH_API}/repos/{org}/{repo_name}/commits/{sha}",
                        headers,
                    )
                    async with c_resp:
                        if c_resp.status == 200:
                            commit_detail = await c_resp.json()
                            date_str = (
                                commit_detail
                                .get("commit", {})
                                .get("committer", {})
                                .get("date")
                            )
                            if date_str:
                                commit_dt = datetime.fromisoformat(
                                    date_str.replace("Z", "+00:00")
                                )
                                last_commit_date = commit_dt.strftime("%Y-%m-%d")
                                age_days = (now - commit_dt).days

                branches_out.append({
                    "repository": repo_name,
                    "branch_name": branch_name,
                    "last_commit_date": last_commit_date,
                    "age_days": age_days,
                    "protected": protected,
                })

            page += 1

    return branches_out


async def _scan_repo_branches(
    sem: asyncio.Semaphore,
    session: aiohttp.ClientSession,
    org: str,
    repo_name: str,
    headers: dict,
) -> list[dict]:
    """Scan a single repo's branches, respecting the global semaphore."""
    async with sem:
        return await _get_branch_details(session, org, repo_name, headers)


def _sse_event(data: dict) -> str:
    """Format a dict as a Server-Sent Event string."""
    return f"data: {json.dumps(data)}\n\n"


@app.get("/api/audit/branches/stream")
async def stream_branches(
    gh_token: str = Query(..., description="GitHub Personal Access Token"),
    gh_org: str = Query(..., description="GitHub Organization slug"),
):
    """SSE endpoint — streams branch data repo-by-repo."""

    async def event_generator():
        headers = _gh_headers(gh_token)

        async with aiohttp.ClientSession() as session:
            # 1. Fetch all repo names
            try:
                all_repos = await _fetch_all_repos(session, gh_org, headers)
            except HTTPException as exc:
                yield _sse_event({"type": "error", "detail": exc.detail})
                return

            repo_names = [r["name"] for r in all_repos if not r.get("archived")]
            total = len(repo_names)

            # 2. Send start event
            yield _sse_event({"type": "start", "total_repos": total})

            # 3. Process repos concurrently with semaphore, yielding as each finishes
            processed = 0

            async def _process_one(name: str):
                return name, await _scan_repo_branches(
                    _BRANCH_SEM, session, gh_org, name, headers
                )

            # Create tasks and iterate results as they complete
            tasks = {
                asyncio.ensure_future(_process_one(name)): name
                for name in repo_names
            }

            for coro in asyncio.as_completed(tasks):
                repo_name, branches = await coro
                processed += 1

                # Progress event
                yield _sse_event({
                    "type": "progress",
                    "repo": repo_name,
                    "processed": processed,
                })

                # Data event
                if branches:
                    yield _sse_event({
                        "type": "data",
                        "branches": branches,
                    })

            # 4. Done
            yield _sse_event({"type": "done"})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# GET /api/audit/access/stream — SSE user access audit (Phase 7)
# ---------------------------------------------------------------------------

_ACCESS_SEM = asyncio.Semaphore(5)


async def _get_repo_access(
    session: aiohttp.ClientSession,
    org: str,
    repo_name: str,
    headers: dict,
) -> list[dict]:
    """Fetch collaborators for a repo and return access records."""
    records: list[dict] = []
    page = 1
    while True:
        resp = await _fetch_with_retry(
            session,
            f"{GH_API}/repos/{org}/{repo_name}/collaborators",
            headers,
            params={"per_page": 100, "page": page},
        )
        async with resp:
            if resp.status != 200:
                break
            collabs = await resp.json()
            if not collabs:
                break
            for c in collabs:
                perms = c.get("permissions", {})
                if perms.get("admin"):
                    level = "admin"
                elif perms.get("maintain"):
                    level = "maintain"
                elif perms.get("push"):
                    level = "write"
                else:
                    level = "read"
                records.append({
                    "repository": repo_name,
                    "username": c.get("login", ""),
                    "permission": level,
                })
            page += 1
    return records


async def _scan_repo_access(
    sem: asyncio.Semaphore,
    session: aiohttp.ClientSession,
    org: str,
    repo_name: str,
    headers: dict,
) -> tuple[str, list[dict]]:
    """Scan a single repo's collaborators, respecting the semaphore."""
    async with sem:
        records = await _get_repo_access(session, org, repo_name, headers)
        return repo_name, records


@app.get("/api/audit/access/stream")
async def stream_access(
    gh_token: str = Query(..., description="GitHub Personal Access Token"),
    gh_org: str = Query(..., description="GitHub Organization slug"),
):
    """SSE endpoint — streams user access data repo-by-repo."""

    async def event_generator():
        headers = _gh_headers(gh_token)

        async with aiohttp.ClientSession() as session:
            try:
                all_repos = await _fetch_all_repos(session, gh_org, headers)
            except HTTPException as exc:
                yield _sse_event({"type": "error", "detail": exc.detail})
                return

            repo_names = [r["name"] for r in all_repos if not r.get("archived")]
            total = len(repo_names)

            yield _sse_event({"type": "start", "total_repos": total})

            processed = 0

            tasks = {
                asyncio.ensure_future(
                    _scan_repo_access(_ACCESS_SEM, session, gh_org, name, headers)
                ): name
                for name in repo_names
            }

            for coro in asyncio.as_completed(tasks):
                repo_name, access_data = await coro
                processed += 1

                yield _sse_event({
                    "type": "progress",
                    "repo": repo_name,
                    "processed": processed,
                })

                if access_data:
                    yield _sse_event({
                        "type": "data",
                        "access_data": access_data,
                    })

            yield _sse_event({"type": "done"})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# GET /api/audit/members/stream — SSE org members audit (Phase 8)
# ---------------------------------------------------------------------------

_MEMBER_SEM = asyncio.Semaphore(5)


async def _fetch_all_members(
    session: aiohttp.ClientSession,
    org: str,
    headers: dict,
) -> list[dict]:
    """Paginate through /orgs/{org}/members and return the full list."""
    members: list[dict] = []
    page = 1
    while True:
        resp = await _fetch_with_retry(
            session,
            f"{GH_API}/orgs/{org}/members",
            headers,
            params={"per_page": 100, "page": page},
        )
        async with resp:
            if resp.status != 200:
                detail = (await resp.json()).get("message", resp.reason)
                raise HTTPException(status_code=resp.status, detail=detail)
            batch = await resp.json()
            if not batch:
                break
            members.extend(batch)
            page += 1
    return members


async def _get_member_details(
    sem: asyncio.Semaphore,
    session: aiohttp.ClientSession,
    org: str,
    username: str,
    headers: dict,
) -> dict:
    """Fetch role, email, and last-activity for a single member."""
    async with sem:
        role_coro = _fetch_with_retry(
            session,
            f"{GH_API}/orgs/{org}/memberships/{username}",
            headers,
        )
        profile_coro = _fetch_with_retry(
            session,
            f"{GH_API}/users/{username}",
            headers,
        )
        events_coro = _fetch_with_retry(
            session,
            f"{GH_API}/users/{username}/events",
            headers,
            params={"per_page": 1},
        )

        role_resp, profile_resp, events_resp = await asyncio.gather(
            role_coro, profile_coro, events_coro
        )

        # --- role ---
        async with role_resp:
            role = "member"
            if role_resp.status == 200:
                role_data = await role_resp.json()
                role = role_data.get("role", "member")

        # --- email ---
        async with profile_resp:
            email = "N/A"
            if profile_resp.status == 200:
                profile_data = await profile_resp.json()
                email = profile_data.get("email") or "N/A"

        # --- last activity ---
        async with events_resp:
            days_inactive = 91  # default when no events
            last_activity = "No recent activity"
            if events_resp.status == 200:
                events = await events_resp.json()
                if events:
                    created = events[0].get("created_at", "")
                    if created:
                        evt_dt = datetime.fromisoformat(
                            created.replace("Z", "+00:00")
                        )
                        now = datetime.now(timezone.utc)
                        days_inactive = (now - evt_dt).days
                        last_activity = evt_dt.strftime("%Y-%m-%d")

        return {
            "username": username,
            "role": role,
            "email": email,
            "last_activity": last_activity,
            "days_inactive": days_inactive,
        }


@app.get("/api/audit/members/stream")
async def stream_members(
    gh_token: str = Query(..., description="GitHub Personal Access Token"),
    gh_org: str = Query(..., description="GitHub Organization slug"),
):
    """SSE endpoint — streams org member data one-by-one."""

    async def event_generator():
        headers = _gh_headers(gh_token)

        async with aiohttp.ClientSession() as session:
            try:
                all_members = await _fetch_all_members(session, gh_org, headers)
            except HTTPException as exc:
                yield _sse_event({"type": "error", "detail": exc.detail})
                return

            usernames = [m["login"] for m in all_members]
            total = len(usernames)

            yield _sse_event({"type": "start", "total_members": total})

            processed = 0

            tasks = {
                asyncio.ensure_future(
                    _get_member_details(
                        _MEMBER_SEM, session, gh_org, uname, headers
                    )
                ): uname
                for uname in usernames
            }

            for coro in asyncio.as_completed(tasks):
                member_data = await coro
                processed += 1

                yield _sse_event({
                    "type": "progress",
                    "member": member_data["username"],
                    "processed": processed,
                })

                yield _sse_event({
                    "type": "data",
                    "member_data": member_data,
                })

            yield _sse_event({"type": "done"})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# GET /api/audit/teams/stream — SSE org teams audit (Phase 10)
# ---------------------------------------------------------------------------

_TEAM_SEM = asyncio.Semaphore(5)


async def _fetch_all_teams(
    session: aiohttp.ClientSession,
    org: str,
    headers: dict,
) -> list[dict]:
    """Paginate through /orgs/{org}/teams and return the full list."""
    teams: list[dict] = []
    page = 1
    while True:
        resp = await _fetch_with_retry(
            session,
            f"{GH_API}/orgs/{org}/teams",
            headers,
            params={"per_page": 100, "page": page},
        )
        async with resp:
            if resp.status != 200:
                detail = (await resp.json()).get("message", resp.reason)
                raise HTTPException(status_code=resp.status, detail=detail)
            batch = await resp.json()
            if not batch:
                break
            teams.extend(batch)
            page += 1
    return teams


async def _get_team_details(
    sem: asyncio.Semaphore,
    session: aiohttp.ClientSession,
    org: str,
    team: dict,
    headers: dict,
) -> dict:
    """Enrich a single team with member and repo counts."""
    async with sem:
        slug = team.get("slug", "")

        # Members count — use the team detail endpoint for accuracy
        members_count = team.get("members_count", 0)
        repos_count = team.get("repos_count", 0)

        # If counts weren't in the list response, fetch the detail
        if members_count == 0 and repos_count == 0:
            detail_resp = await _fetch_with_retry(
                session,
                f"{GH_API}/orgs/{org}/teams/{slug}",
                headers,
            )
            async with detail_resp:
                if detail_resp.status == 200:
                    detail = await detail_resp.json()
                    members_count = detail.get("members_count", 0)
                    repos_count = detail.get("repos_count", 0)

        return {
            "name": team.get("name", ""),
            "description": team.get("description") or "No description",
            "privacy": team.get("privacy", "closed"),
            "members_count": members_count,
            "repos_count": repos_count,
        }


@app.get("/api/audit/teams/stream")
async def stream_teams(
    gh_token: str = Query(..., description="GitHub Personal Access Token"),
    gh_org: str = Query(..., description="GitHub Organization slug"),
):
    """SSE endpoint — streams org team data one-by-one."""

    async def event_generator():
        headers = _gh_headers(gh_token)

        async with aiohttp.ClientSession() as session:
            try:
                all_teams = await _fetch_all_teams(session, gh_org, headers)
            except HTTPException as exc:
                yield _sse_event({"type": "error", "detail": exc.detail})
                return

            total = len(all_teams)
            yield _sse_event({"type": "start", "total_teams": total})

            processed = 0

            tasks = {
                asyncio.ensure_future(
                    _get_team_details(_TEAM_SEM, session, gh_org, t, headers)
                ): t.get("name", "")
                for t in all_teams
            }

            for coro in asyncio.as_completed(tasks):
                team_data = await coro
                processed += 1

                yield _sse_event({
                    "type": "progress",
                    "team": team_data["name"],
                    "processed": processed,
                })

                yield _sse_event({
                    "type": "data",
                    "team_data": team_data,
                })

            yield _sse_event({"type": "done"})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
