import requests
import random
import re
import logging

logger = logging.getLogger(__name__)

LEETCODE_URL = "https://leetcode.com/graphql"

QUERY_RECENT_ALL = """
query recentSubmissionList($username: String!, $limit: Int!) {
  recentSubmissionList(username: $username, limit: $limit) {
    titleSlug
    statusDisplay
    timestamp
  }
}
"""

# Query to fetch ALL solved problem slugs for the authenticated user via AC submissions
QUERY_AC_SUBMISSIONS = """
query userSolvedProblems {
  userSolvedProblemsCount {
    count
    difficulty
  }
}
"""

QUERY_PROBLEMS_BY_USER = """
query problemsetQuestionList($skip: Int!, $limit: Int!) {
  problemsetQuestionList: questionList(
    categorySlug: ""
    limit: $limit
    skip: $skip
    filters: { status: AC }
  ) {
    total: totalNum
    data {
      titleSlug
    }
  }
}
"""


def _build_auth_headers(session_cookie: str) -> dict:
    """Build proper authentication headers for LeetCode API requests."""
    # Extract csrftoken from the cookie string if present
    csrf_token = ""
    csrf_match = re.search(r'csrftoken=([^;]+)', session_cookie)
    if csrf_match:
        csrf_token = csrf_match.group(1)

    # Determine which cookie fields to include
    cookie_header = session_cookie if "=" in session_cookie else f"LEETCODE_SESSION={session_cookie}"

    headers = {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://leetcode.com/problemset/all/",
        "Origin": "https://leetcode.com",
        "Cookie": cookie_header,
    }
    if csrf_token:
        headers["x-csrftoken"] = csrf_token

    return headers


def verify_cookie(session_cookie: str) -> dict:
    """
    Verify that a LeetCode session cookie is valid by calling the user status API.
    Returns {"valid": bool, "username": str | None}.
    """
    if not session_cookie:
        return {"valid": False, "username": None}

    headers = _build_auth_headers(session_cookie)
    try:
        resp = requests.get(
            "https://leetcode.com/api/user/status/",
            headers=headers,
            timeout=10,
        )
        if resp.status_code == 200:
            data = resp.json()
            username = data.get("userSlug") or data.get("username")
            is_signed_in = data.get("isSignedIn", False)
            logger.info("Cookie verification: isSignedIn=%s username=%s", is_signed_in, username)
            return {"valid": bool(is_signed_in), "username": username}
    except Exception as exc:
        logger.error("Cookie verification error: %s", exc)

    return {"valid": False, "username": None}


def _fetch_solved_slugs_via_filter(session_cookie: str) -> set:
    """
    Fallback: paginate through the problemset using filters={status: AC} to collect
    all solved problem slugs for the authenticated user.
    """
    headers = _build_auth_headers(session_cookie)
    solved = set()
    page_size = 100
    skip = 0

    try:
        while True:
            resp = requests.post(
                LEETCODE_URL,
                json={
                    "query": QUERY_PROBLEMS_BY_USER,
                    "variables": {"skip": skip, "limit": page_size},
                },
                headers=headers,
                timeout=15,
            )
            if resp.status_code != 200:
                logger.warning("Solved-slug fetch HTTP %s at skip=%d", resp.status_code, skip)
                break

            payload = resp.json()
            batch = payload.get("data", {}).get("problemsetQuestionList", {})
            items = batch.get("data") or []
            total = batch.get("total", 0)

            for item in items:
                slug = item.get("titleSlug")
                if slug:
                    solved.add(slug)

            skip += page_size
            if skip >= total or not items:
                break
    except Exception as exc:
        logger.error("Error fetching solved slugs via filter: %s", exc)

    logger.info("Fetched %d solved slugs via AC-filter fallback", len(solved))
    return solved


