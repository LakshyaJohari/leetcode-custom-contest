from sqlalchemy import Column, Integer, String, Float, ForeignKey, JSON, DateTime
from sqlalchemy.orm import relationship
from database import Base
import datetime


class HostedContest(Base):
    """A contest that can be joined by multiple participants."""

    __tablename__ = "hosted_contests"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    # ISO datetime string stored as text for portability
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)
    # 'scheduled' | 'active' | 'finished'
    status = Column(String, default="scheduled")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # JSON list of problem dicts: [{title, titleSlug, difficulty, topicTags, ...}]
    problems = Column(JSON, default=list)

    participants = relationship("Participant", back_populates="contest", cascade="all, delete-orphan")


class Participant(Base):
    """A user who has joined a hosted contest."""

    __tablename__ = "participants"

    id = Column(Integer, primary_key=True, index=True)
    contest_id = Column(Integer, ForeignKey("hosted_contests.id"), nullable=False)
    display_name = Column(String, nullable=False)
    joined_at = Column(DateTime, default=datetime.datetime.utcnow)

    contest = relationship("HostedContest", back_populates="participants")
    submissions = relationship("ContestSubmission", back_populates="participant", cascade="all, delete-orphan")


class ContestSubmission(Base):
    """A problem solved (or attempted) by a participant during a hosted contest."""

    __tablename__ = "contest_submissions"

    id = Column(Integer, primary_key=True, index=True)
    participant_id = Column(Integer, ForeignKey("participants.id"), nullable=False)
    contest_id = Column(Integer, ForeignKey("hosted_contests.id"), nullable=False)
    problem_slug = Column(String, nullable=False)
    # 'accepted' | 'wrong'
    verdict = Column(String, nullable=False)
    # Unix timestamp of the submission
    submitted_at = Column(Float, nullable=False)
    # Score awarded for this submission (0 for wrong attempts)
    score = Column(Float, default=0.0)

    participant = relationship("Participant", back_populates="submissions")
