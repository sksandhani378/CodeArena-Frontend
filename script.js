const DB_KEY = "codearena_assessments_v1";
const USER_KEY = "codearena_candidate_v1";
const ADMIN_KEY = "codearena_admin_v1";

const API_URL = "https://codearena-backend-qpz8.onrender.com/api/code/run";

let activeAssessment = null;
let timerInterval = null;
let remainingSeconds = 0;

const $ = id => document.getElementById(id);

function getAssessments() {
  try {
    return JSON.parse(localStorage.getItem(DB_KEY)) || [];
  } catch {
    return [];
  }
}

function saveAssessments(items) {
  localStorage.setItem(DB_KEY, JSON.stringify(items));
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function showMessage(id, message, error = false) {
  const element = $(id);
  if (!element) return;

  element.textContent = message;
  element.classList.remove("hidden");
  element.style.color = error ? "#ff6e83" : "#48d6a0";
}

function hide(id) {
  $(id)?.classList.add("hidden");
}

function show(id) {
  $(id)?.classList.remove("hidden");
}

/* =========================
   ADMIN
========================= */

function initAdmin() {
  if (sessionStorage.getItem(ADMIN_KEY) === "true") {
    showAdminDashboard();
  }

  $("adminLoginForm").addEventListener("submit", event => {
    event.preventDefault();

    if ($("adminPassword").value === "admin123") {
      sessionStorage.setItem(ADMIN_KEY, "true");
      showAdminDashboard();
    } else {
      alert("Incorrect admin password");
    }
  });

  $("adminLogout").addEventListener("click", () => {
    sessionStorage.removeItem(ADMIN_KEY);
    location.reload();
  });

  $("assessmentForm").addEventListener("submit", createAssessment);
}
function showAdminDashboard() {
  hide("adminLogin");
  show("adminDashboard");
  renderAdmin();
}

function createAssessment(event) {
  event.preventDefault();

  const title = $("assessmentTitle").value.trim();
  const candidateId = $("assignedCandidate").value.trim().toUpperCase();
  const difficulty = $("difficulty").value;
  const duration = Number($("duration").value);
  const lines = $("problems").value.trim().split("\n");

  const problems = [];
  const problemMap = new Map();

  for (const line of lines) {
    const parts = line.split("|").map(value => value.trim());

    if (parts.length !== 4 || parts.some(value => !value)) {
      showMessage(
        "adminMessage",
        "Each line needs: Problem name | URL | Input | Expected output",
        true
      );
      return;
    }

    const [name, url, input, expectedOutput] = parts;
    const key = name.toLowerCase() + "|" + url;

    if (!problemMap.has(key)) {
      const problem = {
        id: crypto.randomUUID(),
        name,
        url,
        testCases: [],
        status: "Not Started",
        sourceCode: "",
        passed: 0,
        total: 0
      };

      problemMap.set(key, problem);
      problems.push(problem);
    }

    problemMap.get(key).testCases.push({
      input,
      expectedOutput
    });
  }

  if (!problems.length) {
    showMessage("adminMessage", "Add at least one problem.", true);
    return;
  }

  const assessment = {
    id: crypto.randomUUID(),
    title,
    candidateId,
    difficulty,
    duration,
    problems,
    status: "Assigned",
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    expired: false
  };

  const assessments = getAssessments();
  assessments.push(assessment);
  saveAssessments(assessments);

  $("assessmentForm").reset();

  showMessage("adminMessage", "Interview assigned successfully!");
  renderAdmin();
}

function renderAdmin() {
  const assessments = getAssessments();

  $("adminTotal").textContent = assessments.length;

  $("adminActive").textContent =
    assessments.filter(item => item.status === "In Progress").length;

  $("adminFinished").textContent =
    assessments.filter(item =>
      ["Completed", "Expired"].includes(item.status)
    ).length;

  $("adminAssessmentList").innerHTML = assessments.length
    ? assessments.map(item => `
      <div class="assessment-card">
        <h3>${escapeHTML(item.title)}</h3>
        <p>Candidate: ${escapeHTML(item.candidateId)}</p>
        <p>Difficulty: ${escapeHTML(item.difficulty)}</p>
        <p>Problems: ${item.problems.length}</p>
        <p>Status: <b>${escapeHTML(item.status)}</b></p>
        <p>Accepted:
          ${item.problems.filter(p => p.status === "Accepted").length}
          / ${item.problems.length}
        </p>
      </div>
    `).join("")
    : "<p class='muted'>No interviews assigned yet.</p>";
}

/* =========================
   CANDIDATE
========================= */

function initCandidate() {
  const savedId = sessionStorage.getItem(USER_KEY);

  if (savedId) {
    $("candidateId").value = savedId;
    loginCandidate(savedId);
  }

  $("candidateLoginForm").addEventListener("submit", event => {
    event.preventDefault();
    loginCandidate($("candidateId").value.trim().toUpperCase());
  });

  $("logoutBtn").addEventListener("click", () => {
    sessionStorage.removeItem(USER_KEY);
    clearInterval(timerInterval);
    location.reload();
  });
}

function loginCandidate(candidateId) {
  if (!candidateId) return;

  sessionStorage.setItem(USER_KEY, candidateId);

  $("candidateName").textContent = candidateId;

  hide("loginSection");
  show("dashboardSection");
  hide("activeInterview");
  hide("reportArea");
  show("assessmentList");

  renderCandidateDashboard();
}
function renderCandidateDashboard() {
  const candidateId = sessionStorage.getItem(USER_KEY);

  const assessments = getAssessments().filter(
    item => item.candidateId === candidateId
  );

  $("assignedCount").textContent = assessments.length;

  $("completedCount").textContent =
    assessments.filter(item =>
      ["Completed", "Expired"].includes(item.status)
    ).length;

  $("activeCount").textContent =
    assessments.filter(item => item.status === "In Progress").length;

  $("assessmentList").innerHTML = assessments.length
    ? assessments.map(item => `
      <div class="assessment-card">
        <h3>${escapeHTML(item.title)}</h3>
        <p>Difficulty: ${escapeHTML(item.difficulty)}</p>
        <p>Duration: ${item.duration} minutes</p>
        <p>Status: <b>${escapeHTML(item.status)}</b></p>
        <p>Problems: ${item.problems.length}</p>
        <button class="btn primary"
          onclick="openAssessment('${item.id}')">
          ${item.status === "Assigned" ? "Start interview" :
            item.status === "In Progress" ? "Continue interview" :
            "View report"}
        </button>
      </div>
    `).join("")
    : "<p class='muted'>No interviews assigned to this ID.</p>";
}

function openAssessment(id) {
  const assessments = getAssessments();
  const assessment = assessments.find(item => item.id === id);

  if (!assessment ||
      assessment.candidateId !== sessionStorage.getItem(USER_KEY)) {
    alert("Assessment not found.");
    return;
  }

  if (assessment.status === "Completed" ||
      assessment.status === "Expired") {
    showReport(assessment);
    return;
  }

  activeAssessment = assessment;

  if (assessment.status === "Assigned") {
    assessment.status = "In Progress";
    assessment.startedAt = Date.now();
    assessment.deadline =
      Date.now() + assessment.duration * 60 * 1000;
    saveAssessments(assessments);
  }

  hide("assessmentList");
  hide("reportArea");
  show("activeInterview");

  renderActiveInterview();
  startCountdown();
}

function renderActiveInterview() {
  if (!activeAssessment) return;

  $("activeInterview").innerHTML = `
    <div class="panel">
      <button class="btn secondary" onclick="backToDashboard()">
        ← Dashboard
      </button>

      <h2>${escapeHTML(activeAssessment.title)}</h2>
      <p class="muted">
        Time remaining:
        <strong id="timerDisplay">--:--</strong>
      </p>

      <p class="hint">
        Use Java 13. Your program must contain
        <b>public class Main</b> and a main method.
      </p>

      <div id="problemWorkspace"></div>
    </div>
  `;

  $("problemWorkspace").innerHTML =
    activeAssessment.problems.map((problem, index) => `
      <div class="assessment-card">
        <h3>${index + 1}. ${escapeHTML(problem.name)}</h3>

        <p>
          <a href="${escapeHTML(problem.url)}"
             target="_blank" rel="noopener">
            View problem reference ↗
          </a>
        </p>

        <p>Status:
          <strong id="status-${problem.id}">
            ${escapeHTML(problem.status)}
          </strong>
        </p>

        <label>Java code</label>
        <textarea
          id="code-${problem.id}"
          rows="12"
          spellcheck="false"
          placeholder="public class Main {
    public static void main(String[] args) {
        System.out.println(&quot;Hello&quot;);
    }
}">${escapeHTML(problem.sourceCode)}</textarea>

        <button class="btn primary"
          onclick="runProblem('${problem.id}')">
          ▶ Run Code
        </button>

        <div id="result-${problem.id}"></div>
      </div>
    `).join("");
}

async function runProblem(problemId) {
  if (!activeAssessment) return;

  const problem = activeAssessment.problems.find(
    item => item.id === problemId
  );

  if (!problem) return;

  const code = $(`code-${problemId}`).value.trim();

  if (!code) {
    alert("Please write Java code first.");
    return;
  }

  const button = document.querySelector(
    `button[onclick="runProblem('${problemId}')"]`
  );

  button.disabled = true;
  button.textContent = "Running...";

  const resultArea = $(`result-${problemId}`);
  resultArea.innerHTML = "<p>Executing test cases...</p>";

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        sourceCode: code,
        testCases: problem.testCases
      })
    });
