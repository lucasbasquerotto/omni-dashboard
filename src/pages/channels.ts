import { apiGet, type ChannelData } from "../lib/api";

export function renderChannels(container: HTMLElement): void {
  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Channels</h1>
      <p class="page-subtitle">Communication channels and their configuration</p>
    </div>
    <div id="channels-content">
      <div class="loading" style="padding:3rem;text-align:center;">Loading channels...</div>
    </div>
  `;
  void loadChannels();
}

async function loadChannels(): Promise<void> {
  const content = document.getElementById("channels-content")!;
  try {
    const channels = await apiGet<ChannelData[]>("/channels");
    content.innerHTML = renderChannelsPage(channels);
  } catch (e) {
    content.innerHTML = `<div class="error-state" style="padding:3rem;text-align:center;">Failed to load channels: ${e instanceof Error ? e.message : "Unknown error"}</div>`;
  }
}

function renderChannelsPage(channels: ChannelData[]): string {
  if (!channels || channels.length === 0) {
    return '<div class="empty-state">No channels configured</div>';
  }

  return channels
    .map(
      (ch) => `
    <div class="card settings-card">
      <div class="card-header">
        <span class="card-title">${escapeHtml(ch.name)}</span>
        <span class="channel-status-badge ${ch.closed ? "badge-error" : "badge-success"}">${ch.closed ? "Closed" : "Open"}</span>
      </div>
      <div class="card-body">
        <div class="setting-row">
          <div class="setting-controls">
            <div class="setting-name">Name</div>
            <div class="setting-readonly-value">
              <code class="setting-readonly-code">${escapeHtml(ch.name)}</code>
            </div>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-controls">
            <div class="setting-name">Platform</div>
            <code class="setting-value-code">${escapeHtml(ch.platform || "—")}</code>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-controls">
            <div class="setting-name">Resource Identifier</div>
            <code class="setting-value-code">${escapeHtml(ch.resource_identifier || "—")}</code>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-controls">
            <div class="setting-name">Status</div>
            <span class="status-badge ${ch.closed ? "status-badge-error" : "status-badge-success"}">${ch.closed ? "Closed" : "Open"}</span>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-controls">
            <div class="setting-name">Profile</div>
            <code class="setting-value-code">${escapeHtml(ch.current_profile || "default")}</code>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-controls">
            <div class="setting-name">Provider</div>
            <code class="setting-value-code">${escapeHtml(ch.current_provider || "—")}</code>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-controls">
            <div class="setting-name">Model</div>
            <code class="setting-value-code">${escapeHtml(ch.current_model || "—")}</code>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-controls">
            <div class="setting-name">Read Only</div>
            <code class="setting-value-code">${ch.readonly ? "Yes" : "No"}</code>
          </div>
        </div>
      </div>
    </div>
  `,
    )
    .join("");
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
