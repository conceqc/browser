(() => {
  CONFIG.saveEndpoint = "https://kwahzlezpitvurnjljew.supabase.co/functions/v1/qc-verification";

  Object.assign(state, {
    savingVerification: false,
    verificationNotes: state.verificationNotes || "",
    savedResponse: null,
    existingRequirementState: null,
    loadingExistingState: false
  });

  const enhancementStyle = document.createElement("style");
  enhancementStyle.textContent = `
    .duplicate-panel { margin-top: 1rem; padding: .9rem; border: 1px solid #e6c76e; border-radius: 14px; background: #fff8e5; }
    .duplicate-panel.review { border-color: #e2aaaa; background: #fff0f0; }
    .duplicate-panel h4 { margin: 0 0 .35rem; color: var(--ink); font-size: .95rem; }
    .duplicate-panel p { margin: .3rem 0 0; font-size: .8rem; }
    .duplicate-meta { display: grid; gap: .45rem; margin-top: .7rem; }
    .duplicate-meta div { padding: .55rem .65rem; border-radius: 10px; background: rgba(255,255,255,.72); }
    .duplicate-meta span, .duplicate-meta strong { display: block; }
    .duplicate-meta span { color: var(--muted); font-size: .62rem; text-transform: uppercase; letter-spacing: .06em; }
    .duplicate-meta strong { margin-top: .12rem; font-size: .78rem; overflow-wrap: anywhere; }
    .save-success { margin-top: 1rem; padding: .9rem; border: 1px solid #91c9aa; border-radius: 14px; background: var(--green-soft); }
    .save-success.review { border-color: #efd280; background: var(--amber-soft); }
    .save-success h4 { margin: 0 0 .3rem; }
    .verification-notes { width: 100%; min-height: 86px; resize: vertical; padding: .7rem .8rem; border: 1px solid #bfd0d8; border-radius: 12px; color: var(--ink); background: white; outline: none; }
    .verification-notes:focus { border-color: var(--blue); box-shadow: 0 0 0 3px rgba(31,109,145,.11); }
    .evidence-grid { display: grid; gap: .55rem; }
    .evidence-grid div { padding: .65rem; border-radius: 11px; background: #f4f8fa; }
    .evidence-grid span, .evidence-grid strong { display: block; }
    .evidence-grid span { color: var(--muted); font-size: .64rem; text-transform: uppercase; letter-spacing: .06em; }
    .evidence-grid strong { margin-top: .15rem; overflow-wrap: anywhere; font-size: .82rem; }
    .evidence-photos { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: .6rem; margin-top: .8rem; }
    .evidence-photos a { color: var(--ink); text-decoration: none; }
    .evidence-photos img { display: block; width: 100%; aspect-ratio: 4/3; object-fit: cover; border-radius: 12px; background: #dce7ec; }
    .evidence-photos small { display: block; margin-top: .25rem; color: var(--muted); text-transform: capitalize; }
    .action-pill { display: inline-flex; align-items: center; margin-left: .25rem; padding: .3rem .55rem; border-radius: 999px; color: #31566b; background: #e7f1f5; font-size: .62rem; font-weight: 850; text-transform: uppercase; letter-spacing: .05em; }
    .active-pill { color: var(--green); background: var(--green-soft); }
    @media (min-width:700px) { .duplicate-meta, .evidence-grid { grid-template-columns: repeat(2,minmax(0,1fr)); } }
  `;
  document.head.append(enhancementStyle);

  const evidenceDialog = document.createElement("dialog");
  evidenceDialog.id = "requirementEvidenceDialog";
  evidenceDialog.innerHTML = `<div class="dialog-shell"><div class="dialog-header"><div><p class="eyebrow">Active completion evidence</p><h2>Existing verification</h2><p>The active record is shown here. All submissions remain in QC manager history.</p></div><button id="requirementEvidenceClose" class="dialog-close" type="button" aria-label="Close evidence">×</button></div><div id="requirementEvidenceContent"></div></div>`;
  document.body.append(evidenceDialog);
  document.getElementById("requirementEvidenceClose").onclick = () => evidenceDialog.close();
  evidenceDialog.onclick = (event) => { if (event.target === evidenceDialog) evidenceDialog.close(); };

  function selectedRequirement() {
    return state.checklist.find((item) => item.requirement_id === state.selectedRequirementId) || null;
  }

  function requirementHasActiveEvidence(requirement) {
    return Boolean(requirement?.completion_verification_id || state.existingRequirementState?.completion_verification_id);
  }

  async function fetchRequirementState() {
    if (!state.selectedRequirementId || !CONFIG.saveEndpoint) return null;
    const response = await fetch(CONFIG.saveEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: CONFIG.publishableKey
      },
      body: JSON.stringify({
        operation: "STATE",
        project_code: CONFIG.projectCode,
        equipment_requirement_id: state.selectedRequirementId
      })
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.message || `Existing evidence could not be loaded (${response.status}).`);
    return body?.requirement_state || null;
  }

  async function hydrateExistingRequirementState(force = false) {
    const requirement = selectedRequirement();
    if (!requirement || !requirementHasActiveEvidence(requirement)) return null;
    if (!force && state.existingRequirementState?.requirement_id === requirement.requirement_id) {
      return state.existingRequirementState;
    }
    if (state.loadingExistingState) return null;
    state.loadingExistingState = true;
    try {
      state.existingRequirementState = await fetchRequirementState();
      render();
      return state.existingRequirementState;
    } catch (error) {
      console.warn("Could not preload existing requirement evidence", error);
      return null;
    } finally {
      state.loadingExistingState = false;
    }
  }

  function evidenceContent(data) {
    if (!data) return `<div class="empty-state"><h3>No active evidence</h3><p>This item does not currently have an active completion record.</p></div>`;
    const active = data.active_verification;
    const product = active?.matched_product;
    const productText = product
      ? [product.manufacturer, product.model].filter(Boolean).join(" ")
      : [active?.identified_manufacturer, active?.identified_model].filter(Boolean).join(" ") || "Not identified";
    const photos = Array.isArray(data.photos) ? data.photos : [];
    return `<div class="evidence-grid"><div><span>Equipment / item</span><strong>${esc(data.equipment?.equipment_tag || "")}${data.display_name ? ` · ${esc(data.display_name)}${Number(data.instance_no) > 1 ? ` #${Number(data.instance_no)}` : ""}` : ""}</strong></div><div><span>Status</span><strong>${esc(data.status || "")}</strong></div><div><span>Verified by</span><strong>${esc(active?.inspector_name || "Not recorded")}</strong></div><div><span>Verified</span><strong>${esc(active?.created_at ? dateText(active.created_at) : "Not recorded")}</strong></div><div><span>Product</span><strong>${esc(productText)}</strong></div><div><span>History count</span><strong>${Number(data.verification_count || 0)} submission${Number(data.verification_count || 0) === 1 ? "" : "s"}</strong></div></div>${active?.notes ? `<p class="field-note"><strong>Field note:</strong> ${esc(active.notes)}</p>` : ""}${photos.length ? `<div class="evidence-photos">${photos.map((photo) => `<a href="${esc(photo.signed_url)}" target="_blank" rel="noopener"><img src="${esc(photo.signed_url)}" alt="QC evidence" loading="lazy"><small>${esc(String(photo.photo_role || "evidence").replaceAll("_", " "))}</small></a>`).join("")}</div>` : `<p class="dialog-help">No photo evidence is attached to the active record.</p>`}`;
  }

  async function openRequirementEvidence() {
    const content = document.getElementById("requirementEvidenceContent");
    if (!evidenceDialog.open) evidenceDialog.showModal();
    content.innerHTML = `<div class="loading-panel"><div class="spinner"></div><strong>Loading active evidence…</strong></div>`;
    try {
      const data = await hydrateExistingRequirementState(true) || state.existingRequirementState;
      content.innerHTML = evidenceContent(data);
    } catch (error) {
      content.innerHTML = `<div class="empty-state error-state"><h3>Evidence unavailable</h3><p>${esc(error?.message || "The active evidence could not be loaded.")}</p></div>`;
    }
  }

  async function refreshAfterSave() {
    if (state.selectedEquipmentId) {
      state.checklist = await loadChecklist(state.selectedEquipmentId);
    }
    try {
      const [progress, projectRows] = await Promise.all([
        rest("v_equipment_progress", { select: "*", order: "equipment_tag.asc", limit: 1000 }),
        rest("v_project_progress", { select: "*", project_code: `eq.${CONFIG.projectCode}`, limit: 1 })
      ]);
      state.progress = progress || [];
      state.projectProgress = projectRows?.[0] || null;
    } catch (error) {
      console.warn("Progress refresh failed after save", error);
    }
  }

  async function saveVerification(action = "INITIAL") {
    if (state.savingVerification) return;
    if (!state.componentPhoto?.file) {
      toast("Take or choose a component photo before saving.");
      return;
    }
    if (!state.inspector || state.inspector.trim().length < 2) {
      toast("Enter the inspector name before saving.");
      inspectorButton.click();
      return;
    }
    if (!state.result) {
      toast("Check the approval result before saving.");
      return;
    }

    state.savingVerification = true;
    state.savedResponse = null;
    render();

    try {
      const componentFile = await preparePhotoForAi(state.componentPhoto.file);
      const form = new FormData();
      form.append("operation", "SAVE");
      form.append("project_code", CONFIG.projectCode);
      form.append("inspector_name", state.inspector);
      form.append("verification_mode", state.verificationMode);
      form.append("verification_action", action);
      form.append("component_photo", componentFile, componentFile.name);
      if (state.equipmentPhoto?.file) {
        const equipmentFile = await preparePhotoForAi(state.equipmentPhoto.file);
        form.append("equipment_photo", equipmentFile, equipmentFile.name);
      }
      if (state.selectedEquipmentId) form.append("equipment_id", state.selectedEquipmentId);
      if (state.selectedRequirementId) form.append("equipment_requirement_id", state.selectedRequirementId);
      form.append("identified_manufacturer", state.manufacturer || "");
      form.append("identified_model", state.model || "");
      form.append("result", state.result.status || "CANNOT_IDENTIFY");
      form.append("notes", state.verificationNotes || "");
      const product = state.result.matches?.[0];
      if (product?.product_id) form.append("matched_product_id", product.product_id);
      if (Number.isFinite(Number(state.result.ai_confidence))) {
        form.append("ai_confidence", String(Number(state.result.ai_confidence)));
      }
      if (state.result.ai_extraction) {
        form.append("ai_extraction", JSON.stringify(state.result.ai_extraction));
      }

      const response = await fetch(CONFIG.saveEndpoint, {
        method: "POST",
        headers: { apikey: CONFIG.publishableKey },
        body: form
      });
      const body = await response.json().catch(() => null);
      if (response.status === 409 && body?.requirement_state) {
        state.existingRequirementState = body.requirement_state;
        throw new Error(body.message || "This checklist item already has active evidence.");
      }
      if (!response.ok) throw new Error(body?.message || `Verification save failed (${response.status}).`);

      state.savedResponse = body;
      state.existingRequirementState = body?.requirement_state || state.existingRequirementState;
      await refreshAfterSave();
      toast(body?.message || "Verification saved.");
    } catch (error) {
      toast(error?.message || "The verification could not be saved.");
    } finally {
      state.savingVerification = false;
      render();
    }
  }

  renderVerify = function enhancedRenderVerify() {
    const installed = state.verificationMode !== "DELIVERY";
    const equipment = state.equipment.find((item) => item.equipment_id === state.selectedEquipmentId);
    const available = state.checklist.filter((item) => item.status !== "NOT_APPLICABLE");
    return `${pageHeader("Field verification", "Check a material or installed component", "Photograph the label or enter manufacturer and model. The approved-product database makes the acceptance decision.")}
      ${dataBanner()}
      <section class="mode-selector">
        ${modeButton("DELIVERY", "Delivered", "On site, not installed")}
        ${modeButton("INSTALLATION", "Installed", "Link to equipment")}
        ${modeButton("COMMISSIONING", "Commissioning", "Final verification")}
      </section>
      <div class="workflow-grid">
        <section class="workflow-card card">
          <div class="step-heading"><span class="step-number">1</span><div><h3>Product photo</h3><p>Capture the complete label or nameplate in focus.</p></div></div>
          ${photoControl("component", state.componentPhoto, "Take product photo")}
        </section>
        ${installed ? `<section class="workflow-card card"><div class="step-heading"><span class="step-number">2</span><div><h3>Associate equipment</h3><p>Use the equipment tag photo or select the tag manually.</p></div></div>${photoControl("equipment", state.equipmentPhoto, "Scan equipment tag")}<label class="field-label" for="equipmentSelect">Equipment tag</label><select id="equipmentSelect" class="select-input"><option value="">Not selected — will not count toward completion</option>${state.equipment.map((item) => `<option value="${esc(item.equipment_id)}" ${item.equipment_id === state.selectedEquipmentId ? "selected" : ""}>${esc(item.equipment_tag)} · ${esc(item.equipment_type)}</option>`).join("")}</select>${equipment ? `<label class="field-label" for="requirementSelect">Checklist item</label><select id="requirementSelect" class="select-input"><option value="">No checklist item — save as equipment history only</option>${available.map((item) => `<option value="${esc(item.requirement_id)}" ${item.requirement_id === state.selectedRequirementId ? "selected" : ""}>${esc(item.display_name)}${Number(item.instance_no) > 1 ? ` #${item.instance_no}` : ""}${item.status === "COMPLETE" ? " · Complete" : item.status === "REVIEW" ? " · Review" : ""}</option>`).join("")}</select>` : ""}</section>` : ""}
        <section class="workflow-card card ${installed ? "workflow-card-wide" : ""}"><div class="step-heading"><span class="step-number">${installed ? 3 : 2}</span><div><h3>Confirm identification</h3><p>Enter the manufacturer and exact model shown on the product.</p></div></div><div class="form-grid"><div><label class="field-label" for="manufacturerInput">Manufacturer</label><input id="manufacturerInput" class="text-input" value="${esc(state.manufacturer)}" placeholder="e.g., NIBCO"></div><div><label class="field-label" for="modelInput">Model number</label><input id="modelInput" class="text-input" value="${esc(state.model)}" placeholder="e.g., LD-2000"></div></div><div class="button-row"><button id="readPhoto" class="button button-secondary" type="button" ${state.componentPhoto && !state.readingPhoto ? "" : "disabled"}>${icon.camera} ${state.readingPhoto ? "Reading photo…" : "Read photo"}</button><button id="checkApproval" class="button button-primary" type="button">${icon.search} Check approval</button><button id="resetVerify" class="button button-quiet" type="button">Reset</button></div></section>
      </div>${state.result ? renderResult(state.result, equipment) : ""}`;
  };

  renderResult = function enhancedRenderResult(result, equipment) {
    const definitions = {
      MATCH: ["Approved product match", "match", "An exact current approval was found."],
      REVIEW: ["QC review required", "review", "A possible approval was found, but the model is not conclusive."],
      NOT_APPROVED: ["Not found in current approvals", "fail", "Do not treat this product as approved until QC resolves it."],
      CANNOT_IDENTIFY: ["More information needed", "neutral", "Enter the model number or take a clearer label photo."]
    };
    const [title, tone, defaultMessage] = definitions[result.status] || definitions.CANNOT_IDENTIFY;
    const product = result.matches?.[0];
    const ai = result.ai_extraction;
    const aiIdentity = [ai?.manufacturer, ai?.model || ai?.series, ai?.product_type].filter(Boolean).join(" · ");
    const aiConfidence = Number(result.ai_confidence);
    const aiNote = ai ? `<p class="field-note"><strong>Photo read:</strong> ${esc(aiIdentity || "Identification uncertain")}${Number.isFinite(aiConfidence) ? ` · ${Math.round(aiConfidence * 100)}% confidence` : ""}${ai.notes ? `<br>${esc(ai.notes)}` : ""}</p>` : "";
    const message = result.message || defaultMessage;
    const requirement = selectedRequirement();
    const existing = state.existingRequirementState?.requirement_id === requirement?.requirement_id ? state.existingRequirementState : null;
    const active = existing?.active_verification;
    const activeProduct = active?.matched_product;
    const hasActive = requirementHasActiveEvidence(requirement);
    const itemLabel = requirement ? `${requirement.display_name}${Number(requirement.instance_no) > 1 ? ` #${requirement.instance_no}` : ""}` : "";
    const existingProduct = activeProduct ? [activeProduct.manufacturer, activeProduct.model].filter(Boolean).join(" ") : [requirement?.verified_manufacturer, requirement?.verified_model].filter(Boolean).join(" ");
    const duplicatePanel = hasActive ? `<div class="duplicate-panel ${requirement?.status === "REVIEW" ? "review" : ""}"><h4>${requirement?.status === "REVIEW" ? "This item is already under QC review" : "This checklist item is already complete"}</h4><p>A same-product follow-up stays as additional history without changing the completion count. A different product moves the item to QC review. Reinspection intentionally establishes a new active baseline when the submitted product is valid.</p><div class="duplicate-meta"><div><span>Checklist item</span><strong>${esc(itemLabel)}</strong></div><div><span>Active product</span><strong>${esc(existingProduct || "Load evidence to view")}</strong></div>${active ? `<div><span>Verified by</span><strong>${esc(active.inspector_name || "Not recorded")}</strong></div><div><span>Verified</span><strong>${esc(active.created_at ? dateText(active.created_at) : "Not recorded")}</strong></div>` : ""}</div><div class="button-row"><button id="viewActiveEvidence" class="button button-secondary" type="button">View evidence</button><button id="saveFollowUp" class="button button-secondary" type="button" ${state.savingVerification ? "disabled" : ""}>Add follow-up evidence</button><button id="saveReinspection" class="button button-primary" type="button" ${state.savingVerification ? "disabled" : ""}>Reinspect item</button></div></div>` : "";
    const saved = state.savedResponse ? `<div class="save-success ${state.savedResponse?.requirement_state?.status === "REVIEW" ? "review" : ""}"><h4>${state.savedResponse?.requirement_state?.status === "REVIEW" ? "Saved — QC review required" : "Verification saved"}</h4><p>${esc(state.savedResponse.message || "The field record and photo evidence were saved.")}</p></div>` : "";
    const canSave = Boolean(state.componentPhoto && state.inspector && !state.savingVerification && !state.savedResponse);
    const standardSave = !hasActive ? `<div class="button-row"><button id="saveVerification" class="button button-primary" type="button" ${canSave ? "" : "disabled"}>${icon.check} ${state.savingVerification ? "Saving…" : state.verificationMode === "DELIVERY" ? "Save delivered-material check" : "Save verification"}</button></div>` : "";

    return `<section class="verification-result ${tone}"><div class="result-icon">${result.status === "MATCH" ? icon.check : icon.alert}</div><div><p class="eyebrow">Approval result</p><h3>${title}</h3><p>${esc(message)}</p>${aiNote}${product ? `<div class="result-grid"><div><span>Manufacturer</span><strong>${esc(product.manufacturer)}</strong></div><div><span>Model</span><strong>${esc(product.model || "Product family")}</strong></div><div><span>Product</span><strong>${esc(product.product_name || product.component_type || "Approved product")}</strong></div><div><span>Approval</span><strong>${esc(product.current_approval_sources || "Current")}</strong></div></div>${product.field_qc_note ? `<p class="field-note"><strong>Field note:</strong> ${esc(product.field_qc_note)}</p>` : ""}` : ""}${equipment ? `<p class="field-note">Equipment: <strong>${esc(equipment.equipment_tag)}</strong>${requirement ? ` · ${esc(itemLabel)}` : " · no checklist item selected"}</p>` : ""}<label class="field-label" for="verificationNotes">Field notes</label><textarea id="verificationNotes" class="verification-notes" maxlength="2000" placeholder="Optional installation condition, location, or follow-up note">${esc(state.verificationNotes || "")}</textarea>${duplicatePanel}${standardSave}${saved}</div></section>`;
  };

  const baseBindView = bindView;
  bindView = function enhancedBindView() {
    baseBindView();

    document.querySelectorAll("[data-photo]").forEach((input) => {
      const baseHandler = input.onchange;
      input.onchange = (event) => {
        state.savedResponse = null;
        state.existingRequirementState = null;
        state.verificationNotes = "";
        return baseHandler?.call(input, event);
      };
    });

    document.querySelectorAll("[data-mode]").forEach((button) => {
      const baseHandler = button.onclick;
      button.onclick = (event) => {
        state.savedResponse = null;
        state.existingRequirementState = null;
        state.verificationNotes = "";
        return baseHandler?.call(button, event);
      };
    });

    document.getElementById("resetVerify")?.addEventListener("click", () => {
      state.savedResponse = null;
      state.existingRequirementState = null;
      state.verificationNotes = "";
    }, { capture: true });
    document.getElementById("equipmentSelect")?.addEventListener("change", () => {
      state.savedResponse = null;
      state.existingRequirementState = null;
      state.verificationNotes = "";
    }, { capture: true });
    document.getElementById("requirementSelect")?.addEventListener("change", () => {
      state.existingRequirementState = null;
      state.savedResponse = null;
      setTimeout(() => void hydrateExistingRequirementState(), 0);
    });
    document.getElementById("manufacturerInput")?.addEventListener("input", () => { state.savedResponse = null; });
    document.getElementById("modelInput")?.addEventListener("input", () => { state.savedResponse = null; });
    document.getElementById("verificationNotes")?.addEventListener("input", (event) => { state.verificationNotes = event.target.value; });
    document.getElementById("saveVerification")?.addEventListener("click", () => void saveVerification("INITIAL"));
    document.getElementById("saveFollowUp")?.addEventListener("click", () => void saveVerification("FOLLOW_UP"));
    document.getElementById("saveReinspection")?.addEventListener("click", () => void saveVerification("REINSPECTION"));
    document.getElementById("viewActiveEvidence")?.addEventListener("click", () => void openRequirementEvidence());

    const requirement = selectedRequirement();
    if (requirementHasActiveEvidence(requirement) && state.existingRequirementState?.requirement_id !== requirement?.requirement_id) {
      setTimeout(() => void hydrateExistingRequirementState(), 0);
    }
  };

  const baseHistoryRecord = historyRecord;
  historyRecord = function enhancedHistoryRecord(record) {
    const html = baseHistoryRecord(record);
    const action = String(record.verification_action || "INITIAL").replaceAll("_", " ");
    const markers = `<span class="action-pill">${esc(action)}</span>${record.is_active_completion ? `<span class="action-pill active-pill">Active completion</span>` : ""}`;
    return html.replace('<div class="history-record-header"><div>', `<div class="history-record-header"><div>${markers}`);
  };

  render();
})();