def check_recent_submissions(username, problem_slugs, contest_start_timestamp):
    if not username:
        return {}

    try:
        response = requests.post(LEETCODE_URL, json={
            'query': QUERY_RECENT_ALL,
            'variables': {'username': username, 'limit': 50}
        }, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            submissions = data.get('data', {}).get('recentSubmissionList', [])
            
            # Structure: { "two-sum": { "time": 170999, "fails": 2 } }
            results = {}

            grouped_subs = {slug: [] for slug in problem_slugs}
            
            for sub in submissions:
                slug = sub['titleSlug']
                ts = int(sub['timestamp'])
                if slug in problem_slugs and ts > contest_start_timestamp:
                    grouped_subs[slug].append(sub)

            for slug, subs in grouped_subs.items():
                if not subs:
                    continue
                
                # Sort by time: Oldest first
                subs.sort(key=lambda x: int(x['timestamp']))
                
                penalty_count = 0
                solved_time = None
                is_solved = False

                for s in subs:
                    if s['statusDisplay'] == 'Accepted':
                        solved_time = int(s['timestamp'])
                        is_solved = True
                        break
                    else:
                        penalty_count += 1
                
                if is_solved:
                    results[slug] = {
                        "time": solved_time,
                        "fails": penalty_count
                    }
            
            return results
            
    except Exception as e:
        logger.error("Error checking submissions: %s", e)
    
    return {}


# Query to fetch problems with TAGS and STATUS (requires auth cookie)
QUERY_ALL = """
query problemsetQuestionList($skip: Int!, $limit: Int!) {
  problemsetQuestionList: questionList(
    categorySlug: ""
    limit: $limit
    skip: $skip
    filters: {}
  ) {
    total: totalNum
    data {
      title
      titleSlug
      difficulty
      isPaidOnly
      topicTags {
        name
        slug
      }
      status
    }
  }
}
"""


def _fetch_all_problems_paginated(headers: dict) -> list:
    """Fetch all non-paid problems using pagination."""
    all_problems = []
    page_size = 100
    skip = 0

    try:
        while True:
            resp = requests.post(
                LEETCODE_URL,
                json={
                    "query": QUERY_ALL,
                    "variables": {"skip": skip, "limit": page_size},
                },
                headers=headers,
                timeout=15,
            )
            if resp.status_code != 200:
                logger.warning("Problem fetch HTTP %s at skip=%d", resp.status_code, skip)
                break

            payload = resp.json()
            batch = payload.get("data", {}).get("problemsetQuestionList", {})
            items = batch.get("data") or []
            total = batch.get("total", 0)

            all_problems.extend([q for q in items if not q.get("isPaidOnly")])

            skip += page_size
            if skip >= total or not items:
                break
    except Exception as exc:
        logger.error("Error fetching paginated problems: %s", exc)

    return all_problems


def get_problems_with_status(session_cookie=None):
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://leetcode.com/problemset/all/",
        "Origin": "https://leetcode.com",
    }

    solved_slugs = set()
    cookie_valid = False

    if session_cookie:
        auth_headers = _build_auth_headers(session_cookie)
        headers.update(auth_headers)

        # Verify cookie and determine if we need the fallback
        verification = verify_cookie(session_cookie)
        cookie_valid = verification["valid"]
        logger.info("Cookie valid: %s", cookie_valid)

    problems = _fetch_all_problems_paginated(headers)

    if not problems:
        logger.error("Failed to fetch problems from LeetCode API")
        return []

    # When a valid cookie is provided, always use the AC-filter fallback to get
    # a reliable and complete set of solved problem slugs.  The problemset list
    # API does not consistently return per-problem status even when authenticated,
    # so we always override whatever status the API returned.
    if session_cookie and cookie_valid:
        logger.info("Cookie valid – fetching solved slugs via AC-filter for reliable status")
        solved_slugs = _fetch_solved_slugs_via_filter(session_cookie)
        for p in problems:
            if p["titleSlug"] in solved_slugs:
                p["status"] = "ac"
            else:
                p["status"] = None

    return problems


def generate_contest(problems, filters):
    # 1. Filter by Tags (if any selected)
    if filters.get("tags"):
        selected_tags = set(filters["tags"])
        problems = [
            p for p in problems 
            if any(tag['slug'] in selected_tags for tag in p['topicTags'])
        ]

    # 2. Filter by Status (Solved vs Unsolved)
    mode = filters.get("mode", "all")  # 'all', 'solved', 'unsolved'
    
    if mode == "solved":
        problems = [p for p in problems if p.get('status') == "ac"]
    elif mode == "unsolved":
        problems = [p for p in problems if p.get('status') != "ac"]

    # 3. Separate by Difficulty
    easy = [p for p in problems if p['difficulty'] == 'Easy']
    medium = [p for p in problems if p['difficulty'] == 'Medium']
    hard = [p for p in problems if p['difficulty'] == 'Hard']

    contest_set = []

    # 4. Select Problems (Safe selection if lists are empty)
    if easy: contest_set.append(random.choice(easy))
    if len(medium) >= 2: contest_set.extend(random.sample(medium, 2))
    elif medium: contest_set.extend(medium)
    if hard: contest_set.append(random.choice(hard))

    return contest_set