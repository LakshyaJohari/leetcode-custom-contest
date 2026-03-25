import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { ExternalLink, Loader2, CheckCircle, XCircle, UserPlus, Play, StopCircle } from 'lucide-react';
import LiveLeaderboard from './LiveLeaderboard';

const API_BASE = import.meta.env.VITE_API_URL || 'https://lee-con-tom.onrender.com';
const POINTS = { Easy: 3, Medium: 5, Hard: 7 };

/**
 * ContestLobby – shown after a user joins (or enters) a hosted contest.
 *
 * Props:
 *   contest    – full contest object from the API
 *   onLeave    – callback to go back to the contest list
 */
const ContestLobby = ({ contest: initialContest, onLeave }) => {
  const [displayName, setDisplayName] = useState(
    () => localStorage.getItem('hc_display_name') || ''
  );
  const [participantId, setParticipantId] = useState(
    () => {
      const stored = localStorage.getItem(`hc_pid_${initialContest.id}`);
      return stored ? Number(stored) : null;
    }
  );
  const hostToken = localStorage.getItem(`hc_host_token_${initialContest.id}`);
  const isHost = !!hostToken;
  const [contest, setContest] = useState(initialContest);
  const [timeLeft, setTimeLeft] = useState(0);
  const [submitting, setSubmitting] = useState({});
  const [localProgress, setLocalProgress] = useState({});
  const [joinError, setJoinError] = useState('');
  const [joining, setJoining] = useState(false);
  const [ending, setEnding] = useState(false);
  const [activeTab, setActiveTab] = useState('problems');

  // Refresh contest status from the server every 30 s
  useEffect(() => {
    const refresh = async () => {
      try {
        const res = await axios.get(`${API_BASE}/hosted-contest/${contest.id}`);
        setContest(res.data);
      } catch {
        // ignore network errors during background refresh
      }
    };
    refresh();
    const id = setInterval(refresh, 30000);
    return () => clearInterval(id);
  }, [contest.id]);

  // Countdown timer
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const end = new Date(contest.end_time).getTime();
      const start = new Date(contest.start_time).getTime();
      if (now < start) {
        setTimeLeft(Math.floor((start - now) / 1000));
      } else {
        setTimeLeft(Math.max(0, Math.floor((end - now) / 1000)));
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [contest.start_time, contest.end_time]);

  const formatTime = (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  const handleJoin = async () => {
    setJoinError('');
    if (!displayName.trim()) return setJoinError('Please enter your name.');
    setJoining(true);
    try {
      const res = await axios.post(`${API_BASE}/hosted-contest/${contest.id}/join`, {
        display_name: displayName.trim(),
      });
      const pid = res.data.participant_id;
      setParticipantId(pid);
      localStorage.setItem('hc_display_name', displayName.trim());
      localStorage.setItem(`hc_pid_${contest.id}`, String(pid));
    } catch (err) {
      setJoinError(err.response?.data?.detail || 'Failed to join contest.');
    } finally {
      setJoining(false);
    }
  };

  const handleSubmit = useCallback(
    async (slug, verdict) => {
      if (!participantId || localProgress[slug]?.solved) return;
      setSubmitting((prev) => ({ ...prev, [slug]: true }));
      try {
        await axios.post(`${API_BASE}/hosted-contest/${contest.id}/submit`, {
          participant_id: participantId,
          problem_slug: slug,
          verdict,
        });
        if (verdict === 'accepted') {
          const now = Date.now();
          const startTs = new Date(contest.start_time).getTime();
          const minutes = Math.floor((now - startTs) / 60000);
          setLocalProgress((prev) => ({ ...prev, [slug]: { solved: true, minutes } }));
        }
      } catch (err) {
        console.error('Submit error', err);
      } finally {
        setSubmitting((prev) => ({ ...prev, [slug]: false }));
      }
    },
    [participantId, contest.id, contest.start_time, localProgress]
  );

  const isActive = contest.status === 'active';
  const isScheduled = contest.status === 'scheduled';
  const isFinished = contest.status === 'finished';

  const handleEndContest = async () => {
    if (!window.confirm('Are you sure you want to end this contest for all participants?')) return;
    setEnding(true);
    try {
      await axios.post(`${API_BASE}/hosted-contest/${contest.id}/end`, {
        host_token: hostToken,
      });
      setContest((prev) => ({ ...prev, status: 'finished' }));
    } catch (err) {
      console.error('End contest error', err);
    } finally {
      setEnding(false);
    }
  };

  const statusBadge = {
    scheduled: 'bg-yellow-900 text-yellow-400',
    active: 'bg-green-900 text-green-400',
    finished: 'bg-gray-700 text-gray-400',
  }[contest.status] || 'bg-gray-700 text-gray-400';

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">{contest.title}</h2>
          <div className="flex items-center gap-3 mt-1">
            <span className={`text-xs font-bold uppercase px-2 py-1 rounded ${statusBadge}`}>
              {contest.status}
            </span>
            {isScheduled && (
              <span className="text-gray-400 text-sm">
                Starts in <span className="font-mono text-yellow-400">{formatTime(timeLeft)}</span>
              </span>
            )}
            {isActive && (
              <span className={`text-sm font-mono font-bold ${timeLeft < 600 ? 'text-red-400' : 'text-white'}`}>
                {formatTime(timeLeft)} remaining
              </span>
            )}
            {isFinished && (
              <span className="text-gray-400 text-sm">Contest has ended</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isHost && (isActive || isScheduled) && (
            <button
              onClick={handleEndContest}
              disabled={ending}
              className="bg-red-700 hover:bg-red-600 disabled:bg-gray-700 text-white px-3 py-1 rounded font-bold transition text-sm flex items-center gap-1"
            >
              {ending ? <Loader2 size={14} className="animate-spin" /> : <StopCircle size={14} />}
              End Contest
            </button>
          )}
          <button
            onClick={onLeave}
            className="text-sm text-gray-400 hover:text-white px-3 py-1 border border-gray-600 rounded hover:border-gray-400 transition"
          >
            ← Back
          </button>
        </div>
      </div>

      {/* Join Panel */}
      {!participantId && (
        <div className="mb-6 bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="font-bold text-white mb-3 flex items-center gap-2">
            <UserPlus size={18} className="text-orange-500" /> Join this Contest
          </h3>
          {joinError && (
            <p className="text-red-400 text-sm mb-3">{joinError}</p>
          )}
          <div className="flex gap-3">
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              className="flex-1 bg-gray-900 border border-gray-600 rounded p-3 focus:border-orange-500 outline-none"
              placeholder="Enter your name…"
            />
            <button
              onClick={handleJoin}
              disabled={joining || isFinished}
              className="bg-orange-600 hover:bg-orange-500 disabled:bg-gray-700 text-white px-6 py-2 rounded font-bold transition flex items-center gap-2"
            >
              {joining ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
              Join
            </button>
          </div>
        </div>
      )}

      {participantId && (
        <p className="mb-4 text-sm text-gray-400">
          Participating as <span className="text-orange-400 font-bold">{displayName}</span>
        </p>
      )}

      {/* Tabs */}
      <div className="flex gap-4 mb-4 border-b border-gray-700">
        {['problems', 'leaderboard'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-2 capitalize text-sm font-medium transition border-b-2 ${
              activeTab === tab
                ? 'border-orange-500 text-orange-400'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Problems Tab */}
      {activeTab === 'problems' && (
        <div className="space-y-4">
          {(contest.problems || []).map((p, idx) => {
            const prog = localProgress[p.titleSlug];
            const isSolving = submitting[p.titleSlug];
            const canSubmit = participantId && isActive && !prog?.solved;

            return (
              <div
                key={idx}
                className={`p-5 rounded-xl border flex justify-between items-center transition-all ${
                  prog?.solved
                    ? 'bg-green-900/20 border-green-600'
                    : 'bg-gray-800 border-gray-700 hover:border-gray-600'
                }`}
              >
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <span
                      className={`text-xs font-bold uppercase px-2 py-1 rounded ${
                        p.difficulty === 'Easy'
                          ? 'bg-green-900 text-green-400'
                          : p.difficulty === 'Medium'
                          ? 'bg-yellow-900 text-yellow-400'
                          : 'bg-red-900 text-red-400'
                      }`}
                    >
                      {p.difficulty}
                    </span>
                    <span className="text-gray-500 text-xs font-mono">
                      {POINTS[p.difficulty]} pts
                    </span>
                  </div>
                  <span className="text-xl font-semibold text-gray-100">{p.title}</span>
                </div>

                <div className="flex items-center gap-3">
                  {prog?.solved ? (
                    <div className="text-right">
                      <div className="text-green-400 font-bold flex items-center gap-1">
                        <CheckCircle size={16} /> Accepted
                      </div>
                      <div className="text-xs text-gray-400 font-mono mt-1">
                        {prog.minutes} min
                      </div>
                    </div>
                  ) : (
                    <>
                      <a
                        href={`https://leetcode.com/problems/${p.titleSlug}/`}
                        target="_blank"
                        rel="noreferrer"
                        className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded font-bold flex items-center gap-2 transition text-sm"
                      >
                        Solve <ExternalLink size={14} />
                      </a>
                      {canSubmit && (
                        <div className="flex flex-col gap-1">
                          <button
                            onClick={() => handleSubmit(p.titleSlug, 'accepted')}
                            disabled={isSolving}
                            className="bg-green-700 hover:bg-green-600 text-white px-3 py-1.5 rounded text-xs font-bold transition flex items-center gap-1 disabled:opacity-50"
                          >
                            {isSolving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                            Mark AC
                          </button>
                          <button
                            onClick={() => handleSubmit(p.titleSlug, 'wrong')}
                            disabled={isSolving}
                            className="bg-red-900 hover:bg-red-800 text-red-300 px-3 py-1.5 rounded text-xs font-bold transition flex items-center gap-1 disabled:opacity-50"
                          >
                            <XCircle size={12} /> Wrong
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Leaderboard Tab */}
      {activeTab === 'leaderboard' && (
        <LiveLeaderboard contestId={contest.id} contestStatus={contest.status} />
      )}
    </div>
  );
};

export default ContestLobby;
