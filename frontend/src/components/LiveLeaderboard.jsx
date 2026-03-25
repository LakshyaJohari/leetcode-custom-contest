import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { Trophy, RefreshCw } from 'lucide-react';
import { createLeaderboardSocket } from '../utils/websocket';

const API_BASE = import.meta.env.VITE_API_URL || 'https://lee-con-tom.onrender.com';

// Derive WebSocket base URL from the HTTP base URL
function toWsBase(httpBase) {
  return httpBase.replace(/^https/, 'wss').replace(/^http/, 'ws');
}

const DIFFICULTY_COLOR = {
  Easy: 'text-green-400',
  Medium: 'text-yellow-400',
  Hard: 'text-red-400',
};

const RANK_COLORS = ['text-yellow-400', 'text-gray-300', 'text-orange-500'];
const MAX_SLUG_DISPLAY_LENGTH = 12;

/**
 * LiveLeaderboard – displays real-time leaderboard for a hosted contest.
 *
 * Props:
 *   contestId     – numeric contest DB id
 *   contestStatus – 'scheduled' | 'active' | 'finished'
 */
const LiveLeaderboard = ({ contestId, contestStatus }) => {
  const [leaderboard, setLeaderboard] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const socketRef = useRef(null);

  const fetchLeaderboard = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/hosted-contest/${contestId}/leaderboard`);
      setLeaderboard(res.data.leaderboard);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('[Leaderboard] HTTP fetch error', err);
    }
  }, [contestId]);

  useEffect(() => {
    let cancelled = false;

    // Initial HTTP fetch (works even before WS connects)
    axios.get(`${API_BASE}/hosted-contest/${contestId}/leaderboard`)
      .then((res) => {
        if (!cancelled) {
          setLeaderboard(res.data.leaderboard);
          setLastUpdated(new Date());
        }
      })
      .catch((err) => console.error('[Leaderboard] HTTP fetch error', err));

    // Set up WebSocket for real-time updates when contest is active
    if (contestStatus === 'active') {
      const wsBase = toWsBase(API_BASE);
      const socket = createLeaderboardSocket(contestId, wsBase, (payload) => {
        if (payload.type === 'leaderboard' && !cancelled) {
          setLeaderboard(payload.data);
          setLastUpdated(new Date());
        }
      });
      socketRef.current = socket;
    }

    return () => {
      cancelled = true;
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [contestId, contestStatus]);

  // Poll every 15 s if WebSocket is not available (e.g. finished contest)
  useEffect(() => {
    if (contestStatus !== 'active') {
      const id = setInterval(fetchLeaderboard, 15000);
      return () => clearInterval(id);
    }
  }, [contestId, contestStatus, fetchLeaderboard]);

  const formatMins = (m) => {
    const mins = Math.floor(m);
    const secs = Math.round((m - mins) * 60);
    return `${mins}m${secs > 0 ? ` ${secs}s` : ''}`;
  };

  return (
    <div>
      {/* Status bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Trophy size={18} className="text-yellow-500" />
          <span className="font-bold text-white">Live Leaderboard</span>
          {contestStatus === 'active' && (
            <span className="flex items-center gap-1 text-xs text-green-400">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse inline-block" />
              Live
            </span>
          )}
        </div>
        <button
          onClick={fetchLeaderboard}
          className="text-gray-400 hover:text-white transition flex items-center gap-1 text-xs"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {lastUpdated && (
        <p className="text-xs text-gray-500 mb-3">
          Last updated: {lastUpdated.toLocaleTimeString()}
        </p>
      )}

      {leaderboard.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Trophy size={48} className="mx-auto mb-3 opacity-30" />
          <p>No participants yet. Be the first to join!</p>
        </div>
      ) : (
        <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-gray-700 text-gray-300 text-xs uppercase">
              <tr>
                <th className="p-4 w-12">Rank</th>
                <th className="p-4">Participant</th>
                <th className="p-4 text-center">Solved</th>
                <th className="p-4 text-right">Score</th>
                <th className="p-4 hidden md:table-cell">Problems</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {leaderboard.map((row, idx) => (
                <tr key={row.participant_id} className="hover:bg-gray-800/50 transition">
                  <td className="p-4">
                    <span
                      className={`font-black text-lg ${
                        RANK_COLORS[idx] || 'text-gray-400'
                      }`}
                    >
                      #{row.rank}
                    </span>
                  </td>
                  <td className="p-4 font-semibold text-white">{row.display_name}</td>
                  <td className="p-4 text-center font-mono text-gray-300">
                    {row.solved_count}
                  </td>
                  <td className="p-4 text-right font-bold text-orange-400">
                    {row.total_score.toFixed(2)}
                  </td>
                  <td className="p-4 hidden md:table-cell">
                    <div className="flex flex-wrap gap-2">
                      {row.problems.map((prob) => (
                        <span
                          key={prob.problem_slug}
                          className={`text-xs font-mono px-2 py-0.5 rounded bg-gray-800 border border-gray-600 ${
                            DIFFICULTY_COLOR[prob.difficulty] || 'text-gray-400'
                          }`}
                          title={`${prob.problem_slug} | ${formatMins(prob.minutes_taken)} | ${prob.wrong_attempts} wrong | ${prob.score} pts`}
                        >
                          {prob.problem_slug.slice(0, MAX_SLUG_DISPLAY_LENGTH)}
                          {prob.problem_slug.length > MAX_SLUG_DISPLAY_LENGTH ? '…' : ''}{' '}
                          <span className="text-gray-500">{formatMins(prob.minutes_taken)}</span>
                          {prob.wrong_attempts > 0 && (
                            <span className="text-red-400 ml-1">
                              (+{prob.wrong_attempts})
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default LiveLeaderboard;
