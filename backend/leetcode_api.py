import requests
import random

LEETCODE_URL = "https://leetcode.com/graphql"
QUERY_RECENT_AC = """
query recentAcSubmissionList($username: String!, $limit: Int!) {
  recentAcSubmissionList(username: $username, limit: $limit) {
    titleSlug
    timestamp
  }
}
"""

def check_recent_submissions(username, problem_slugs, contest_start_timestamp):
    # If no username is provided, we can't check.
    if not username:
        return {}

    try:
        # Fetch last 20 accepted submissions
        # We need the username. If using cookie, we can deduce it or user must provide it.
        # For simplicity in V2, we will ask user for username in frontend.
        response = requests.post(LEETCODE_URL, json={
            'query': QUERY_RECENT_AC,
            'variables': {'username': username, 'limit': 20}
        }, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            submissions = data.get('data', {}).get('recentAcSubmissionList', [])
            
            updates = {}
            for sub in submissions:
                slug = sub['titleSlug']
                # Check if this submission is for one of our contest problems
                # AND if it happened AFTER the contest started
                if slug in problem_slugs and int(sub['timestamp']) > contest_start_timestamp:
                    updates[slug] = int(sub['timestamp'])
            
            return updates # Returns { "two-sum": 1709999999, ... }
            
    except Exception as e:
        print(f"Error checking submissions: {e}")
    
    return {}
# Query to fetch problems with TAGS and STATUS
QUERY_ALL = """
query problemsetQuestionList {
  problemsetQuestionList: questionList(
    categorySlug: ""
    limit: 2500
    filters: {}
  ) {
    data {
      title
      titleSlug
      difficulty
      isPaidOnly
      topicTags {
        name
        slug
      }
      status  # This will be 'ac' if solved, 'null' if not (requires Cookie)
    }
  }
}
"""

def get_problems_with_status(session_cookie=None):
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0"
    }
    
    # If user provides a cookie, we add it to headers to get 'Solved' status
    if session_cookie:
        headers["Cookie"] = f"LEETCODE_SESSION={session_cookie}"

    try:
        response = requests.post(LEETCODE_URL, json={'query': QUERY_ALL}, headers=headers, timeout=15)
        if response.status_code == 200:
            data = response.json()
            questions = data['data']['problemsetQuestionList']['data']
            return [q for q in questions if not q['isPaidOnly']]
    except Exception as e:
        print(f"Error fetching data: {e}")
    return []

def generate_contest(problems, filters):
    # 1. Filter by Tags (if any selected)
    if filters.get("tags"):
        selected_tags = set(filters["tags"])
        problems = [
            p for p in problems 
            if any(tag['slug'] in selected_tags for tag in p['topicTags'])
        ]

    # 2. Filter by Status (Solved vs Unsolved)
    mode = filters.get("mode", "all") # 'all', 'solved', 'unsolved'
    
    if mode == "solved":
        problems = [p for p in problems if p['status'] == "ac"]
    elif mode == "unsolved":
        problems = [p for p in problems if p['status'] != "ac"]

    # 3. Separate by Difficulty
    easy = [p for p in problems if p['difficulty'] == 'Easy']
    medium = [p for p in problems if p['difficulty'] == 'Medium']
    hard = [p for p in problems if p['difficulty'] == 'Hard']

    contest_set = []

    # 4. Select Problems (Safe selection if lists are empty)
    if easy: contest_set.append(random.choice(easy))
    if len(medium) >= 2: contest_set.extend(random.sample(medium, 2))
    elif medium: contest_set.extend(medium) # Fallback if < 2 mediums exist
    if hard: contest_set.append(random.choice(hard))

    return contest_set