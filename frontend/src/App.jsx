import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Timer, Settings, Play, Trophy, ExternalLink, Filter } from 'lucide-react';

// Define available tags for filtering
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

const POINTS = { 'Easy': 3, 'Medium': 5, 'Hard': 7 };

const App = () => {
  // --- CONFIG STATE ---
  const [username, setUsername] = useState(localStorage.getItem('lc_username') || "");
  const [cookie, setCookie] = useState(localStorage.getItem('lc_cookie') || "");
  const [mode, setMode] = useState("all"); // 'all', 'solved', 'unsolved'
  const [selectedTags, setSelectedTags] = useState([]);
  const [showConfig, setShowConfig] = useState(true);

  // --- CONTEST STATE ---
  const [contest, setContest] = useState([]);
  const [startTime, setStartTime] = useState(0); 
  const [timeLeft, setTimeLeft] = useState(5400);
  const [isActive, setIsActive] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [progress, setProgress] = useState({}); // { "slug": { solved: true, timeTaken: 12 } }

  // 1. Timer & Auto-Check Logic
  useEffect(() => {
    let interval = null;
    if (isActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((t) => t - 1);
        if (timeLeft % 15 === 0) checkSubmissions(); // Auto-check every 15s
      }, 1000);
    } else if (timeLeft === 0 && isActive) {
      finishContest();
    }
    return () => clearInterval(interval);
  }, [isActive, timeLeft]);

  // 2. Start Contest
  const startContest = async () => {
    if (!username) return alert("Please enter your LeetCode Username for tracking!");
    
    // Save settings
    localStorage.setItem('lc_username', username);
    localStorage.setItem('lc_cookie', cookie);

    try {
      // Send filters to backend
      const res = await axios.post('http://127.0.0.1:8000/create-contest', {
        session_cookie: cookie,
        selected_tags: selectedTags,
        mode: mode
      });
      
      const serverTime = res.data.server_time;
      setContest(res.data.contest);
      setStartTime(serverTime);
      setTimeLeft(5400);
      setProgress({});
      setIsActive(true);
      setIsFinished(false);
      setShowConfig(false);
    } catch (err) {
      console.error(err);
      alert("Error starting contest. If using 'Unsolved', ensure Cookie is valid.");
    }
  };

  // 3. Auto-Check Submissions
  const checkSubmissions = async () => {
    if (!isActive) return;
    const slugs = contest.map(p => p.titleSlug);
    try {
      const res = await axios.post('http://127.0.0.1:8000/check-status', {
        username: username,
        problem_slugs: slugs,
        contest_start_time: startTime
      });

      const solvedMap = res.data;
      setProgress(prev => {
        const newProgress = { ...prev };
        Object.keys(solvedMap).forEach(slug => {
          if (!newProgress[slug]) {
            const timeTakenSeconds = solvedMap[slug] - startTime;
            newProgress[slug] = { 
              solved: true, 
              timeTaken: Math.max(0, Math.floor(timeTakenSeconds / 60)) 
            };
          }
        });
        return newProgress;
      });
    } catch (err) {
      console.error("Auto-check failed", err);
    }
  };

  const finishContest = () => {
    setIsActive(false);
    setIsFinished(true);
  };

  const calculateTotalScore = () => {
    return contest.reduce((acc, p) => {
      return progress[p.titleSlug]?.solved ? acc + POINTS[p.difficulty] : acc;
    }, 0);
  };

  const toggleTag = (slug) => {
    setSelectedTags(prev => 
      prev.includes(slug) ? prev.filter(t => t !== slug) : [...prev, slug]
    );
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-8 font-sans">
      
      {/* HEADER */}
      <div className="flex justify-between items-center mb-8 border-b border-gray-700 pb-4">
        <h1 className="text-3xl font-bold text-orange-500">LeetCode Contest Sim</h1>
        
        {isActive ? (
          <div className="flex items-center gap-6">
            <div className={`text-2xl font-mono ${timeLeft < 600 ? 'text-red-500' : 'text-white'}`}>
              {formatTime(timeLeft)}
            </div>
            <button onClick={finishContest} className="bg-red-600 hover:bg-red-500 px-4 py-2 rounded font-bold">
              Submit Contest
            </button>
          </div>
        ) : (
           // Show settings button if not in active contest
           !showConfig && (
             <button onClick={() => setShowConfig(true)} className="p-2 bg-gray-800 rounded hover:bg-gray-700">
               <Settings size={20} />
             </button>
           )
        )}
      </div>

      {/* --- CONFIGURATION SCREEN --- */}
      {showConfig ? (
        <div className="max-w-3xl mx-auto bg-gray-800 p-8 rounded-xl border border-gray-700 animate-fade-in">
          <div className="flex items-center gap-2 mb-6 text-xl font-bold text-white border-b border-gray-700 pb-2">
            <Settings className="text-orange-500" /> Contest Setup
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Left Col: Identity */}
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-400">1. Identity</h3>
              <div>
                <label className="block text-sm text-gray-500 mb-1">LeetCode Username (Required)</label>
                <input 
                  value={username} onChange={e => setUsername(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-600 rounded p-3 focus:border-orange-500 outline-none"
                  placeholder="e.g. neal_wu"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 mb-1">Session Cookie (For 'Unsolved' Mode)</label>
                <input 
                  value={cookie} onChange={e => setCookie(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-600 rounded p-3 focus:border-orange-500 outline-none"
                  type="password"
                  placeholder="Paste LEETCODE_SESSION..."
                />
              </div>
            </div>

            {/* Right Col: Filters */}
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-400">2. Filters</h3>
              <div>
                <label className="block text-sm text-gray-500 mb-2">Problem Pool</label>
                <div className="flex gap-2">
                  {['all', 'unsolved', 'solved'].map((m) => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      className={`flex-1 py-2 rounded capitalize text-sm font-medium transition ${mode === m ? 'bg-orange-600 text-white' : 'bg-gray-700 text-gray-400'}`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-2">Tags (Optional)</label>
                <div className="flex flex-wrap gap-2">
                  {TAG_OPTIONS.map((tag) => (
                    <button
                      key={tag.slug}
                      onClick={() => toggleTag(tag.slug)}
                      className={`px-3 py-1 rounded text-xs border transition ${selectedTags.includes(tag.slug) ? 'bg-blue-600 border-blue-500 text-white' : 'bg-transparent border-gray-600 text-gray-400'}`}
                    >
                      {tag.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <button onClick={startContest} className="w-full mt-8 bg-green-600 hover:bg-green-500 py-4 rounded-lg font-bold text-lg flex justify-center items-center gap-2 transition">
            <Play size={20} /> Start Contest
          </button>
        </div>
      ) : (
        /* --- CONTEST ARENA --- */
        !isFinished && (
          <div className="max-w-5xl mx-auto space-y-4">
            <div className="flex justify-between text-gray-400 text-sm px-2">
              <span>Problem Set</span>
              <span>Live Status (Updates every 15s)</span>
            </div>
            {contest.map((p, idx) => {
              const status = progress[p.titleSlug];
              return (
                <div key={idx} className={`p-5 rounded-xl border flex justify-between items-center transition-all ${status?.solved ? 'bg-green-900/20 border-green-600 shadow-[0_0_15px_rgba(34,197,94,0.2)]' : 'bg-gray-800 border-gray-700 hover:border-gray-600'}`}>
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <span className={`text-xs font-bold uppercase px-2 py-1 rounded ${p.difficulty === 'Easy' ? 'bg-green-600/20 text-green-400' : p.difficulty === 'Medium' ? 'bg-yellow-600/20 text-yellow-400' : 'bg-red-600/20 text-red-400'}`}>
                        {p.difficulty}
                      </span>
                      <span className="text-gray-500 text-xs font-mono">{POINTS[p.difficulty]} pts</span>
                    </div>
                    <span className="text-xl font-semibold text-gray-100">{p.title}</span>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    {status?.solved ? (
                      <div className="text-right">
                        <div className="text-green-400 font-bold flex items-center gap-2">
                          <Trophy size={16} /> Accepted
                        </div>
                        <div className="text-xs text-green-600 font-mono">Time: {status.timeTaken} min</div>
                      </div>
                    ) : (
                      <a 
                        href={`https://leetcode.com/problems/${p.titleSlug}/`} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-lg font-bold flex items-center gap-2 transition"
                      >
                        Solve <ExternalLink size={16} />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* --- RESULTS SCREEN --- */}
      {isFinished && (
        <div className="max-w-2xl mx-auto bg-gray-800 p-8 rounded-xl border border-gray-700 text-center animate-fade-in">
          <Trophy size={64} className="mx-auto text-yellow-500 mb-4" />
          <h2 className="text-3xl font-bold mb-2">Contest Finished</h2>
          <div className="text-6xl font-bold text-white mb-8">
            {calculateTotalScore()} 
            <span className="text-2xl text-gray-500"> / {contest.reduce((a,b)=>a+POINTS[b.difficulty],0)} pts</span>
          </div>
          
          <div className="bg-gray-900 rounded-lg overflow-hidden border border-gray-700">
            <table className="w-full text-left">
              <thead className="bg-gray-700 text-gray-300 text-xs uppercase">
                <tr>
                  <th className="p-4">Problem</th>
                  <th className="p-4">Result</th>
                  <th className="p-4">Time</th>
                  <th className="p-4 text-right">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {contest.map((p, idx) => {
                  const stat = progress[p.titleSlug];
                  return (
                    <tr key={idx} className="hover:bg-gray-800/50">
                      <td className="p-4 text-sm font-medium">{p.title}</td>
                      <td className={`p-4 font-bold text-sm ${stat?.solved ? 'text-green-500' : 'text-red-500'}`}>
                        {stat?.solved ? "AC" : "Not Solved"}
                      </td>
                      <td className="p-4 font-mono text-sm text-gray-400">
                        {stat?.solved ? `${stat.timeTaken}m` : "--"}
                      </td>
                      <td className="p-4 text-right font-bold text-white">
                        {stat?.solved ? POINTS[p.difficulty] : 0}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          
          <button 
            onClick={() => {setIsFinished(false); setShowConfig(true);}} 
            className="mt-8 bg-gray-700 hover:bg-gray-600 text-white px-8 py-3 rounded-lg font-bold transition"
          >
            Start New Contest
          </button>
        </div>
      )}
    </div>
  );
};

export default App;