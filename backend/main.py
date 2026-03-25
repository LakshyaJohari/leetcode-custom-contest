import asyncio
import datetime
import json
import logging
import secrets
import time
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db, init_db
from leetcode_api import (
    check_recent_submissions,
    generate_contest,
    get_problems_with_status,
    verify_cookie,
)
from models import ContestSubmission, HostedContest, Participant
from ranking import leaderboard_entry

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="LeetCode Custom Contest API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    init_db()


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class ContestRequest(BaseModel):
    session_cookie: str = ""
    selected_tags: list[str] = []
    mode: str = "all"


class CheckStatusRequest(BaseModel):
    username: str
    problem_slugs: list[str]
    contest_start_time: int  # Unix timestamp sent from frontend


class VerifyCookieRequest(BaseModel):
    session_cookie: str


class CreateHostedContestRequest(BaseModel):
    title: str
    start_time: str   # ISO 8601 datetime string, e.g. "2025-01-01T10:00:00"
    session_cookie: str = ""
    selected_tags: list[str] = []
    mode: str = "all"


class JoinContestRequest(BaseModel):
    display_name: str


class RecordSubmissionRequest(BaseModel):
    participant_id: int
    problem_slug: str
    verdict: str   # 'accepted' | 'wrong'


class EndContestRequest(BaseModel):
    host_token: str


# ---------------------------------------------------------------------------
# Solo contest endpoints (existing)
# ---------------------------------------------------------------------------

@app.post("/create-contest")
def create_contest_endpoint(req: ContestRequest):
    problems, cookie_valid = get_problems_with_status(req.session_cookie)
    if not problems:
        raise HTTPException(status_code=500, detail="Failed to fetch problems")

    if req.mode == "solved" and not cookie_valid:
        raise HTTPException(
            status_code=400,
            detail="A valid LeetCode session cookie is required to filter by solved problems.",
        )

    # When no valid cookie, status is unknown – skip status-based filtering
    effective_mode = req.mode if cookie_valid else "all"
    contest = generate_contest(problems, {"tags": req.selected_tags, "mode": effective_mode})
    return {"contest": contest, "server_time": int(time.time())}


@app.post("/check-status")
def check_status_endpoint(req: CheckStatusRequest):
    solved_map = check_recent_submissions(
        req.username, req.problem_slugs, req.contest_start_time
    )
    return solved_map


@app.post("/verify-cookie")
def verify_cookie_endpoint(req: VerifyCookieRequest):
    """Verify whether the supplied LeetCode session cookie is valid."""
    result = verify_cookie(req.session_cookie)
    return result


# ---------------------------------------------------------------------------
# Hosted contest helpers
# ---------------------------------------------------------------------------

def _auto_update_status(contest: HostedContest) -> HostedContest:
    """Mutate contest.status in-place based on current time (not saved to DB here)."""
    now = datetime.datetime.utcnow()
    if contest.status != "finished":
        if now >= contest.end_time:
            contest.status = "finished"
        elif now >= contest.start_time:
            contest.status = "active"
    return contest


def _build_leaderboard(contest: HostedContest, db: Session) -> list:
    participants = (
        db.query(Participant).filter(Participant.contest_id == contest.id).all()
    )
    problems = contest.problems or []
    contest_start_ts = contest.start_time.timestamp()
    rows = []

    for p in participants:
        all_subs = (
            db.query(ContestSubmission)
            .filter(
                ContestSubmission.participant_id == p.id,
                ContestSubmission.contest_id == contest.id,
            )
            .all()
        )
        accepted = [s for s in all_subs if s.verdict == "accepted"]
        # Deduplicate: keep only the first accepted submission per problem
        seen = set()
        first_accepted = []
        for s in sorted(accepted, key=lambda x: x.submitted_at):
            if s.problem_slug not in seen:
                seen.add(s.problem_slug)
                first_accepted.append(s)

        wrong_counts = {}
        for s in all_subs:
            if s.verdict == "wrong":
                wrong_counts[s.problem_slug] = wrong_counts.get(s.problem_slug, 0) + 1

        entry = leaderboard_entry(
            participant_id=p.id,
            display_name=p.display_name,
            problems=problems,
            accepted_submissions=first_accepted,
            wrong_counts=wrong_counts,
            contest_start_ts=contest_start_ts,
        )
        rows.append(entry)

    rows.sort(key=lambda r: (-r["total_score"], -r["solved_count"]))
    for rank, row in enumerate(rows, start=1):
        row["rank"] = rank
    return rows


# ---------------------------------------------------------------------------
# Hosted contest endpoints
# ---------------------------------------------------------------------------

