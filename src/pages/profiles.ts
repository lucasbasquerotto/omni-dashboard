import { apiGet } from "../lib/api";
import { enhanceSelect, unenhanceSelect } from "../lib/dropdown";

// ── Cached provider/model data ──
let _providers: string[] = [];
let _providerModels: Record<string, string[]> = {};

export function renderProfiles(container: HTMLElement): void {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Profiles</h1>
        <p class="page-subtitle">LLM profiles — provider, model, and tool configuration</p>
      </div>
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
    const profiles = await apiGet<any[]>("/profiles");
    // Load provider names and their model lists (same pattern as channels)
    try {
      const pluginResp = await apiGet<any>("/plugins");
      const allPlugins: any[] = pluginResp.data || pluginResp;
      const providers = allPlugins.filter((p: any) => p.plugin_type === "provider");
      _providers = providers.map((p: any) => p.name).sort();
      const modelMap: Record<string, string[]> = {};
      for (const p of providers) {
        try {
          const detailResp = await apiGet<any>(`/plugins/${p.name}`);
          const detail = detailResp.data || detailResp;
          const schema = [
            ...((detail.config_schema || []) as any[]),
            ...((detail.manifest?.config_schema || []) as any[]),
          ];
          const modelField = schema.find((f: any) => f.key === "default_model");
          if (modelField && modelField.allowed_values && modelField.allowed_values.length > 0) {
            modelMap[p.name] = modelField.allowed_values as string[];
          } else if (modelField && modelField.default) {
            modelMap[p.name] = [modelField.default as string];
          } else {
            modelMap[p.name] = [];
          }
        } catch {
          modelMap[p.name] = [];
        }
      }
      _providerModels = modelMap;
    } catch {
      _providers = [];
      _providerModels = {};
    }

    content.innerHTML = renderProfilesPage(profiles);
    wireProfiles();
    // Enhance provider and model selects
    document.querySelectorAll("#profiles-content select").forEach((el) => {
      enhanceSelect(el.id);
    });
  } catch (e) {
    content.innerHTML = `<div class="error-state" style="padding:3rem;text-align:center;">Failed to load profiles: ${e instanceof Error ? e.message : "Unknown error"}</div>`;
  }
}

function getModelsForProvider(provider: string): string[] {
  return _providerModels[provider] || [];
}

