import { apiGet, type ProfileData } from "../lib/api";

export function renderProfiles(container: HTMLElement): void {
  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Profiles</h1>
      <p class="page-subtitle">Agent profile configurations and channel assignments</p>
    </div>
    <div id="profiles-content">
      <div class="loading" style="padding:3rem;text-align:center;">Loading profiles...</div>
    </div>
  `;
  void loadProfiles();
}

async function loadProfiles(): Promise<void> {
  const content = document.getElementById("profiles-content")!;
  try {
    const profiles = await apiGet<ProfileData[]>("/profiles");
    content.innerHTML = renderProfilesPage(profiles);
  } catch (e) {
    content.innerHTML = `<div class="error-state" style="padding:3rem;text-align:center;">Failed to load profiles: ${e instanceof Error ? e.message : "Unknown error"}</div>`;
  }
}

function renderProfilesPage(profiles: ProfileData[]): string {
  if (!profiles || profiles.length === 0) {
    return '<div class="empty-state">No profiles configured</div>';
  }

  return profiles
    .map(
      (p) => `
    <div class="card settings-card">
      <div class="card-header"><span class="card-title">${escapeHtml(p.name)}</span></div>
      <div class="card-body">
        <div class="setting-row">
          <div class="setting-controls">
            <div class="setting-name">Name</div>
            <div class="setting-readonly-value">
              <code class="setting-readonly-code">${escapeHtml(p.name)}</code>
            </div>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-controls">
            <div class="setting-name">Provider</div>
            <code class="setting-value-code">${escapeHtml(p.provider || "—")}</code>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-controls">
            <div class="setting-name">Model</div>
            <code class="setting-value-code">${escapeHtml(p.model || "—")}</code>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-controls">
            <div class="setting-name">Base URL</div>
            <code class="setting-value-code">${escapeHtml(p.base_url || "—")}</code>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-controls">
            <div class="setting-name">Max Tokens</div>
            <code class="setting-value-code">${p.max_tokens != null ? String(p.max_tokens) : "—"}</code>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-controls">
            <div class="setting-name">Temperature</div>
            <code class="setting-value-code">${p.temperature != null ? String(p.temperature) : "—"}</code>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-controls">
            <div class="setting-name">Allowed Tools</div>
            <code class="setting-value-code">${p.allowed_tools && p.allowed_tools !== "[]" ? escapeHtml(p.allowed_tools) : "All"}</code>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-controls">
            <div class="setting-name">Default Channels</div>
            <div class="setting-readonly-value">
              ${
                p.default_channels.length === 0
                  ? '<span class="text-muted" style="font-size:0.85rem;">No channels use this profile</span>'
                  : `<div class="channel-tag-list">${p.default_channels
                      .map(
                        (ch) =>
                          `<span class="channel-tag">${escapeHtml(ch.name)} <span class="channel-tag-platform">(${escapeHtml(ch.platform)})</span></span>`,
                      )
                      .join("")}</div>`
              }
            </div>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-controls">
            <div class="setting-name">Created</div>
            <span class="text-muted" style="font-size:0.85rem;">${formatDateTime(p.created_at)}</span>
          </div>
        </div>
      </div>
    </div>
  `,
    )
    .join("");
}

function formatDateTime(dateStr: string): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr.endsWith("Z") || dateStr.includes("+") ? dateStr : dateStr + "Z");
  return d.toLocaleString();
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
