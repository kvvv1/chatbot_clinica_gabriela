const sessions = {};

function getSession(userPhone) {
  return sessions[userPhone];
}

function setSession(userPhone, sessionId) {
  sessions[userPhone] = sessionId;
}

function clearSession(userPhone) {
  delete sessions[userPhone];
}

module.exports = {
  getSession,
  setSession,
  clearSession
}; 