"""
Difficulty-weighted ranking formula.

Score per problem
-----------------
  base_points  = Easy: 3 | Medium: 5 | Hard: 7
  time_penalty = (minutes_taken / 90) * 0.5 * base_points
  wrong_penalty = wrong_attempts * 5   (each wrong attempt adds 5 "virtual" minutes)

  actual_minutes = solve_minutes + wrong_attempts * 5
  time_penalty   = (actual_minutes / 90) * 0.5 * base_points

  final_score = max(0, base_points - time_penalty)

Total contest score = sum of all solved problem scores.
"""

DIFFICULTY_POINTS = {"Easy": 3, "Medium": 5, "Hard": 7}
CONTEST_DURATION_MINUTES = 90


def problem_score(
    difficulty: str,
    minutes_taken: float,
    wrong_attempts: int,
    contest_duration: float = CONTEST_DURATION_MINUTES,
) -> float:
    """
    Calculate the score for a single solved problem.

    :param difficulty: 'Easy', 'Medium', or 'Hard'
    :param minutes_taken: wall-clock minutes from contest start to accepted submission
    :param wrong_attempts: number of non-accepted submissions before the accepted one
    :param contest_duration: total contest length in minutes (default 90)
    :return: floating-point score >= 0
    """
    base = DIFFICULTY_POINTS.get(difficulty, 3)
    # Each wrong attempt adds a 5-minute virtual time penalty
    effective_minutes = minutes_taken + wrong_attempts * 5
    time_penalty = (effective_minutes / contest_duration) * 0.5 * base
    return max(0.0, round(base - time_penalty, 4))


def leaderboard_entry(
    participant_id: int,
    display_name: str,
    problems: list,
    accepted_submissions: list,
    wrong_counts: dict,
    contest_start_ts: float,
) -> dict:
    """
    Build a single leaderboard row for one participant.

    :param participant_id: DB id of the participant
    :param display_name: human-readable name
    :param problems: list of problem dicts from the contest (must have titleSlug + difficulty)
    :param accepted_submissions: list of ContestSubmission ORM objects with verdict='accepted'
    :param wrong_counts: dict mapping problem_slug -> number of wrong submissions
    :param contest_start_ts: contest start time as Unix timestamp (float)
    :return: dict ready to be serialised as JSON
    """
    problem_difficulty = {p["titleSlug"]: p["difficulty"] for p in problems}
    total_score = 0.0
    solved_details = []

    for sub in accepted_submissions:
        slug = sub.problem_slug
        difficulty = problem_difficulty.get(slug, "Medium")
        minutes_taken = (sub.submitted_at - contest_start_ts) / 60
        wrongs = wrong_counts.get(slug, 0)
        score = problem_score(difficulty, minutes_taken, wrongs)
        total_score += score
        solved_details.append(
            {
                "problem_slug": slug,
                "difficulty": difficulty,
                "minutes_taken": round(minutes_taken, 2),
                "wrong_attempts": wrongs,
                "score": score,
                "submitted_at": sub.submitted_at,
            }
        )

    return {
        "participant_id": participant_id,
        "display_name": display_name,
        "total_score": round(total_score, 4),
        "solved_count": len(accepted_submissions),
        "problems": solved_details,
    }