if (!response.ok) {
      throw new Error("Backend error: " + response.status);
    }

    const result = await response.json();

    problem.sourceCode = code;
    problem.passed = result.passed;
    problem.total = result.total;
    problem.status = result.accepted ? "Accepted" : "Not Accepted";

    saveCurrentAssessment();

    $(`status-${problemId}`).textContent = problem.status;

    resultArea.innerHTML = `
      <h3>${escapeHTML(result.verdict)}</h3>
      <p>Passed: ${result.passed} / ${result.total}</p>
      ${result.results.map(test => `
        <div class="test-result">
          <p><b>Test ${test.testCase}: ${escapeHTML(test.status)}</b></p>
          <p>Expected: ${escapeHTML(test.expectedOutput)}</p>
          <p>Actual: ${escapeHTML(test.actualOutput)}</p>
          <p>${escapeHTML(test.message)}</p>
        </div>
      `).join("")}
    `;

  } catch (error) {
    resultArea.innerHTML = `
      <p style="color:#ff6e83">
        Could not run code. ${escapeHTML(error.message)}
      </p>
      <p class="hint">
        Check backend availability and frontend CORS settings.
      </p>
    `;
  } finally {
    button.disabled = false;
    button.textContent = "▶ Run Code";
  }
}

function saveCurrentAssessment() {
  const assessments = getAssessments();
  const index = assessments.findIndex(
    item => item.id === activeAssessment.id
  );

  if (index !== -1) {
    assessments[index] = activeAssessment;
    saveAssessments(assessments);
  }
}

