(() => {
  const STORAGE_KEY = "work-hours-log-v1";

  const els = {
    name: document.getElementById("worker-name"),
    from: document.getElementById("date-from"),
    to: document.getElementById("date-to"),
    rate: document.getElementById("hourly-rate"),
    period: document.getElementById("period-label"),
    tables: document.getElementById("day-tables"),
    expenseBody: document.getElementById("expense-body"),
    totalDays: document.getElementById("total-days"),
    totalHours: document.getElementById("total-hours"),
    advance: document.getElementById("total-advance"),
    totalAmount: document.getElementById("total-amount"),
    totalExpenses: document.getElementById("total-expenses"),
    subTotal: document.getElementById("sub-total"),
    signature: document.getElementById("worker-signature"),
  };

  /** @type {{ date: string, start: string, end: string, breakHrs: string, amount: string, notes: string, off: boolean, done: boolean }[]} */
  let days = [];
  /** @type {{ date: string, description: string, amount: string }[]} */
  let expenses = [];

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function formatMoney(n) {
    return `$${n.toFixed(2)}`;
  }

  function parseTimeToMinutes(time) {
    if (!time) return null;
    const [h, m] = time.split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return h * 60 + m;
  }

  function normalizeDay(day) {
    return {
      date: day.date,
      start: day.start || "",
      end: day.end || "",
      breakHrs: day.breakHrs ?? "",
      amount: day.amount || "",
      notes: day.notes || "",
      off: Boolean(day.off),
      done: Boolean(day.done),
    };
  }

  function blankDay(date, { off = false } = {}) {
    return {
      date,
      start: off ? "" : "09:00",
      end: off ? "" : "20:00",
      breakHrs: off ? "" : "1",
      amount: "",
      notes: off ? "sunday" : "",
      off,
      done: false,
    };
  }

  function nextDateAfter(iso) {
    const d = new Date(iso + "T12:00:00");
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function calcHours(start, end, breakHrs, off) {
    if (off) return 0;
    const s = parseTimeToMinutes(start);
    const e = parseTimeToMinutes(end);
    if (s === null || e === null) return 0;
    let diff = e - s;
    if (diff < 0) diff += 24 * 60; // overnight shift
    const breakMinutes = Math.max(0, (parseFloat(breakHrs) || 0) * 60);
    const net = Math.max(0, diff - breakMinutes);
    return Math.round((net / 60) * 100) / 100;
  }

  function tickHTML(done) {
    return done
      ? `<span class="row-tick is-done" title="Saved" aria-label="Saved">✓</span>`
      : `<span class="row-tick" aria-hidden="true"></span>`;
  }

  function markDone(idx) {
    if (!days[idx]) return false;
    if (days[idx].done) return false;
    days[idx].done = true;
    return true;
  }

  function maybeAddRowAfterEdit(idx) {
    // After confirming a row, append a blank day if this was the last one
    if (idx !== days.length - 1) return false;
    addDayRow({ refreshAfter: false });
    return true;
  }

  function updateTickCell(row, done) {
    const cell = row.querySelector(".tick-cell");
    if (cell) cell.innerHTML = tickHTML(done);
  }

  function weekdayShort(iso) {
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("en-US", { weekday: "short" });
  }

  function monthDayLabel(iso) {
    const d = new Date(iso + "T12:00:00");
    return d.getDate();
  }

  function formatPeriod(from, to, name) {
    if (!from || !to) return "";
    const a = new Date(from + "T12:00:00");
    const b = new Date(to + "T12:00:00");
    const opts = { month: "short", day: "numeric" };
    const range = `${a.toLocaleDateString("en-US", opts)} – ${b.toLocaleDateString("en-US", { ...opts, year: "numeric" })}`;
    return name ? `${name.toUpperCase()}  ·  ${range}` : range;
  }

  function eachDate(from, to) {
    const list = [];
    if (!from || !to) return list;
    const start = new Date(from + "T12:00:00");
    const end = new Date(to + "T12:00:00");
    if (end < start) return list;
    const cur = new Date(start);
    while (cur <= end) {
      const iso = `${cur.getFullYear()}-${pad(cur.getMonth() + 1)}-${pad(cur.getDate())}`;
      list.push(iso);
      cur.setDate(cur.getDate() + 1);
    }
    return list;
  }

  function mergeDaysFromRange() {
    const range = eachDate(els.from.value, els.to.value);
    const byDate = Object.fromEntries(days.map((d) => [d.date, d]));
    days = range.map((date) => {
      const existing = byDate[date];
      if (existing) return normalizeDay(existing);
      const wd = weekdayShort(date);
      const isSunday = wd === "Sun";
      return blankDay(date, { off: isSunday });
    });
  }

  function addDayRow({ refreshAfter = true } = {}) {
    let date;
    if (days.length) {
      date = nextDateAfter(days[days.length - 1].date);
    } else if (els.from.value) {
      date = els.from.value;
    } else {
      date = new Date().toISOString().slice(0, 10);
      els.from.value = date;
    }

    let guard = 0;
    while (days.some((d) => d.date === date) && guard < 400) {
      date = nextDateAfter(date);
      guard += 1;
    }

    const wd = weekdayShort(date);
    days.push(blankDay(date, { off: wd === "Sun" }));

    if (!els.from.value || date < els.from.value) els.from.value = date;
    if (!els.to.value || date > els.to.value) els.to.value = date;

    if (refreshAfter) refresh();
  }

  function renderTables() {
    els.period.textContent = formatPeriod(els.from.value, els.to.value, els.name.value.trim());

    if (!days.length) {
      els.tables.innerHTML = `
        <div class="empty-state">
          <p>Select a date range to build your timesheet.</p>
        </div>`;
      return;
    }

    const mid = Math.ceil(days.length / 2);
    const left = days.slice(0, mid);
    const right = days.slice(mid);

    els.tables.innerHTML = [left, right]
      .filter((col) => col.length)
      .map((col, colIdx) => tableHTML(col, colIdx === 0 ? 0 : mid))
      .join("");
  }

  function tableHTML(rows, offset) {
    return `
      <div class="table-scroll">
      <table class="day-table">
        <thead>
          <tr>
            <th>Date</th>
            <th class="col-start">Start</th>
            <th class="col-end">End</th>
            <th class="col-break">Break</th>
            <th class="col-hours">Hrs</th>
            <th class="col-tick">✓</th>
            <th class="col-off no-print">OFF</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((day, i) => {
              const idx = offset + i;
              const hrs = calcHours(day.start, day.end, day.breakHrs, day.off);
              return `
              <tr class="day-row ${day.off ? "off" : ""} ${day.done ? "is-done" : ""}" data-idx="${idx}">
                <td class="date-cell" data-label="Date">
                  <span class="date-num">${monthDayLabel(day.date)}</span>
                  <small>${weekdayShort(day.date)}</small>
                </td>
                <td data-label="Start">
                  <input type="time" data-field="start" value="${day.start}" ${day.off ? "disabled" : ""} />
                </td>
                <td data-label="End">
                  <input type="time" data-field="end" value="${day.end}" ${day.off ? "disabled" : ""} />
                </td>
                <td data-label="Break (hrs)">
                  <input type="number" data-field="breakHrs" min="0" step="0.25" inputmode="decimal" value="${day.breakHrs}" placeholder="0" title="Break hours" ${day.off ? "disabled" : ""} />
                </td>
                <td class="hours-cell" data-label="Hours">${day.off ? "OFF" : hrs.toFixed(2)}</td>
                <td class="tick-cell" data-label="Saved">${tickHTML(day.done)}</td>
                <td class="off-cell no-print" data-label="OFF">
                  <label class="off-toggle">
                    <input type="checkbox" data-field="off" ${day.off ? "checked" : ""} />
                    <span class="off-text">OFF</span>
                  </label>
                </td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
      </div>`;
  }

  function escapeAttr(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  function renderExpenses() {
    if (!expenses.length) {
      els.expenseBody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align:center;color:var(--ink-soft);padding:0.6rem;">No expenses yet</td>
        </tr>`;
      return;
    }

    els.expenseBody.innerHTML = expenses
      .map(
        (ex, i) => `
      <tr data-ex-idx="${i}">
        <td><input type="date" data-ex="date" value="${ex.date}" /></td>
        <td><input type="text" data-ex="description" value="${escapeAttr(ex.description)}" placeholder="e.g. TAXI" /></td>
        <td><input type="number" data-ex="amount" min="0" step="0.01" value="${ex.amount}" placeholder="0.00" /></td>
        <td class="no-print"><button type="button" class="btn-icon" data-remove-ex="${i}" aria-label="Remove">×</button></td>
      </tr>`
      )
      .join("");
  }

  function updateSummary() {
    let workedDays = 0;
    let hours = 0;

    for (const day of days) {
      const h = calcHours(day.start, day.end, day.breakHrs, day.off);
      if (!day.off && h > 0) workedDays += 1;
      hours += h;
    }

    const rate = parseFloat(els.rate.value) || 0;
    const advance = parseFloat(els.advance.value) || 0;
    const expenseTotal = expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    const totalAmount = rate > 0 ? hours * rate : 0;
    const sub = totalAmount - advance - expenseTotal;

    els.totalDays.textContent = String(workedDays);
    els.totalHours.textContent = hours.toFixed(2);
    els.totalAmount.textContent = formatMoney(totalAmount);
    els.totalExpenses.textContent = formatMoney(expenseTotal);
    els.subTotal.textContent = formatMoney(sub);
  }

  function refresh() {
    renderTables();
    renderExpenses();
    updateSummary();
    save();
  }

  function save() {
    const data = {
      name: els.name.value,
      from: els.from.value,
      to: els.to.value,
      rate: els.rate.value,
      advance: els.advance.value,
      signature: els.signature.value,
      days,
      expenses,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (_) {
      /* ignore quota */
    }
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      els.name.value = data.name || "";
      els.from.value = data.from || "";
      els.to.value = data.to || "";
      els.rate.value = data.rate || "";
      els.advance.value = data.advance ?? "0";
      els.signature.value = data.signature || "";
      days = Array.isArray(data.days) ? data.days.map(normalizeDay) : [];
      expenses = Array.isArray(data.expenses) ? data.expenses : [];
      return true;
    } catch (_) {
      return false;
    }
  }

  function loadSample() {
    els.name.value = "RAZIB";
    els.from.value = "2025-06-16";
    els.to.value = "2025-06-30";
    els.rate.value = "";
    els.advance.value = "0";
    els.signature.value = "";

    const range = eachDate(els.from.value, els.to.value);
    days = range.map((date) => {
      const wd = weekdayShort(date);
      const day = monthDayLabel(date);
      if (wd === "Sun") {
        return { date, start: "", end: "", breakHrs: "", amount: "", notes: "sunday", off: true, done: true };
      }
      // Match handwritten pattern: 16–20,22–27: 9am–8pm; 29–30: 12–10pm; some 10pm ends
      let start = "09:00";
      let end = "20:00";
      if (day === 17 || day === 18 || day === 24 || day === 25 || day === 26) end = "22:00";
      if (day === 29 || day === 30) {
        start = "12:00";
        end = "22:00";
      }
      return { date, start, end, breakHrs: "1", amount: "", notes: "", off: false, done: true };
    });

    expenses = [{ date: "2025-07-06", description: "TAXI", amount: "21.70" }];
    refresh();
  }

  function clearAll() {
    if (!confirm("Clear all timesheet data?")) return;
    localStorage.removeItem(STORAGE_KEY);
    els.name.value = "";
    els.from.value = "";
    els.to.value = "";
    els.rate.value = "";
    els.advance.value = "0";
    els.signature.value = "";
    days = [];
    expenses = [];
    refresh();
  }

  // Events
  els.from.addEventListener("change", () => {
    mergeDaysFromRange();
    refresh();
  });
  els.to.addEventListener("change", () => {
    mergeDaysFromRange();
    refresh();
  });
  els.name.addEventListener("input", () => {
    els.period.textContent = formatPeriod(els.from.value, els.to.value, els.name.value.trim());
    save();
  });
  els.rate.addEventListener("input", () => {
    updateSummary();
    save();
  });
  els.advance.addEventListener("input", () => {
    updateSummary();
    save();
  });
  els.signature.addEventListener("input", save);

  els.tables.addEventListener("change", (e) => {
    const t = e.target;
    const row = t.closest(".day-row");
    if (!row) return;
    const idx = Number(row.dataset.idx);
    const field = t.dataset.field;
    if (!field || !days[idx]) return;

    if (field === "off") {
      days[idx].off = t.checked;
      if (t.checked) {
        days[idx].start = "";
        days[idx].end = "";
        days[idx].breakHrs = "";
        if (!days[idx].notes) days[idx].notes = "OFF";
      } else {
        days[idx].start = days[idx].start || "09:00";
        days[idx].end = days[idx].end || "20:00";
        days[idx].breakHrs = days[idx].breakHrs || "1";
        if (days[idx].notes === "OFF" || days[idx].notes === "sunday") {
          const wd = weekdayShort(days[idx].date);
          days[idx].notes = wd === "Sun" ? "" : days[idx].notes;
        }
      }
    } else {
      days[idx][field] = t.value;
    }

    const newlyDone = markDone(idx);
    if (newlyDone) maybeAddRowAfterEdit(idx);
    refresh();
  });

  els.tables.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.field === "off") return;
    const row = t.closest(".day-row");
    if (!row) return;
    const idx = Number(row.dataset.idx);
    const field = t.dataset.field;
    if (!field || !days[idx]) return;
    days[idx][field] = t.value;

    const newlyDone = markDone(idx);
    if (newlyDone) {
      maybeAddRowAfterEdit(idx);
      refresh();
      return;
    }

    // Live hours + tick update without full re-render
    if (field === "start" || field === "end" || field === "breakHrs") {
      const hrs = calcHours(days[idx].start, days[idx].end, days[idx].breakHrs, days[idx].off);
      const cell = row.querySelector(".hours-cell");
      if (cell) cell.textContent = days[idx].off ? "OFF" : hrs.toFixed(2);
      updateTickCell(row, days[idx].done);
      row.classList.toggle("is-done", days[idx].done);
      updateSummary();
      save();
    } else {
      updateSummary();
      save();
    }
  });

  els.expenseBody.addEventListener("input", (e) => {
    const t = e.target;
    const row = t.closest("tr");
    if (!row || row.dataset.exIdx === undefined) return;
    const idx = Number(row.dataset.exIdx);
    const field = t.dataset.ex;
    if (!field || !expenses[idx]) return;
    expenses[idx][field] = t.value;
    updateSummary();
    save();
  });

  els.expenseBody.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-remove-ex]");
    if (!btn) return;
    expenses.splice(Number(btn.dataset.removeEx), 1);
    refresh();
  });

  document.getElementById("btn-add-expense").addEventListener("click", () => {
    expenses.push({
      date: els.to.value || new Date().toISOString().slice(0, 10),
      description: "",
      amount: "",
    });
    refresh();
  });

  document.getElementById("btn-add-day").addEventListener("click", () => addDayRow());
  document.getElementById("btn-print").addEventListener("click", () => window.print());
  document.getElementById("btn-clear").addEventListener("click", clearAll);
  document.getElementById("btn-sample").addEventListener("click", loadSample);

  // Init
  if (!load()) {
    // Default to current half-month-ish empty prompt
    const now = new Date();
    const y = now.getFullYear();
    const m = pad(now.getMonth() + 1);
    const day = now.getDate();
    if (day <= 15) {
      els.from.value = `${y}-${m}-01`;
      els.to.value = `${y}-${m}-15`;
    } else {
      const last = new Date(y, now.getMonth() + 1, 0).getDate();
      els.from.value = `${y}-${m}-16`;
      els.to.value = `${y}-${m}-${pad(last)}`;
    }
    mergeDaysFromRange();
  } else if (els.from.value && els.to.value && !days.length) {
    mergeDaysFromRange();
  }

  refresh();
})();
