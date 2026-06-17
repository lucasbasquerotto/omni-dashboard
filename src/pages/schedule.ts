import { apiGet, type CronJob } from "../lib/api";

export function renderSchedule(container: HTMLElement): void {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Schedule</h1>
        <p class="page-subtitle">Scheduled tasks and cron jobs</p>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><span class="card-title">Active Jobs</span></div>
      <div class="card-body" id="cron-table">
        <div class="loading">Loading schedules</div>
      </div>
    </div>
  `;

  loadCronJobs();
}

async function loadCronJobs(): Promise<void> {
  const el = document.getElementById("cron-table")!;
  try {
    const jobs = await apiGet<CronJob[]>("/schedule");
    if (jobs.length === 0) {
      el.innerHTML = `<div class="empty-state">No scheduled jobs</div>`;
      return;
    }
    el.innerHTML = `
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Schedule</th>
              <th>Prompt</th>
              <th>Last Run</th>
              <th>Next Run</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${jobs
              .map(
                (j) => `
              <tr>
                <td style="color:var(--text-primary);font-weight:500;">${escapeHtml(j.name || j.id)}</td>
                <td><code style="background:var(--bg-card);padding:0.125rem 0.375rem;border-radius:3px;font-size:0.75rem;">${escapeHtml(j.schedule)}</code></td>
                <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-muted);font-size:0.8rem;">${escapeHtml(j.prompt_preview || "")}</td>
                <td>${formatDate(j.last_run)}</td>
                <td>${formatDate(j.next_run)}</td>
                <td><span class="badge ${j.enabled ? "badge-success" : "badge-neutral"}">${j.enabled ? "Active" : "Paused"}</span></td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  } catch (e) {
    el.innerHTML = `<div class="error-state">Failed to load schedules: ${e instanceof Error ? e.message : "Unknown error"}</div>`;
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
