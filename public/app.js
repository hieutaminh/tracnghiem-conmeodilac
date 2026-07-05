/* =========================================================================
   STATE
   ========================================================================= */
const state = {
  tree: [],
  activeSubject: null,
  exam: null,        // { subject, file, title, time, questions[], highScore }
  mode: null,         // 'practice' | 'mock' | 'review'
  index: 0,
  answers: [],        // [{ selected, checked, correct }]
  timer: { remaining: null, intervalId: null },
};

const TYPE_LABEL = {
  TF: 'Đúng / Sai',
  SC4: 'Chọn 1 trong 4',
  MC4: 'Chọn nhiều trong 4',
  SC6: 'Chọn 1 trong 6',
  MC6: 'Chọn nhiều trong 6',
  ESSAY: 'Tự luận',
};

/* =========================================================================
   HELPERS
   ========================================================================= */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function normalize(s) {
  // .normalize('NFC') là bước quan trọng: tiếng Việt có dấu có thể được lưu
  // dưới 2 dạng Unicode khác nhau (NFC - dựng sẵn, hoặc NFD - tổ hợp) mà
  // nhìn y hệt nhau nhưng so sánh chuỗi (===) lại cho ra "khác". Nếu thiếu
  // bước này, một đáp án đúng (ví dụ "Đúng") có thể vẫn bị chấm là sai chỉ
  // vì file đề được soạn/lưu ở dạng Unicode khác với chuỗi trong code.
  return (s || '').toString().normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
}

function hasAnswer(a) {
  if (a.selected == null) return false;
  if (Array.isArray(a.selected)) return a.selected.length > 0;
  return a.selected !== '';
}

function isMulti(type) {
  return type === 'MC4' || type === 'MC6';
}

function gradeQuestion(q, userAnswer) {
  if (userAnswer == null) return false;
  if (q.type === 'ESSAY' || q.type === 'TF' || q.type === 'SC4' || q.type === 'SC6') {
    return normalize(userAnswer) === normalize(q.answer);
  }
  if (isMulti(q.type)) {
    const correctSet = (q.answer || '').split(',').map(normalize).filter(Boolean).sort();
    const userSet = (Array.isArray(userAnswer) ? userAnswer : []).map(normalize).sort();
    if (correctSet.length !== userSet.length) return false;
    return correctSet.every((v, i) => v === userSet[i]);
  }
  return false;
}

function roundScore(correct, total) {
  if (!total) return 0;
  return Math.round((correct / total) * 10 * 100) / 100;
}

/* =========================================================================
   HOME VIEW
   ========================================================================= */
async function loadTree() {
  const res = await fetch('/api/tree');
  const data = await res.json();
  state.tree = data.tree || [];
  if (!state.tree.find((s) => s.subject === state.activeSubject)) {
    state.activeSubject = state.tree.length ? state.tree[0].subject : null;
  }
  renderSubjectList();
  renderExamBoard();
}

function renderSubjectList() {
  const wrap = document.getElementById('subject-list');
  wrap.innerHTML = '';
  state.tree.forEach((s) => {
    const btn = document.createElement('button');
    btn.className = 'subject-btn' + (s.subject === state.activeSubject ? ' active' : '');
    btn.innerHTML = `<span>${escapeHtml(s.subject)}</span><span class="count">${s.exams.length}</span>`;
    btn.addEventListener('click', () => {
      state.activeSubject = s.subject;
      renderSubjectList();
      renderExamBoard();
    });
    wrap.appendChild(btn);
  });
}

function renderExamBoard() {
  const board = document.getElementById('exam-board');
  board.innerHTML = '';

  if (!state.tree.length) {
    board.innerHTML = `<div class="empty-state">Chưa có đề nào trong thư mục <code>data/</code>.<br>
      Sao chép file .txt đề thi vào <code>data/&lt;Tên môn học&gt;/</code> rồi tải lại trang.</div>`;
    return;
  }

  const subj = state.tree.find((s) => s.subject === state.activeSubject);
  if (!subj) return;

  const heading = document.createElement('div');
  heading.className = 'board-heading';
  heading.textContent = `${subj.subject} · ${subj.exams.length} đề`;
  board.appendChild(heading);

  if (!subj.exams.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Môn này chưa có đề .txt nào trong thư mục tương ứng.';
    board.appendChild(empty);
    return;
  }

  subj.exams.forEach((e) => {
    const row = document.createElement('div');
    row.className = 'exam-row';
    const timeText = e.timeLimit ? `${e.timeLimit} phút` : 'Không giới hạn tg';
    row.innerHTML = `
      <div class="exam-row-main">
        <div class="exam-row-title">${escapeHtml(e.title)}</div>
        <div class="exam-row-meta">
          <span>${e.questionCount} câu</span>
          <span>${timeText}</span>
          ${e.highScore != null ? `<span class="high-score-badge">${Number(e.highScore).toFixed(2)}/10</span>` : ''}
        </div>
      </div>
      <div class="exam-row-actions">
        <button class="btn btn-practice" data-mode="practice">Luyện tập</button>
        <button class="btn btn-mock" data-mode="mock">Thi thử</button>
      </div>
    `;
    row.querySelectorAll('button[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => openExam(subj.subject, e.file, btn.dataset.mode));
    });
    board.appendChild(row);
  });
}

