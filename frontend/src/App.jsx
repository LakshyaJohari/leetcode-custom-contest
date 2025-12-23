import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Settings, Play, Trophy, ExternalLink, Loader2, AlertCircle } from 'lucide-react';

const TAG_OPTIONS = [
  { name: "Array", slug: "array" }, { name: "DP", slug: "dynamic-programming" },
  { name: "Tree", slug: "tree" }, { name: "Graph", slug: "graph" },
  { name: "Greedy", slug: "greedy" }, { name: "Binary Search", slug: "binary-search" },
];

const POINTS = { 'Easy': 3, 'Medium': 5, 'Hard': 7 };

const App = () => {
  // --- CONFIG STATE ---
  const [username, setUsername] = useState(localStorage.getItem('lc_username') || "");
  const [cookie, setCookie] = useState(localStorage.getItem('lc_cookie') || "");
  const [mode, setMode] = useState("all");
  const [selectedTags, setSelectedTags] = useState([]);
  const [showConfig, setShowConfig] = useState(true);

  // --- CONTEST STATE ---
  const [contest, setContest] = useState([]);
  const [startTime, setStartTime] = useState(0); 
  const [endTime, setEndTime] = useState(0); 
  const [timeLeft, setTimeLeft] = useState(5400);
  const [isActive, setIsActive] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  
  // Progress now stores fails: { "slug": { solved: true, timeTaken: 12, fails: 2 } }
  const [progress, setProgress] = useState({});
  const [loading, setLoading] = useState(false);

  // --- 1. PERSISTENCE ---
  useEffect(() => {
    const savedState = localStorage.getItem('CONTEST_STATE');
    if (savedState) {
      const parsed = JSON.parse(savedState);
      const now = Date.now();
      if (parsed.isActive && parsed.endTime > now) {
        setContest(parsed.contest);
        setStartTime(parsed.startTime);
        setEndTime(parsed.endTime);
        setIsActive(true);
        setShowConfig(false);
        setProgress(parsed.progress);
        setMode(parsed.mode || "all");
        setTimeLeft(Math.floor((parsed.endTime - now) / 1000));
      } else if (parsed.isFinished) {
        setContest(parsed.contest);
        setIsFinished(true);
        setShowConfig(false);
        setProgress(parsed.progress);
      }
    }
  }, []);

  useEffect(() => {
    if (isActive || isFinished) {
      localStorage.setItem('CONTEST_STATE', JSON.stringify({
        contest, startTime, endTime, isActive, isFinished, progress, mode
      }));
    }
  }, [contest, startTime, endTime, isActive, isFinished, progress, mode]);

  // --- 2. LOGIC ---
  useEffect(() => {
    let interval = null;
    if (isActive && timeLeft > 0) {
      interval = setInterval(() => {
        const now = Date.now();
        const secondsRemaining = Math.max(0, Math.floor((endTime - now) / 1000));
        setTimeLeft(secondsRemaining);
        // Check every 15s
        if (secondsRemaining > 0 && secondsRemaining % 15 === 0) checkSubmissions();
      }, 1000);
    } else if (isActive && timeLeft <= 0) {
      finishContest();
    }
    return () => clearInterval(interval);
  }, [isActive, timeLeft, endTime]);

  const startContest = async () => {
    if (!username) return alert("Please enter your LeetCode Username!");
    setLoading(true);
    localStorage.setItem('lc_username', username);
    localStorage.setItem('lc_cookie', cookie);

    try {
      // REPLACE WITH YOUR BACKEND URL (Use localhost for testing)
      const res = await axios.post('http://lee-con-tom.onrender.com/create-contest', {
        session_cookie: cookie, selected_tags: selectedTags, mode: mode
      });
      
      const serverTime = res.data.server_time;
      setContest(res.data.contest);
      setStartTime(serverTime);
      setEndTime(Date.now() + 5400000); // 90 mins
      setTimeLeft(5400);
      setProgress({});
      setIsActive(true);
      setIsFinished(false);
      setShowConfig(false);
    } catch (err) {
      alert("Error starting contest. Ensure backend is running.");
    } finally {
      setLoading(false);
    }
  };

  const checkSubmissions = async () => {
    if (!isActive) return;
    try {
      const res = await axios.post('http://lee-con-tom.onrender.com/check-status', {
        username: username,
        problem_slugs: contest.map(p => p.titleSlug),
        contest_start_time: startTime
      });

      // Backend returns: { "slug": { "time": 123456, "fails": 2 } }
      const solvedMap = res.data;
      
      setProgress(prev => {
        const newProgress = { ...prev };
        let updated = false;
        Object.keys(solvedMap).forEach(slug => {
          if (!newProgress[slug]) {
            const data = solvedMap[slug];
            const timeTaken = Math.max(0, Math.floor((data.time - startTime) / 60));
            newProgress[slug] = { solved: true, timeTaken, fails: data.fails };
            updated = true;
          }
        });
        return updated ? newProgress : prev;
      });
    } catch (err) { console.error(err); }
  };

  const finishContest = () => { setIsActive(false); setIsFinished(true); };
  const resetTool = () => {
    localStorage.removeItem('CONTEST_STATE');
    setIsActive(false); setIsFinished(false); setShowConfig(true); setContest([]);
  };

  const calculateScore = () => {
    let score = 0;
    let totalPenaltyTime = 0;
    
    contest.forEach(p => {
      const stat = progress[p.titleSlug];
      if (stat?.solved) {
        score += POINTS[p.difficulty];
        // Standard LeetCode: Time + (5 mins * fails)
        totalPenaltyTime += stat.timeTaken + (stat.fails * 5);
      }
    });
    return { score, totalPenaltyTime };
  };

  // --- VERDICT LOGIC ---
  const getVerdict = (score, time) => {
    const totalPossible = contest.reduce((a,b) => a + POINTS[b.difficulty], 0);
    
    if (score === 0) return { title: "Participant", color: "text-gray-400" };
    if (score < 5) return { title: "Pupil (1200+)", color: "text-green-400" };
    if (score < 10) return { title: "Specialist (1400+)", color: "text-cyan-400" };
    if (score < totalPossible) return { title: "Expert (1600+)", color: "text-blue-400" };
    
    // If full score, check speed
    if (time < 45) return { title: "Guardian (2200+)", color: "text-red-500" }; // Super fast
    if (time < 70) return { title: "Knight (1900+)", color: "text-orange-400" };
    return { title: "Guardian (2000+)", color: "text-yellow-400" };
  };

  const formatTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  // --- RENDER ---
  const { score, totalPenaltyTime } = calculateScore();
  const verdict = isFinished ? getVerdict(score, totalPenaltyTime) : null;

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-8 font-sans">
      {/* Header */}
      <div className="flex justify-between items-center mb-8 border-b border-gray-700 pb-4">
        <h1 className="text-3xl font-bold text-orange-500">LeetCode Contest Sim</h1>
        {isActive ? (
          <div className="flex items-center gap-6">
            <div className={`text-2xl font-mono ${timeLeft < 600 ? 'text-red-500' : 'text-white'}`}>{formatTime(timeLeft)}</div>
            <button onClick={finishContest} className="bg-red-600 px-4 py-2 rounded font-bold">Submit</button>
          </div>
        ) : !showConfig && (
           <button onClick={resetTool} className="p-2 bg-gray-800 rounded text-sm">New Contest</button>
        )}
      </div>

      {/* Setup View */}
      {showConfig && (
        <div className="max-w-2xl mx-auto bg-gray-800 p-8 rounded-xl border border-gray-700">
           {/* ... (Same setup config inputs as before, kept brief for this snippet) ... */}
           <div className="mb-4">
             <label className="block text-gray-400 text-sm mb-1">LeetCode Username</label>
             <input value={username} onChange={e => setUsername(e.target.value)} className="w-full bg-gray-900 border border-gray-600 rounded p-2" />
           </div>
           <div className="mb-4">
             <label className="block text-gray-400 text-sm mb-1">Session Cookie (Optional)</label>
             <input type="password" value={cookie} onChange={e => setCookie(e.target.value)} className="w-full bg-gray-900 border border-gray-600 rounded p-2" />
           </div>
           
           <button onClick={startContest} disabled={loading} className="w-full bg-green-600 py-3 rounded font-bold flex justify-center items-center gap-2">
             {loading ? <Loader2 className="animate-spin" /> : <Play size={20} />} Start
           </button>
        </div>
      )}

      {/* Contest View */}
      {!showConfig && !isFinished && (
        <div className="max-w-5xl mx-auto space-y-4">
           {contest.map((p, idx) => {
             const stat = progress[p.titleSlug];
             return (
               <div key={idx} className={`p-5 rounded-xl border flex justify-between items-center ${stat?.solved ? 'bg-green-900/20 border-green-600' : 'bg-gray-800 border-gray-700'}`}>
                 <div>
                   <span className={`text-xs font-bold uppercase px-2 py-1 rounded mr-3 ${p.difficulty === 'Easy' ? 'text-green-400 bg-green-900' : p.difficulty === 'Medium' ? 'text-yellow-400 bg-yellow-900' : 'text-red-400 bg-red-900'}`}>{p.difficulty}</span>
                   <span className="text-xl font-semibold">{p.title}</span>
                 </div>
                 <div className="flex items-center gap-4">
                   {stat?.solved ? (
                     <div className="text-right">
                       <div className="text-green-400 font-bold flex items-center gap-2">
                         <Trophy size={16} /> Accepted
                       </div>
                       <div className="text-xs text-gray-400 font-mono">
                         {stat.timeTaken}m {stat.fails > 0 && <span className="text-red-400">({stat.fails} penalties)</span>}
                       </div>
                     </div>
                   ) : (
                     <a href={`https://leetcode.com/problems/${p.titleSlug}/`} target="_blank" rel="noreferrer" className="bg-blue-600 px-5 py-2 rounded font-bold flex items-center gap-2">
                       Solve <ExternalLink size={16} />
                     </a>
                   )}
                 </div>
               </div>
             );
           })}
        </div>
      )}

      {/* Results View */}
      {isFinished && (
        <div className="max-w-3xl mx-auto bg-gray-800 p-8 rounded-xl border border-gray-700 text-center">
           <Trophy size={64} className="mx-auto text-yellow-500 mb-4" />
           <h2 className="text-3xl font-bold mb-2">Contest Finished</h2>
           
           <div className="flex justify-center gap-8 mb-8">
             <div>
               <div className="text-sm text-gray-500">Score</div>
               <div className="text-4xl font-bold">{score} pts</div>
             </div>
             <div>
               <div className="text-sm text-gray-500">Effective Time</div>
               <div className="text-4xl font-bold">{totalPenaltyTime} min</div>
             </div>
           </div>

           <div className="mb-8 p-4 bg-gray-900 rounded-lg border border-gray-700">
             <div className="text-gray-400 text-sm mb-1">Estimated Performance Rating</div>
             <div className={`text-3xl font-black uppercase ${verdict.color}`}>{verdict.title}</div>
           </div>

           <table className="w-full text-left mb-8">
             <thead className="bg-gray-700 text-gray-300 text-xs uppercase">
               <tr>
                 <th className="p-3">Problem</th>
                 <th className="p-3">Result</th>
                 <th className="p-3">Time (+Penalty)</th>
                 <th className="p-3 text-right">Points</th>
               </tr>
             </thead>
             <tbody className="divide-y divide-gray-800">
               {contest.map((p, idx) => {
                 const stat = progress[p.titleSlug];
                 return (
                   <tr key={idx}>
                     <td className="p-3">{p.title}</td>
                     <td className={`p-3 font-bold ${stat?.solved ? 'text-green-500' : 'text-red-500'}`}>{stat?.solved ? "AC" : "--"}</td>
                     <td className="p-3 font-mono text-gray-400">
                       {stat?.solved ? <span>{stat.timeTaken}m <span className="text-red-500">+{stat.fails * 5}</span></span> : "--"}
                     </td>
                     <td className="p-3 text-right font-bold">{stat?.solved ? POINTS[p.difficulty] : 0}</td>
                   </tr>
                 );
               })}
             </tbody>
           </table>
           <button onClick={resetTool} className="bg-gray-700 hover:bg-gray-600 px-8 py-3 rounded font-bold">Start New Contest</button>
        </div>
      )}
    </div>
  );
};

export default App;