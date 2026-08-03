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

  /** @type {{ date: string, start: string, end: string, amount: string, notes: string, off: boolean }[]} */
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

  function calcHours(start, end, off) {
    if (off) return 0;
    const s = parseTimeToMinutes(start);
    const e = parseTimeToMinutes(end);
    if (s === null || e === null) return 0;
    let diff = e - s;
    if (diff < 0) diff += 24 * 60; // overnight shift
    return Math.round((diff / 60) * 100) / 100;
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
      if (existing) return existing;
      const wd = weekdayShort(date);
      const isSunday = wd === "Sun";
      return {
        date,
        start: isSunday ? "" : "09:00",
        end: isSunday ? "" : "20:00",
        amount: "",
        notes: isSunday ? "sunday" : "",
        off: isSunday,
      };
    });
  }

  function renderTables() {
    els.period.textContent = formatPeriod(els.from.value, els.to.value, els.name.value.trim());

    if (!days.length) {
      els.tables.innerHTML = `
        <div class="empty-state">
          <p>Select a date range to build your timesheet.</p>
          <p>选择日期范围以生成工时表。</p>
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
      <table class="day-table">
        <thead>
          <tr>
            <th><span class="zh">日期</span>Date</th>
            <th class="col-start"><span class="zh">开始</span>Start</th>
            <th class="col-end"><span class="zh">结束</span>End</th>
            <th class="col-hours"><span class="zh">工时</span>Hrs</th>
            <th class="col-amount"><span class="zh">支银</span>Amt</th>
            <th class="col-notes"><span class="zh">签名/备注</span>Notes</th>
            <th class="col-off no-print"><span class="zh">休</span>OFF</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((day, i) => {
              const idx = offset + i;
              const hrs = calcHours(day.start, day.end, day.off);
              return `
              <tr class="day-row ${day.off ? "off" : ""}" data-idx="${idx}">
                <td class="date-cell">
                  ${monthDayLabel(day.date)}
                  <small>${weekdayShort(day.date)}</small>
                </td>
                <td>
                  <input type="time" data-field="start" value="${day.start}" ${day.off ? "disabled" : ""} />
                </td>
                <td>
                  <input type="time" data-field="end" value="${day.end}" ${day.off ? "disabled" : ""} />
                </td>
                <td class="hours-cell">${day.off ? "OFF" : hrs.toFixed(2)}</td>
                <td>
                  <input type="number" data-field="amount" min="0" step="0.01" value="${day.amount}" placeholder="—" ${day.off ? "disabled" : ""} />
                </td>
                <td>
                  <input type="text" class="notes-input" data-field="notes" value="${escapeAttr(day.notes)}" placeholder="—" />
                </td>
                <td class="no-print">
                  <label class="off-toggle">
                    <input type="checkbox" data-field="off" ${day.off ? "checked" : ""} />
                  </label>
                </td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>`;
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
    let dayAmounts = 0;

    for (const day of days) {
      const h = calcHours(day.start, day.end, day.off);
      if (!day.off && h > 0) workedDays += 1;
      hours += h;
      if (!day.off) dayAmounts += parseFloat(day.amount) || 0;
    }

    const rate = parseFloat(els.rate.value) || 0;
    const advance = parseFloat(els.advance.value) || 0;
    const expenseTotal = expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    const fromHours = rate > 0 ? hours * rate : 0;
    const totalAmount = fromHours + dayAmounts;
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
      days = Array.isArray(data.days) ? data.days : [];
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
        return { date, start: "", end: "", amount: "", notes: "sunday", off: true };
      }
      // Match handwritten pattern: 16–20,22–27: 9am–8pm; 29–30: 12–10pm; some 10pm ends
      let start = "09:00";
      let end = "20:00";
      if (day === 17 || day === 18 || day === 24 || day === 25 || day === 26) end = "22:00";
      if (day === 29 || day === 30) {
        start = "12:00";
        end = "22:00";
      }
      return { date, start, end, amount: "", notes: "", off: false };
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
        if (!days[idx].notes) days[idx].notes = "OFF";
      } else {
        days[idx].start = days[idx].start || "09:00";
        days[idx].end = days[idx].end || "20:00";
        if (days[idx].notes === "OFF" || days[idx].notes === "sunday") {
          const wd = weekdayShort(days[idx].date);
          days[idx].notes = wd === "Sun" ? "" : days[idx].notes;
        }
      }
    } else {
      days[idx][field] = t.value;
    }
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

    // Live hours update without full re-render for smoother typing
    if (field === "start" || field === "end") {
      const hrs = calcHours(days[idx].start, days[idx].end, days[idx].off);
      const cell = row.querySelector(".hours-cell");
      if (cell) cell.textContent = days[idx].off ? "OFF" : hrs.toFixed(2);
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