function renderProfilesPage(profiles: any[]): string {
  if (!profiles || profiles.length === 0) {
    return '<div class="empty-state">No profiles found on filesystem.</div>';
  }

  return profiles
    .map(
      (p) => `
    <div class="card settings-card" data-profile-name="${escapeHtml(p.name)}">
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
            ${renderProviderSelect(p.name, p.provider || "")}
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-controls">
            <div class="setting-name">Model</div>
            ${renderModelSelect(p.name, p.provider || "", p.model || "")}
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-controls">
            <div class="setting-name">Allowed Tools</div>
            ${renderToolSelect(p.name, p.allowed_tools || [], p.all_tools || [])}
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-controls">
            <div class="setting-name">Skills</div>
            <div class="setting-readonly-value">
              ${renderSkillsList(p.skills)}
              <div class="text-muted" style="font-size:0.75rem;margin-top:0.25rem;">
                Skills are stored on the filesystem at <code>profiles/${escapeHtml(p.name)}/skills/</code>. Add or remove files there to manage skills.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
    )
    .join("");
}

function renderProviderSelect(profileName: string, currentProvider: string): string {
  const selectId = `prof-provider-${escapeHtml(profileName)}`;
  const options =
    _providers.length > 0
      ? _providers
          .map(
            (p) =>
              `<option value="${escapeHtml(p)}" ${p === currentProvider ? "selected" : ""}>${escapeHtml(p)}</option>`,
          )
          .join("")
      : `<option value="${escapeHtml(currentProvider)}" selected>${escapeHtml(currentProvider || "—")}</option>`;
  return `
    <div style="display:flex;align-items:center;gap:0.375rem;">
      <select id="${selectId}" class="profile-provider-select"
        data-profile-name="${escapeHtml(profileName)}" data-field="provider" data-original="${escapeHtml(currentProvider)}">
        ${options}
      </select>
      <button type="button" class="profile-edit-confirm" data-profile-name="${escapeHtml(profileName)}" data-field="provider" style="display:none;width:24px;height:24px;border-radius:4px;border:1px solid var(--glass-border);background:rgba(0,0,0,0.3);cursor:pointer;color:#10b981;padding:0;" title="Save">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
      </button>
      <button type="button" class="profile-edit-cancel" data-profile-name="${escapeHtml(profileName)}" data-field="provider" style="display:none;width:24px;height:24px;border-radius:4px;border:1px solid var(--glass-border);background:rgba(0,0,0,0.3);cursor:pointer;color:#f43f5e;padding:0;" title="Cancel">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  `;
}

function renderModelSelect(profileName: string, currentProvider: string, currentModel: string): string {
  const selectId = `prof-model-${escapeHtml(profileName)}`;
  const models = getModelsForProvider(currentProvider);
  const options =
    models.length > 0
      ? models
          .map(
            (m) =>
              `<option value="${escapeHtml(m)}" ${m === currentModel ? "selected" : ""}>${escapeHtml(m)}</option>`,
          )
          .join("")
      : `<option value="${escapeHtml(currentModel)}" selected>${escapeHtml(currentModel || "—")}</option>`;
  return `
    <div style="display:flex;align-items:center;gap:0.375rem;">
      <select id="${selectId}" class="profile-model-select"
        data-profile-name="${escapeHtml(profileName)}" data-field="model" data-original="${escapeHtml(currentModel)}">
        ${options}
      </select>
      <button type="button" class="profile-edit-confirm" data-profile-name="${escapeHtml(profileName)}" data-field="model" style="display:none;width:24px;height:24px;border-radius:4px;border:1px solid var(--glass-border);background:rgba(0,0,0,0.3);cursor:pointer;color:#10b981;padding:0;" title="Save">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
      </button>
      <button type="button" class="profile-edit-cancel" data-profile-name="${escapeHtml(profileName)}" data-field="model" style="display:none;width:24px;height:24px;border-radius:4px;border:1px solid var(--glass-border);background:rgba(0,0,0,0.3);cursor:pointer;color:#f43f5e;padding:0;" title="Cancel">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  `;
}

function renderSkillsList(skills: string[]): string {
  if (!skills || skills.length === 0) {
    return '<span class="text-muted" style="font-size:0.85rem;">No skills found on filesystem</span>';
  }
  return `<div class="channel-tag-list">${skills
    .map((s) => `<span class="channel-tag">${escapeHtml(s)}</span>`)
    .join("")}</div>`;
}

function renderToolSelect(profileName: string, selected: string[], allTools: string[]): string {
  const id = `prof-tools-${escapeHtml(profileName)}`;
  const chips = [...allTools]
    .sort()
    .map(
      (tool) =>
        `<label class="tool-chip ${selected.includes(tool) ? "tool-chip-active" : ""}" data-tool="${escapeHtml(tool)}">
        <input type="checkbox" class="tool-chip-cb" value="${escapeHtml(tool)}"
          data-profile-name="${escapeHtml(profileName)}"
          ${selected.includes(tool) ? "checked" : ""} />
        ${escapeHtml(tool)}
      </label>`,
    )
    .join("");

  return `
    <div style="display:flex;flex-direction:column;gap:0.5rem;width:100%;">
      <div class="tool-chip-group" id="${id}" data-profile-name="${escapeHtml(profileName)}">
        ${chips}
      </div>
      <div style="display:flex;gap:0.375rem;">
        <button type="button" class="profile-tools-save btn btn-sm" data-profile-name="${escapeHtml(profileName)}" style="display:none;background:var(--accent);color:white;border:none;border-radius:4px;padding:0.25rem 0.75rem;cursor:pointer;font-size:0.8rem;">Save Tools</button>
        <button type="button" class="profile-tools-reset btn btn-sm" data-profile-name="${escapeHtml(profileName)}" style="display:none;background:rgba(255,255,255,0.1);color:var(--text-secondary);border:1px solid var(--glass-border);border-radius:4px;padding:0.25rem 0.75rem;cursor:pointer;font-size:0.8rem;">Reset to Defaults</button>
      </div>
    </div>
  `;
}

function wireProfiles(): void {
  // ── Select edits (profile-provider-select, profile-model-select) ──
  document.querySelectorAll(".profile-provider-select, .profile-model-select").forEach((el) => {
    const select = el as HTMLSelectElement;
    select.addEventListener("change", () => {
      const profileName = select.getAttribute("data-profile-name");
      const field = select.getAttribute("data-field");
      const original = select.getAttribute("data-original") || "";
      const confirmBtn = document.querySelector(
        `.profile-edit-confirm[data-profile-name="${profileName}"][data-field="${field}"]`,
      ) as HTMLElement | null;
      const cancelBtn = document.querySelector(
        `.profile-edit-cancel[data-profile-name="${profileName}"][data-field="${field}"]`,
      ) as HTMLElement | null;
      const changed = select.value !== original;
      if (confirmBtn) confirmBtn.style.display = changed ? "inline-flex" : "none";
      if (cancelBtn) cancelBtn.style.display = changed ? "inline-flex" : "none";
    });
  });

  // Provider change → update model dropdown in the same profile card
  document.querySelectorAll(".profile-provider-select").forEach((sel) => {
    sel.addEventListener("change", () => {
      const select = sel as HTMLSelectElement;
      const profileName = select.getAttribute("data-profile-name");
      if (!profileName) return;
      const newProvider = select.value;
      const models = getModelsForProvider(newProvider);
      const modelSelect = document.getElementById(
        `prof-model-${escapeHtml(profileName)}`,
      ) as HTMLSelectElement | null;
      if (!modelSelect) return;
      modelSelect.innerHTML =
        models.length > 0
          ? models.map((m: string) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("")
          : '<option value="">—</option>';
      const firstModel = models.length > 0 ? models[0] : "";
      modelSelect.value = firstModel;
      modelSelect.setAttribute("data-original", firstModel);
      // Re-enhance model select after updating options
      unenhanceSelect(modelSelect.id);
      enhanceSelect(modelSelect.id);
      // Hide confirm/cancel for model
      const modelConfirmBtn = document.querySelector(
        `.profile-edit-confirm[data-profile-name="${profileName}"][data-field="model"]`,
      ) as HTMLElement | null;
      const modelCancelBtn = document.querySelector(
        `.profile-edit-cancel[data-profile-name="${profileName}"][data-field="model"]`,
      ) as HTMLElement | null;
      if (modelConfirmBtn) modelConfirmBtn.style.display = "none";
      if (modelCancelBtn) modelCancelBtn.style.display = "none";
    });
  });

  // Confirm edits
  document.querySelectorAll(".profile-edit-confirm").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const profileName = btn.getAttribute("data-profile-name");
      const field = btn.getAttribute("data-field");
      if (!profileName || !field) return;
      const input = document.querySelector(`[data-profile-name="${profileName}"][data-field="${field}"]`) as
        | HTMLSelectElement
        | HTMLInputElement
        | null;
      if (!input) return;
      const value = input.value;
      const body: Record<string, string> = {};
      body[field] = value;
      try {
        const res = await fetch(`/api/profiles/${encodeURIComponent(profileName)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text);
        }
        input.setAttribute("data-original", value);
        (btn as HTMLElement).style.display = "none";
        const cancelBtn = document.querySelector(
          `.profile-edit-cancel[data-profile-name="${profileName}"][data-field="${field}"]`,
        ) as HTMLElement | null;
        if (cancelBtn) cancelBtn.style.display = "none";
        (window as any).showToast?.("Profile updated", "success");
      } catch (e) {
        (window as any).showToast?.("Failed: " + (e instanceof Error ? e.message : "Unknown"), "error");
      }
    });
  });

  // Cancel edits
  document.querySelectorAll(".profile-edit-cancel").forEach((btn) => {
    btn.addEventListener("click", () => {
      const profileName = btn.getAttribute("data-profile-name");
      const field = btn.getAttribute("data-field");
      if (!profileName || !field) return;
      const input = document.querySelector(`[data-profile-name="${profileName}"][data-field="${field}"]`) as
        | HTMLSelectElement
        | HTMLInputElement
        | null;
      if (!input) return;
      input.value = input.getAttribute("data-original") || "";
      (btn as HTMLElement).style.display = "none";
      const confirmBtn = document.querySelector(
        `.profile-edit-confirm[data-profile-name="${profileName}"][data-field="${field}"]`,
      ) as HTMLElement | null;
      if (confirmBtn) confirmBtn.style.display = "none";
    });
  });

  // ── Tool chips ──
  document.querySelectorAll(".tool-chip-cb").forEach((cb) => {
    cb.addEventListener("change", () => {
      const profileName = cb.getAttribute("data-profile-name");
      toggleToolChip(profileName);
    });
  });

  // Tool save button
  document.querySelectorAll(".profile-tools-save").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const profileName = btn.getAttribute("data-profile-name");
      if (!profileName) return;
      const selected = getSelectedTools(profileName);
      try {
        const res = await fetch(`/api/profiles/${encodeURIComponent(profileName)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ allowed_tools: selected }),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text);
        }
        updateToolOrigins(profileName, selected);
        hideToolButtons(profileName);
        (window as any).showToast?.("Tools updated", "success");
      } catch (e) {
        (window as any).showToast?.("Failed: " + (e instanceof Error ? e.message : "Unknown"), "error");
      }
    });
  });

  // Tool reset button
  document.querySelectorAll(".profile-tools-reset").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const profileName = btn.getAttribute("data-profile-name");
      if (!profileName) return;
      try {
        const res = await fetch(`/api/profiles/${encodeURIComponent(profileName)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ allowed_tools: [] }),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text);
        }
        await loadProfiles();
        (window as any).showToast?.("Tools reset to defaults", "success");
      } catch (e) {
        (window as any).showToast?.("Failed: " + (e instanceof Error ? e.message : "Unknown"), "error");
      }
    });
  });
}