function goHome() {
  stopTimer();
  document.getElementById('view-exam').classList.add('hidden');
  document.getElementById('view-home').classList.remove('hidden');
  state.exam = null;
  state.mode = null;
  loadTree();
}

/* =========================================================================
   EXAM VIEW — OPEN / MODE CHIP / TIMER
   ========================================================================= */
async function openExam(subject, file, mode) {
  const res = await fetch(`/api/exam?subject=${encodeURIComponent(subject)}&file=${encodeURIComponent(file)}`);
  if (!res.ok) {
    alert('Không tải được đề này. Kiểm tra lại định dạng file .txt.');
    return;
  }
  const data = await res.json();
  if (!data.questions || !data.questions.length) {
    alert('Đề này chưa có câu hỏi nào hợp lệ. Kiểm tra lại định dạng file .txt.');
    return;
  }

  state.exam = data;
  state.mode = mode;
  state.index = 0;
  state.answers = data.questions.map(() => ({ selected: null, checked: false, correct: null }));

  document.getElementById('view-home').classList.add('hidden');
  document.getElementById('view-exam').classList.remove('hidden');
  document.getElementById('exam-title').textContent = data.title;
  document.getElementById('score-banner').classList.add('hidden');
  setModeChip();

  stopTimer();
  const timerEl = document.getElementById('timer');
  if (mode === 'mock' && data.time) {
    timerEl.classList.remove('hidden');
    startTimer(data.time * 60);
  } else {
    timerEl.classList.add('hidden');
  }

  render();
}

function setModeChip() {
  const chip = document.getElementById('mode-chip');
  chip.classList.remove('mock', 'review');
  if (state.mode === 'practice') chip.textContent = 'Luyện tập';
  else if (state.mode === 'mock') { chip.textContent = 'Thi thử'; chip.classList.add('mock'); }
  else if (state.mode === 'review') { chip.textContent = 'Đáp án'; chip.classList.add('review'); }
}

function startTimer(seconds) {
  state.timer.remaining = seconds;
  updateTimerDisplay();
  state.timer.intervalId = setInterval(() => {
    state.timer.remaining -= 1;
    updateTimerDisplay();
    if (state.timer.remaining <= 0) {
      stopTimer();
      finishMock(true);
    }
  }, 1000);
}

function stopTimer() {
  if (state.timer.intervalId) {
    clearInterval(state.timer.intervalId);
    state.timer.intervalId = null;
  }
}

function updateTimerDisplay() {
  const el = document.getElementById('timer');
  const s = Math.max(0, state.timer.remaining);
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  el.textContent = `${mm}:${ss}`;
  el.classList.toggle('low', s <= 60);
}

/* =========================================================================
   RENDER — QUESTION NAV GRID
   ========================================================================= */
function getCellState(i) {
  const a = state.answers[i];
  if (state.mode === 'mock') return hasAnswer(a) ? 'blue' : 'gray';
  if (state.mode === 'practice') {
    if (!a.checked) return hasAnswer(a) ? 'blue' : 'gray';
    return a.correct ? 'green' : 'red';
  }
  if (state.mode === 'review') {
    if (!hasAnswer(a)) return 'gray';
    return a.correct ? 'green' : 'red';
  }
  return 'gray';
}

function renderNavGrid() {
  const grid = document.getElementById('question-grid');
  grid.innerHTML = '';
  state.exam.questions.forEach((q, i) => {
    const cell = document.createElement('div');
    const st = getCellState(i);
    cell.className = `q-cell state-${st}` + (i === state.index ? ' current' : '');
    cell.textContent = String(i + 1);
    cell.title = `Câu ${i + 1}`;
    cell.addEventListener('click', () => { state.index = i; render(); });
    grid.appendChild(cell);
  });
  renderLegend();
}

