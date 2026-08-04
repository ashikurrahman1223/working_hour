(() => {
  const STORAGE_KEY = "work-hours-log-v1";

  const els = {
    company: document.getElementById("company-name"),
    name: document.getElementById("worker-name"),
    fin: document.getElementById("worker-fin"),
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
    supervisor: document.getElementById("supervisor-signature"),
    supervisorCompany: document.getElementById("supervisor-company"),
    companyBottom: document.getElementById("company-bottom"),
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

  function updateCompanyBottom() {
    if (!els.companyBottom) return;
    const company = els.company.value.trim();
    els.companyBottom.textContent = company || "—";
  }

  function updatePeriodLabel() {
    const company = els.company.value.trim();
    const name = els.name.value.trim();
    const who = [company, name].filter(Boolean).join(" · ");
    els.period.textContent = formatPeriod(els.from.value, els.to.value, who);
    updateCompanyBottom();
  }

  function renderTables() {
    updatePeriodLabel();

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

  function getSummaryNumbers() {
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
    const sub = totalAmount - advance + expenseTotal;

    return {
      totalDays: workedDays,
      totalHours: Math.round(hours * 100) / 100,
      totalAmount: Math.round(totalAmount * 100) / 100,
      totalExpenses: Math.round(expenseTotal * 100) / 100,
      subTotal: Math.round(sub * 100) / 100,
    };
  }

  function updateSummary() {
    const summary = getSummaryNumbers();
    els.totalDays.textContent = String(summary.totalDays);
    els.totalHours.textContent = summary.totalHours.toFixed(2);
    els.totalAmount.textContent = formatMoney(summary.totalAmount);
    els.totalExpenses.textContent = formatMoney(summary.totalExpenses);
    els.subTotal.textContent = formatMoney(summary.subTotal);
  }

  function refresh() {
    renderTables();
    renderExpenses();
    updateSummary();
    save();
  }

  function buildPayload() {
    return {
      company: els.company.value,
      name: els.name.value,
      fin: els.fin.value,
      from: els.from.value,
      to: els.to.value,
      rate: els.rate.value,
      advance: els.advance.value,
      signature: els.signature.value,
      supervisor: els.supervisor.value,
      supervisorCompany: els.supervisorCompany.value,
      days,
      expenses,
      summary: getSummaryNumbers(),
    };
  }

  function save() {
    const data = buildPayload();
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
      els.company.value = data.company || "";
      els.name.value = data.name || "";
      els.fin.value = data.fin || "";
      els.from.value = data.from || "";
      els.to.value = data.to || "";
      els.rate.value = data.rate || "";
      els.advance.value = data.advance ?? "0";
      els.signature.value = data.signature || "";
      els.supervisor.value = data.supervisor || "";
      els.supervisorCompany.value = data.supervisorCompany || "";
      days = Array.isArray(data.days) ? data.days.map(normalizeDay) : [];
      expenses = Array.isArray(data.expenses) ? data.expenses : [];
      updateCompanyBottom();
      return true;
    } catch (_) {
      return false;
    }
  }

  function clearAll() {
    if (!confirm("Clear all timesheet data?")) return;
    localStorage.removeItem(STORAGE_KEY);
    els.company.value = "";
    els.name.value = "";
    els.fin.value = "";
    els.from.value = "";
    els.to.value = "";
    els.rate.value = "";
    els.advance.value = "0";
    els.signature.value = "";
    els.supervisor.value = "";
    els.supervisorCompany.value = "";
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
  els.company.addEventListener("input", () => {
    updatePeriodLabel();
    save();
  });
  els.name.addEventListener("input", () => {
    updatePeriodLabel();
    save();
  });
  els.fin.addEventListener("input", save);
  els.rate.addEventListener("input", () => {
    updateSummary();
    save();
  });
  els.advance.addEventListener("input", () => {
    updateSummary();
    save();
  });
  els.signature.addEventListener("input", save);
  els.supervisor.addEventListener("input", save);
  els.supervisorCompany.addEventListener("input", save);

  function syncRowView(row, idx) {
    const day = days[idx];
    if (!day || !row) return;
    const hrs = calcHours(day.start, day.end, day.breakHrs, day.off);
    const cell = row.querySelector(".hours-cell");
    if (cell) cell.textContent = day.off ? "OFF" : hrs.toFixed(2);
    updateTickCell(row, day.done);
    row.classList.toggle("is-done", day.done);
    row.classList.toggle("off", day.off);
    updateSummary();
    save();
  }

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
      markDone(idx);
      // OFF changes enabled/disabled inputs — needs a re-render
      refresh();
      return;
    }

    days[idx][field] = t.value;
    markDone(idx);
    syncRowView(row, idx);
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
    markDone(idx);

    if (field === "start" || field === "end" || field === "breakHrs") {
      syncRowView(row, idx);
      return;
    }

    updateSummary();
    save();
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

  function formatTime12(time) {
    if (!time) return "—";
    const [h, m] = time.split(":").map(Number);
    if (Number.isNaN(h)) return time;
    const suffix = h >= 12 ? "pm" : "am";
    const hour12 = h % 12 || 12;
    return m === 0 ? `${hour12}${suffix}` : `${hour12}:${pad(m)}${suffix}`;
  }

  function formatDateShort(iso) {
    if (!iso) return "—";
    const d = new Date(iso + "T12:00:00");
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function buildPrintDayTable(rows, startIndex) {
    const body = rows
      .map((day, i) => {
        const n = startIndex + i + 1;
        const net = calcHours(day.start, day.end, day.breakHrs, day.off);
        const brk = day.off ? "—" : day.breakHrs === "" || day.breakHrs == null ? "0" : day.breakHrs;
        if (day.off) {
          return `<tr class="off">
            <td class="num">${n}</td>
            <td class="date">${monthDayLabel(day.date)} <small>${weekdayShort(day.date)}</small></td>
            <td colspan="3">—</td>
            <td class="hrs">0.00</td>
          </tr>`;
        }
        return `<tr>
          <td class="num">${n}</td>
          <td class="date">${monthDayLabel(day.date)} <small>${weekdayShort(day.date)}</small></td>
          <td>${formatTime12(day.start)}</td>
          <td>${formatTime12(day.end)}</td>
          <td>${brk}</td>
          <td class="hrs">${net.toFixed(2)}</td>
        </tr>`;
      })
      .join("");

    return `<table class="ps-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Date</th>
          <th>Start</th>
          <th>End</th>
          <th>Break</th>
          <th>Hrs</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>`;
  }

  function summaryRow(label, value, extraClass = "") {
    return `<div class="ps-summary-row${extraClass ? ` ${extraClass}` : ""}"><span>${label}</span><span class="val">${value}</span></div>`;
  }

  function buildPrintSheet() {
    const root = document.getElementById("print-sheet");
    if (!root) return;

    const company = els.company.value.trim();
    const name = els.name.value.trim() || "Worker";
    const fin = els.fin.value.trim();
    const period = formatPeriod(els.from.value, els.to.value, "");
    const rate = parseFloat(els.rate.value) || 0;
    const advance = parseFloat(els.advance.value) || 0;

    let workedDays = 0;
    let offDays = 0;
    let netHours = 0;
    let breakHours = 0;

    for (const day of days) {
      const net = calcHours(day.start, day.end, day.breakHrs, day.off);
      const brk = day.off ? 0 : Math.max(0, parseFloat(day.breakHrs) || 0);
      netHours += net;
      breakHours += brk;
      if (day.off) offDays += 1;
      else if (net > 0) workedDays += 1;
    }

    const expenseRows = expenses.filter((e) => e.description || e.amount || e.date);
    const expenseTotal = expenseRows.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    const totalAmount = rate > 0 ? netHours * rate : 0;
    const sub = totalAmount - advance + expenseTotal;

    const mid = Math.ceil(days.length / 2) || 0;
    const left = days.slice(0, mid);
    const right = days.slice(mid);
    const dayCols = [
      left.length ? `<div>${buildPrintDayTable(left, 0)}</div>` : "",
      right.length ? `<div>${buildPrintDayTable(right, mid)}</div>` : "",
    ].join("");

    const summaryRows = [
      summaryRow("Worked Days", String(workedDays)),
      summaryRow("OFF Days", String(offDays)),
      summaryRow("Net Hours", netHours.toFixed(2)),
      summaryRow("Hourly Rate", rate > 0 ? `${formatMoney(rate)}/hr` : "—"),
      summaryRow("Total Amount", formatMoney(totalAmount)),
      summaryRow("Advance", formatMoney(advance)),
      summaryRow("Expenses (+)", formatMoney(expenseTotal)),
      summaryRow("Sub Total / Balance", formatMoney(sub), "total"),
    ];

    const expensesHTML = `
      <div class="ps-expenses">
        <h3 class="ps-block-title">Expenses (${expenseRows.length})</h3>
        <table class="ps-expense-table">
          <thead><tr><th>#</th><th>Date</th><th>Description</th><th>Amount</th></tr></thead>
          <tbody>
            ${
              expenseRows.length
                ? expenseRows
                    .map(
                      (e, i) => `<tr>
                        <td>${i + 1}</td>
                        <td>${formatDateShort(e.date)}</td>
                        <td>${escapeAttr(e.description || "—")}</td>
                        <td class="amt">${formatMoney(parseFloat(e.amount) || 0)}</td>
                      </tr>`
                    )
                    .join("")
                : `<tr><td colspan="4" class="empty">No expenses recorded</td></tr>`
            }
            <tr class="total-row">
              <td colspan="3"><strong>Expenses Total</strong></td>
              <td class="amt"><strong>${formatMoney(expenseTotal)}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>`;

    const signature = els.signature.value.trim();
    const supervisor = els.supervisor.value.trim();
    const supervisorCompany = els.supervisorCompany.value.trim();

    root.className = "print-sheet";
    root.innerHTML = `
      <header class="ps-header">
        <div class="ps-identity">
          ${company ? `<p class="ps-company">${escapeAttr(company)}</p>` : ""}
          <h1 class="ps-title">${escapeAttr(name)}</h1>
          <p class="ps-meta">${fin ? `<span>FIN ${escapeAttr(fin)}</span>` : ""}${fin ? "<span class='ps-dot'>·</span>" : ""}<span>${escapeAttr(period || "Working Hours Logs")}</span></p>
        </div>
        <div class="ps-stamp">
          <strong>Working Hours Logs</strong>
          <span>${escapeAttr(formatDateShort(els.from.value))} – ${escapeAttr(formatDateShort(els.to.value))}</span>
        </div>
      </header>

      <section class="ps-stats">
        <div><strong>${workedDays}</strong><span>Worked</span></div>
        <div><strong>${offDays}</strong><span>OFF</span></div>
        <div><strong>${netHours.toFixed(1)}</strong><span>Net Hrs</span></div>
        <div><strong>${breakHours.toFixed(1)}</strong><span>Break</span></div>
        <div><strong>${rate > 0 ? formatMoney(rate) : "—"}</strong><span>Rate</span></div>
        <div><strong>${formatMoney(totalAmount)}</strong><span>Amount</span></div>
        <div class="ps-stat-balance"><strong>${formatMoney(sub)}</strong><span>Balance</span></div>
      </section>

      <section class="ps-days">
        ${dayCols || "<p>No days in range.</p>"}
      </section>

      <section class="ps-footer">
        <div class="ps-left">
          ${expensesHTML}
          <div class="ps-signs">
            <div class="ps-sign">
              <span>Worker Signature</span>
              <div class="ps-sign-line">${escapeAttr(signature)}</div>
            </div>
            <div class="ps-sign">
              <span>Company</span>
              <div class="ps-sign-line ps-company-line">${escapeAttr(company || "—")}</div>
            </div>
            <div class="ps-sign">
              <span>Supervisor Signature</span>
              <div class="ps-sign-line">${escapeAttr(supervisor)}</div>
            </div>
            <div class="ps-sign">
              <span>Supervisor Company</span>
              <div class="ps-sign-line ps-company-line">${escapeAttr(supervisorCompany || "—")}</div>
            </div>
          </div>
        </div>
        <div class="ps-right">
          <h3 class="ps-block-title">Payroll Summary</h3>
          <div class="ps-summary">${summaryRows.join("")}</div>
        </div>
      </section>
    `;
  }

  function triggerPrint() {
    buildPrintSheet();
    requestAnimationFrame(() => {
      window.print();
    });
  }

  window.addEventListener("beforeprint", buildPrintSheet);
  document.getElementById("btn-print").addEventListener("click", (e) => {
    e.preventDefault();
    triggerPrint();
  });
  document.getElementById("btn-clear").addEventListener("click", clearAll);

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