// ── Tool helpers ──

function toggleToolChip(profileName: string | null): void {
  if (!profileName) return;
  const group = document.querySelector(`.tool-chip-group[data-profile-name="${profileName}"]`);
  if (!group) return;
  group.querySelectorAll(".tool-chip").forEach((chip) => {
    const cb = chip.querySelector(".tool-chip-cb") as HTMLInputElement;
    chip.classList.toggle("tool-chip-active", cb.checked);
  });
  const changed = hasToolChanges(profileName);
  const saveBtn = document.querySelector(
    `.profile-tools-save[data-profile-name="${profileName}"]`,
  ) as HTMLElement | null;
  const resetBtn = document.querySelector(
    `.profile-tools-reset[data-profile-name="${profileName}"]`,
  ) as HTMLElement | null;
  if (saveBtn) saveBtn.style.display = changed ? "inline-block" : "none";
  if (resetBtn) resetBtn.style.display = changed ? "inline-block" : "none";
}

function getSelectedTools(profileName: string): string[] {
  const group = document.querySelector(`.tool-chip-group[data-profile-name="${profileName}"]`);
  if (!group) return [];
  const result: string[] = [];
  group.querySelectorAll(".tool-chip-cb:checked").forEach((cb) => {
    result.push((cb as HTMLInputElement).value);
  });
  return result;
}