function renderLegend() {
  const legend = document.getElementById('nav-legend');
  let items;
  if (state.mode === 'mock') items = [['gray', 'Chưa làm'], ['blue', 'Đã làm']];
  else if (state.mode === 'practice') items = [['gray', 'Chưa làm'], ['blue', 'Đã làm'], ['red', 'Làm sai'], ['green', 'Làm đúng']];
  else items = [['gray', 'Chưa làm'], ['red', 'Sai'], ['green', 'Đúng']];
  legend.innerHTML = items.map(([cls, label]) =>
    `<span class="legend-item"><span class="legend-dot" style="background:var(--${cls})"></span>${label}</span>`
  ).join('');
}

/* =========================================================================
   RENDER — QUESTION CONTENT
   ========================================================================= */
function renderQuestion() {
  const q = state.exam.questions[state.index];
  const a = state.answers[state.index];
  const container = document.getElementById('question-content');
  container.innerHTML = '';

  const idx = document.createElement('div');
  idx.className = 'q-index';
  idx.textContent = `Câu ${state.index + 1} / ${state.exam.questions.length} · ${TYPE_LABEL[q.type] || q.type}`;
  container.appendChild(idx);

  const text = document.createElement('div');
  text.className = 'q-text';
  text.textContent = q.content;
  container.appendChild(text);

  const locked = state.mode === 'review' || (state.mode === 'practice' && a.checked);
  const showColors = locked;

  if (q.type === 'ESSAY') {
    renderEssay(container, q, a, locked, showColors);
  } else {
    const options = q.type === 'TF' ? [{ key: 'Đúng', text: 'Đúng' }, { key: 'Sai', text: 'Sai' }] : (q.options || []);
    renderOptions(container, q, a, options, isMulti(q.type), locked, showColors);
  }

  if (showColors && q.explain) {
    const exp = document.createElement('div');
    exp.className = 'q-explain';
    exp.innerHTML = `<span class="q-explain-label">Giải thích</span>${escapeHtml(q.explain)}`;
    container.appendChild(exp);
  }

  if (state.mode === 'review') {
    const note = document.createElement('div');
    note.className = 'q-locked-note';
    note.textContent = 'Màn hình xem đáp án — không thể làm lại câu này.';
    container.appendChild(note);
  }
}

function renderOptions(container, q, a, options, multi, locked, showColors) {
  const wrap = document.createElement('div');
  wrap.className = 'q-options';

  options.forEach((opt) => {
    const el = document.createElement('div');
    el.className = 'q-option';
    const isSelected = multi
      ? (Array.isArray(a.selected) && a.selected.includes(opt.key))
      : a.selected === opt.key;
    if (isSelected) el.classList.add('selected');

    if (showColors) {
      const correctSet = (q.answer || '').split(',').map(normalize);
      const isCorrectOpt = correctSet.includes(normalize(opt.key));
      if (isCorrectOpt) el.classList.add('correct');
      else if (isSelected && !isCorrectOpt) el.classList.add('wrong');
    }
    if (locked) el.classList.add('locked');

    el.innerHTML = `<span class="opt-mark">${escapeHtml(opt.key)}</span><span>${escapeHtml(opt.text)}</span>`;

    if (!locked) {
      el.addEventListener('click', () => {
        if (multi) {
          if (!Array.isArray(a.selected)) a.selected = [];
          const idx = a.selected.indexOf(opt.key);
          if (idx >= 0) a.selected.splice(idx, 1); else a.selected.push(opt.key);
        } else {
          a.selected = opt.key;
        }
        render();
      });
    }
    wrap.appendChild(el);
  });

  container.appendChild(wrap);
}

function renderEssay(container, q, a, locked, showColors) {
  const input = document.createElement('textarea');
  input.className = 'q-essay-input';
  input.rows = 2;
  input.placeholder = 'Nhập câu trả lời...';
  input.value = a.selected || '';
  if (locked) input.disabled = true;
  if (showColors) input.classList.add(a.correct ? 'correct' : 'wrong');

  input.addEventListener('input', (e) => {
    a.selected = e.target.value;
    renderNavGrid();
    updateControlsState();
  });
  container.appendChild(input);

  if (showColors && !a.correct) {
    const reveal = document.createElement('div');
    reveal.className = 'q-answer-reveal';
    reveal.innerHTML = `Đáp án đúng: <b>${escapeHtml(q.answer)}</b>`;
    container.appendChild(reveal);
  }
}

/* =========================================================================
   CONTROLS (Back / Check / Next / End)
   ========================================================================= */
function updateControlsState() {
  const backBtn = document.getElementById('btn-back');
  const nextBtn = document.getElementById('btn-next');
  const checkBtn = document.getElementById('btn-check');
  const total = state.exam.questions.length;

  backBtn.disabled = state.index === 0;
  nextBtn.disabled = state.index === total - 1;

  if (state.mode === 'practice') {
    checkBtn.classList.remove('hidden');
    const a = state.answers[state.index];
    checkBtn.disabled = a.checked || !hasAnswer(a);
    checkBtn.textContent = a.checked ? 'Đã kiểm tra' : 'Check';
  } else {
    checkBtn.classList.add('hidden');
  }
}