/* =========================
   TIMER
========================= */

function startCountdown() {
  clearInterval(timerInterval);

  function updateTimer() {
    if (!activeAssessment) return;

    remainingSeconds = Math.max(
      0,
      Math.floor((activeAssessment.deadline - Date.now()) / 1000)
    );

    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;

    const display = $("timerDisplay");

    if (display) {
      display.textContent =
        `${String(minutes).padStart(2, "0")}:` +
        `${String(seconds).padStart(2, "0")}`;
    }

    if (remainingSeconds <= 0) {
      clearInterval(timerInterval);
      finishAssessment(true);
    }
  }

  updateTimer();
  timerInterval = setInterval(updateTimer, 1000);
}

/* =========================
   REPORT
========================= */
function finishAssessment(expired = false) {
  if (!activeAssessment) return;

  clearInterval(timerInterval);

  activeAssessment.status = expired ? "Expired" : "Completed";
  activeAssessment.expired = expired;
  activeAssessment.completedAt = Date.now();

  saveCurrentAssessment();

  showReport(activeAssessment);
}

function showReport(assessment) {
  activeAssessment = assessment;

  clearInterval(timerInterval);

  hide("activeInterview");
  hide("assessmentList");
  show("reportArea");

  const accepted = assessment.problems.filter(
    problem => problem.status === "Accepted"
  ).length;

  $("reportArea").innerHTML = `
    <div class="panel">
      <h2>Interview report</h2>
      <h3>${escapeHTML(assessment.title)}</h3>

      <p>Status: <b>${escapeHTML(assessment.status)}</b></p>
      <p>Accepted problems: ${accepted} / ${assessment.problems.length}</p>

      ${assessment.problems.map(problem => `
        <div class="assessment-card">
          <h3>${escapeHTML(problem.name)}</h3>
          <p>Status: <b>${escapeHTML(problem.status)}</b></p>
          <p>Passed: ${problem.passed || 0} / ${problem.total || problem.testCases.length}</p>
        </div>
      `).join("")}

      <button class="btn primary" onclick="backToDashboard()">
        Back to dashboard
      </button>
    </div>
  `;
}

function backToDashboard() {
  clearInterval(timerInterval);
  activeAssessment = null;

  hide("activeInterview");
  hide("reportArea");
  show("assessmentList");

  renderCandidateDashboard();
}

/* =========================
   START APPLICATION
========================= */

document.addEventListener("DOMContentLoaded", () => {
  if (document.body.dataset.page === "candidate") {
    initCandidate();
  }

  if (document.body.dataset.page === "admin") {
    initAdmin();
  }
});