@app.post("/hosted-contest/create")
def create_hosted_contest(req: CreateHostedContestRequest, db: Session = Depends(get_db)):
    """Create a new hosted contest with a fixed problem set."""
    try:
        start_dt = datetime.datetime.fromisoformat(req.start_time)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid start_time format. Use ISO 8601.")

    end_dt = start_dt + datetime.timedelta(minutes=90)

    # A session cookie is required when filtering by solved status
    if req.mode == "solved" and not req.session_cookie:
        raise HTTPException(
            status_code=400,
            detail="A LeetCode session cookie is required for solved filtering.",
        )

    problems, cookie_valid = get_problems_with_status(req.session_cookie)
    if not problems:
        raise HTTPException(status_code=500, detail="Failed to fetch problems from LeetCode")

    if req.mode == "solved" and not cookie_valid:
        raise HTTPException(
            status_code=400,
            detail="A valid LeetCode session cookie is required to filter by solved problems.",
        )

    # When no valid cookie, status is unknown – skip status-based filtering
    effective_mode = req.mode if cookie_valid else "all"
    contest_problems = generate_contest(
        problems, {"tags": req.selected_tags, "mode": effective_mode}
    )
    if not contest_problems:
        raise HTTPException(
            status_code=400,
            detail="No problems matched the selected filters. Try different tags or mode.",
        )

    # Determine initial status
    now = datetime.datetime.utcnow()
    if now >= end_dt:
        status = "finished"
    elif now >= start_dt:
        status = "active"
    else:
        status = "scheduled"

    host_token = secrets.token_urlsafe(32)

    contest = HostedContest(
        title=req.title,
        start_time=start_dt,
        end_time=end_dt,
        status=status,
        problems=contest_problems,
        host_token=host_token,
    )
    db.add(contest)
    db.commit()
    db.refresh(contest)

    return {
        "id": contest.id,
        "title": contest.title,
        "start_time": contest.start_time.isoformat(),
        "end_time": contest.end_time.isoformat(),
        "status": contest.status,
        "problems": contest.problems,
        "host_token": contest.host_token,
    }


@app.get("/hosted-contest/list")
def list_hosted_contests(db: Session = Depends(get_db)):
    """Return all hosted contests with auto-updated statuses."""
    contests = db.query(HostedContest).order_by(HostedContest.start_time.desc()).all()
    result = []
    for c in contests:
        _auto_update_status(c)
        db.add(c)
        result.append(
            {
                "id": c.id,
                "title": c.title,
                "start_time": c.start_time.isoformat(),
                "end_time": c.end_time.isoformat(),
                "status": c.status,
                "participant_count": len(c.participants),
            }
        )
    db.commit()
    return result


