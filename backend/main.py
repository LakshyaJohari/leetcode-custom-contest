from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from leetcode_api import get_problems_with_status, generate_contest, check_recent_submissions
import time

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class ContestRequest(BaseModel):
    session_cookie: str = ""
    selected_tags: list[str] = []
    mode: str = "all"

class CheckStatusRequest(BaseModel):
    username: str
    problem_slugs: list[str]
    contest_start_time: int  # Unix timestamp sent from frontend

@app.post("/create-contest")
def create_contest_endpoint(req: ContestRequest):
    problems = get_problems_with_status(req.session_cookie)
    if not problems:
        raise HTTPException(status_code=500, detail="Failed to fetch problems")
    
    contest = generate_contest(problems, {"tags": req.selected_tags, "mode": req.mode})
    return {"contest": contest, "server_time": int(time.time())}

@app.post("/check-status")
def check_status_endpoint(req: CheckStatusRequest):
    # Returns dictionary of solved problems with their timestamp
    # e.g., { "two-sum": 1734567890 }
    solved_map = check_recent_submissions(req.username, req.problem_slugs, req.contest_start_time)
    return solved_map