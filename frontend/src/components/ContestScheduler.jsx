import React, { useState } from 'react';
import axios from 'axios';
import { Calendar, Settings, Play, Loader2 } from 'lucide-react';

const TAG_OPTIONS = [
  { name: "Array", slug: "array" },
  { name: "String", slug: "string" },
  { name: "Dynamic Programming", slug: "dynamic-programming" },
  { name: "Math", slug: "math" },
  { name: "Tree", slug: "tree" },
  { name: "Graph", slug: "graph" },
  { name: "Hash Table", slug: "hash-table" },
  { name: "Binary Search", slug: "binary-search" },
  { name: "Greedy", slug: "greedy" },
  { name: "Stack", slug: "stack" },
];

const API_BASE = import.meta.env.VITE_API_URL || 'https://lee-con-tom.onrender.com';

/**
 * ContestScheduler – lets an organiser set up a hosted contest.
 * On success, calls onCreated({ id, title, start_time, end_time, status, problems }).
 */
const ContestScheduler = ({ onCreated }) => {
  const [title, setTitle] = useState('');
  const [startTime, setStartTime] = useState('');
  const [cookie, setCookie] = useState(localStorage.getItem('lc_cookie') || '');
  const [mode, setMode] = useState('all');
  const [selectedTags, setSelectedTags] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const toggleTag = (slug) =>
    setSelectedTags((prev) =>
      prev.includes(slug) ? prev.filter((t) => t !== slug) : [...prev, slug]
    );

  const handleCreate = async () => {
    setError('');
    if (!title.trim()) return setError('Please enter a contest title.');
    if (!startTime) return setError('Please select a start time.');

    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/hosted-contest/create`, {
        title: title.trim(),
        start_time: new Date(startTime).toISOString().replace('Z', ''),
        session_cookie: cookie,
        selected_tags: selectedTags,
        mode,
      });
      localStorage.setItem('lc_cookie', cookie);
      onCreated(res.data);
    } catch (err) {
      const detail = err.response?.data?.detail || 'Failed to create contest.';
      setError(detail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto bg-gray-800 p-8 rounded-xl border border-gray-700">
      <div className="flex items-center gap-2 mb-6 text-xl font-bold text-white border-b border-gray-700 pb-2">
        <Calendar className="text-orange-500" /> Schedule a Hosted Contest
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-900/40 border border-red-600 rounded text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Contest Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-gray-900 border border-gray-600 rounded p-3 focus:border-orange-500 outline-none"
            placeholder="e.g. Weekly Practice #1"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Start Date & Time</label>
          <input
            type="datetime-local"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="w-full bg-gray-900 border border-gray-600 rounded p-3 focus:border-orange-500 outline-none text-white"
          />
          <p className="text-xs text-gray-500 mt-1">Contest will run for 90 minutes.</p>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">LeetCode Session Cookie (optional – for solved/unsolved filter)</label>
          <input
            value={cookie}
            onChange={(e) => setCookie(e.target.value)}
            type="password"
            className="w-full bg-gray-900 border border-gray-600 rounded p-3 focus:border-orange-500 outline-none"
            placeholder="Paste LEETCODE_SESSION..."
          />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-2">Problem Pool</label>
          <div className="flex gap-2">
            {['all', 'unsolved', 'solved'].map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 py-2 rounded capitalize text-sm font-medium transition ${
                  mode === m ? 'bg-orange-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-2">Tags (Optional)</label>
          <div className="flex flex-wrap gap-2">
            {TAG_OPTIONS.map((tag) => (
              <button
                key={tag.slug}
                onClick={() => toggleTag(tag.slug)}
                className={`px-3 py-1 rounded text-xs border transition ${
                  selectedTags.includes(tag.slug)
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-transparent border-gray-600 text-gray-400 hover:border-gray-500'
                }`}
              >
                {tag.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <button
        onClick={handleCreate}
        disabled={loading}
        className={`w-full py-4 rounded-lg font-bold text-lg flex justify-center items-center gap-2 transition ${
          loading
            ? 'bg-orange-800 text-gray-400 cursor-not-allowed'
            : 'bg-orange-600 hover:bg-orange-500 text-white'
        }`}
      >
        {loading ? (
          <>
            <Loader2 className="animate-spin" /> Creating Contest…
          </>
        ) : (
          <>
            <Play size={20} /> Create & Schedule Contest
          </>
        )}
      </button>
    </div>
  );
};

export default ContestScheduler;
