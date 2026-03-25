/**
 * Creates and manages a WebSocket connection to the leaderboard endpoint
 * for a hosted contest.
 *
 * @param {number} contestId - The hosted contest's database ID
 * @param {string} baseWsUrl - Base WebSocket URL, e.g. "wss://yourapi.com"
 * @param {function} onMessage - Callback invoked with parsed JSON payload on each message
 * @returns {{ close: function }} - Object with a close() method to disconnect
 */
export function createLeaderboardSocket(contestId, baseWsUrl, onMessage) {
  const url = `${baseWsUrl}/ws/contest/${contestId}`;
  const socket = new WebSocket(url);

  socket.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data);
      onMessage(payload);
    } catch (err) {
      console.error("[WS] Failed to parse message:", err);
    }
  };

  socket.onerror = (err) => {
    console.error("[WS] WebSocket error:", err);
  };

  socket.onclose = () => {
    console.info("[WS] WebSocket connection closed for contest", contestId);
  };

  return {
    close: () => socket.close(),
  };
}
