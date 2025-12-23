import requests
import random

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

def check_recent_submissions(username, problem_slugs, contest_start_timestamp):
    if not username:
        return {}

    try:
        # Fetch last 50 submissions (increased limit to catch wrong attempts)
        response = requests.post(LEETCODE_URL, json={
            'query': QUERY_RECENT_ALL,
            'variables': {'username': username, 'limit': 50}
        }, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            submissions = data.get('data', {}).get('recentSubmissionList', [])
            
            # Structure: { "two-sum": { "time": 170999, "fails": 2 } }
            results = {} 

            # Process submissions to find AC and count penalties
            # We iterate chronologically (oldest to newest is easier, but API gives newest first)
            # So we group them first.
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
                        break # Stop counting after first AC
                    else:
                        # Count wrong answer, TLE, runtime error, etc.
                        penalty_count += 1
                
                if is_solved:
                    results[slug] = {
                        "time": solved_time,
                        "fails": penalty_count
                    }
            
            return results
            
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