function render() {
  renderQuestion();
  renderNavGrid();
  updateControlsState();
}

/* =========================================================================
   SCORING / FINISHING
   ========================================================================= */
function computeScore(forceGradeUnanswered) {
  const qs = state.exam.questions;
  let correctCount = 0;
  qs.forEach((q, i) => {
    const a = state.answers[i];
    if (forceGradeUnanswered && !a.checked) {
      a.correct = gradeQuestion(q, a.selected);
      a.checked = true;
    }
    if (a.checked && a.correct) correctCount += 1;
  });
  return { correctCount, total: qs.length, score: roundScore(correctCount, qs.length) };
}

async function postScore(score) {
  try {
    const res = await fetch('/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject: state.exam.subject, file: state.exam.file, score }),
    });
    return await res.json();
  } catch (e) {
    return null;
  }
}

async function finishPractice() {
  const { score } = computeScore(false);
  await postScore(score);
  goHome();
}

async function finishMock(forced) {
  stopTimer();
  const { score, correctCount, total } = computeScore(true);
  const result = await postScore(score);
  state.mode = 'review';
  state.index = 0;
  setModeChip();
  document.getElementById('timer').classList.add('hidden');
  showScoreBanner(score, correctCount, total, result, forced);
  render();
}

function showScoreBanner(score, correctCount, total, result, forced) {
  const banner = document.getElementById('score-banner');
  banner.classList.remove('hidden');
  const isNew = result && result.isNewRecord;
  const highScore = result ? result.highScore : score;
  banner.innerHTML = `
    ${forced ? '<div class="score-sub">⏰ Đã hết thời gian làm bài.</div>' : ''}
    <div class="score-value">${score.toFixed(2)}<span style="font-size:14px;color:var(--ink-faint)"> / 10</span></div>
    <div class="score-sub">${correctCount}/${total} câu đúng</div>
    <div class="score-sub">Điểm cao nhất: ${Number(highScore).toFixed(2)} / 10</div>
    ${isNew ? '<div class="score-record">★ Kỷ lục mới!</div>' : ''}
  `;
}

/* =========================================================================
   CONFIRM MODAL
   ========================================================================= */
function showConfirm(text, onConfirm) {
  const modal = document.getElementById('confirm-modal');
  document.getElementById('confirm-text').textContent = text;
  modal.classList.remove('hidden');
  const okBtn = document.getElementById('confirm-ok');
  const cancelBtn = document.getElementById('confirm-cancel');

  function cleanup() {
    modal.classList.add('hidden');
    okBtn.removeEventListener('click', onOk);
    cancelBtn.removeEventListener('click', onCancel);
  }
  function onOk() { cleanup(); onConfirm(); }
  function onCancel() { cleanup(); }

  okBtn.addEventListener('click', onOk);
  cancelBtn.addEventListener('click', onCancel);
}

/* =========================================================================
   EVENT WIRING (bound once)
   ========================================================================= */
document.getElementById('btn-back').addEventListener('click', () => {
  if (state.index > 0) { state.index -= 1; render(); }
});

document.getElementById('btn-next').addEventListener('click', () => {
  if (state.index < state.exam.questions.length - 1) { state.index += 1; render(); }
});

document.getElementById('btn-check').addEventListener('click', () => {
  if (state.mode !== 'practice') return;
  const a = state.answers[state.index];
  if (a.checked || !hasAnswer(a)) return;
  const q = state.exam.questions[state.index];
  a.correct = gradeQuestion(q, a.selected);
  a.checked = true;
  render();
});

document.getElementById('btn-end').addEventListener('click', () => {
  if (state.mode === 'review') { goHome(); return; }
  const text = state.mode === 'mock'
    ? 'Kết thúc bài thi thử? Bạn sẽ không thể chỉnh sửa câu trả lời sau khi kết thúc.'
    : 'Kết thúc buổi luyện tập và quay về danh sách đề?';
  showConfirm(text, () => {
    if (state.mode === 'practice') finishPractice();
    else if (state.mode === 'mock') finishMock(false);
  });
});

document.addEventListener('keydown', (e) => {
  if (document.getElementById('view-exam').classList.contains('hidden')) return;
  if (['TEXTAREA', 'INPUT'].includes(document.activeElement.tagName)) return;
  if (e.key === 'ArrowLeft') document.getElementById('btn-back').click();
  if (e.key === 'ArrowRight') document.getElementById('btn-next').click();
});

/* =========================================================================
   INIT
   ========================================================================= */
loadTree();