@app.get("/hosted-contest/{contest_id}")
def get_hosted_contest(contest_id: int, db: Session = Depends(get_db)):
    """Get full details of a single hosted contest."""
    c = db.query(HostedContest).filter(HostedContest.id == contest_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Contest not found")
    _auto_update_status(c)
    db.add(c)
    db.commit()
    return {
        "id": c.id,
        "title": c.title,
        "start_time": c.start_time.isoformat(),
        "end_time": c.end_time.isoformat(),
        "status": c.status,
        "problems": c.problems,
        "server_time": int(time.time()),
    }


@app.post("/hosted-contest/{contest_id}/join")
def join_contest(
    contest_id: int, req: JoinContestRequest, db: Session = Depends(get_db)
):
    """Register a participant in a hosted contest."""
    c = db.query(HostedContest).filter(HostedContest.id == contest_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Contest not found")
    _auto_update_status(c)
    db.add(c)
    db.commit()

    if c.status == "finished":
        raise HTTPException(status_code=400, detail="Contest has already finished")

    # Check if name already taken in this contest
    existing = (
        db.query(Participant)
        .filter(
            Participant.contest_id == contest_id,
            Participant.display_name == req.display_name,
        )
        .first()
    )
    if existing:
        return {"participant_id": existing.id, "display_name": existing.display_name}

    p = Participant(contest_id=contest_id, display_name=req.display_name)
    db.add(p)
    db.commit()
    db.refresh(p)
    return {"participant_id": p.id, "display_name": p.display_name}


@app.post("/hosted-contest/{contest_id}/submit")
async def record_submission(
    contest_id: int,
    req: RecordSubmissionRequest,
    db: Session = Depends(get_db),
):
    """Record a submission (accepted or wrong) for a participant."""
    c = db.query(HostedContest).filter(HostedContest.id == contest_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Contest not found")
    _auto_update_status(c)
    if c.status != "active":
        raise HTTPException(status_code=400, detail="Contest is not active")

    participant = (
        db.query(Participant).filter(Participant.id == req.participant_id).first()
    )
    if not participant or participant.contest_id != contest_id:
        raise HTTPException(status_code=404, detail="Participant not found in this contest")

    verdict = req.verdict.lower()
    if verdict not in ("accepted", "wrong"):
        raise HTTPException(status_code=400, detail="verdict must be 'accepted' or 'wrong'")

    # Prevent duplicate accepted submissions
    if verdict == "accepted":
        already = (
            db.query(ContestSubmission)
            .filter(
                ContestSubmission.participant_id == req.participant_id,
                ContestSubmission.problem_slug == req.problem_slug,
                ContestSubmission.verdict == "accepted",
            )
            .first()
        )
        if already:
            return {"message": "Already accepted", "submission_id": already.id}

    sub = ContestSubmission(
        participant_id=req.participant_id,
        contest_id=contest_id,
        problem_slug=req.problem_slug,
        verdict=verdict,
        submitted_at=time.time(),
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)

    # Broadcast updated leaderboard to all WebSocket clients in this contest
    leaderboard = _build_leaderboard(c, db)
    await _manager.broadcast(contest_id, {"type": "leaderboard", "data": leaderboard})

    return {"submission_id": sub.id, "verdict": verdict}


@app.get("/hosted-contest/{contest_id}/leaderboard")
def get_leaderboard(contest_id: int, db: Session = Depends(get_db)):
    """Return the current leaderboard for a hosted contest."""
    c = db.query(HostedContest).filter(HostedContest.id == contest_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Contest not found")
    _auto_update_status(c)
    db.add(c)
    db.commit()

    leaderboard = _build_leaderboard(c, db)
    return {
        "contest_id": contest_id,
        "status": c.status,
        "server_time": int(time.time()),
        "leaderboard": leaderboard,
    }


@app.post("/hosted-contest/{contest_id}/end")
async def end_contest(
    contest_id: int, req: EndContestRequest, db: Session = Depends(get_db)
):
    """Allow the contest host to manually end an active or scheduled contest."""
    c = db.query(HostedContest).filter(HostedContest.id == contest_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Contest not found")
    if c.host_token != req.host_token:
        raise HTTPException(status_code=403, detail="Invalid host token")
    if c.status == "finished":
        raise HTTPException(status_code=400, detail="Contest is already finished")

    c.status = "finished"
    db.add(c)
    db.commit()

    # Broadcast final leaderboard to all connected WebSocket clients
    leaderboard = _build_leaderboard(c, db)
    await _manager.broadcast(contest_id, {"type": "leaderboard", "data": leaderboard})

    return {"status": "finished"}


# ---------------------------------------------------------------------------
# WebSocket – real-time leaderboard
# ---------------------------------------------------------------------------

class ConnectionManager:
    def __init__(self):
        # Map from contest_id -> set of active WebSocket connections
        self._rooms: dict[int, set[WebSocket]] = {}

    async def connect(self, contest_id: int, ws: WebSocket):
        await ws.accept()
        self._rooms.setdefault(contest_id, set()).add(ws)

    def disconnect(self, contest_id: int, ws: WebSocket):
        room = self._rooms.get(contest_id, set())
        room.discard(ws)

    async def broadcast(self, contest_id: int, payload: dict):
        room = list(self._rooms.get(contest_id, set()))
        message = json.dumps(payload)
        dead = []
        for ws in room:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(contest_id, ws)


_manager = ConnectionManager()


@app.websocket("/ws/contest/{contest_id}")
async def websocket_leaderboard(
    contest_id: int, websocket: WebSocket, db: Session = Depends(get_db)
):
    """
    WebSocket endpoint that pushes leaderboard updates to all connected clients
    in a contest room.  The server sends an update immediately on connection and
    then every 15 seconds while the contest is active.
    """
    await _manager.connect(contest_id, websocket)
    try:
        # Send initial leaderboard immediately
        c = db.query(HostedContest).filter(HostedContest.id == contest_id).first()
        if c:
            _auto_update_status(c)
            db.add(c)
            db.commit()
            leaderboard = _build_leaderboard(c, db)
            await websocket.send_text(
                json.dumps({"type": "leaderboard", "data": leaderboard})
            )

        while True:
            # Wait up to 15 seconds; if the client sends anything we ignore it
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=15.0)
            except asyncio.TimeoutError:
                pass

            # Refresh and push updated leaderboard
            db.expire_all()
            c = db.query(HostedContest).filter(HostedContest.id == contest_id).first()
            if not c:
                break
            _auto_update_status(c)
            db.add(c)
            db.commit()

            leaderboard = _build_leaderboard(c, db)
            await websocket.send_text(
                json.dumps({"type": "leaderboard", "data": leaderboard})
            )

            if c.status == "finished":
                # Send final update then close
                break

    except WebSocketDisconnect:
        pass
    finally:
        _manager.disconnect(contest_id, websocket)