function hasToolChanges(profileName: string): boolean {
  const group = document.querySelector(`.tool-chip-group[data-profile-name="${profileName}"]`);
  if (!group) return false;
  let changed = false;
  group.querySelectorAll(".tool-chip-cb").forEach((cb) => {
    const chip = cb.closest(".tool-chip") as HTMLElement;
    const wasActive = chip.classList.contains("tool-chip-active");
    const isChecked = (cb as HTMLInputElement).checked;
    if (wasActive !== isChecked) changed = true;
  });
  return changed;
}

function updateToolOrigins(profileName: string, selected: string[]): void {
  const group = document.querySelector(`.tool-chip-group[data-profile-name="${profileName}"]`);
  if (!group) return;
  group.querySelectorAll(".tool-chip").forEach((chip) => {
    const tool = chip.getAttribute("data-tool");
    const active = selected.includes(tool || "");
    chip.classList.toggle("tool-chip-active", active);
    const cb = chip.querySelector(".tool-chip-cb") as HTMLInputElement;
    if (cb) cb.checked = active;
  });
}

function hideToolButtons(profileName: string): void {
  const saveBtn = document.querySelector(
    `.profile-tools-save[data-profile-name="${profileName}"]`,
  ) as HTMLElement | null;
  const resetBtn = document.querySelector(
    `.profile-tools-reset[data-profile-name="${profileName}"]`,
  ) as HTMLElement | null;
  if (saveBtn) saveBtn.style.display = "none";
  if (resetBtn) resetBtn.style.display = "none";
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
