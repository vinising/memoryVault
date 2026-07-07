// API Configuration Defaults
const API_BASE = window.location.origin;

// State management
let currentBucket = "TASK";
let pendingInputPayload = null;
let isOfflineMode = false;
let currentViewEnv = "chat"; // 'chat', 'timeline', or 'graph'
let pendingAttachments = [];
let activeBuckets = []; // Dynamically fetched from backend
const MEMORYVAULT_TOKEN = ""; // If authentication token security is configured

// DOM Cache
const chatPane = document.getElementById("chatPane");
const timelinePane = document.getElementById("timelinePane");
const graphPane = document.getElementById("graphPane");

const tabChatBtn = document.getElementById("tabChatBtn");
const tabTimelineBtn = document.getElementById("tabTimelineBtn");
const tabGraphBtn = document.getElementById("tabGraphBtn");

const ENABLED_TIMELINE_VIEWS = ["cards", "stream", "table"];

const timelineContainer = document.getElementById("timelineContainer");
const timelineTotalCount = document.getElementById("timelineTotalCount");
const timelineContentShell = document.getElementById("timelineContentShell");

const allocationBarsContainer = document.getElementById("allocationBarsContainer");

const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const slashCommandMenu = document.getElementById("slashCommandMenu");
const quickBucketBtn = document.getElementById("quickBucketBtn");
const quickBucketVal = document.getElementById("quickBucketVal");
const quickBucketBackdrop = document.getElementById("quickBucketBackdrop");
const quickBucketDropdown = document.getElementById("quickBucketDropdown");
const bucketModal = document.getElementById("bucketModal");
const sidebar = document.getElementById("sidebar");
const mobileMenuBtn = document.getElementById("mobileMenuBtn");
const mobileSidebarBackdrop = document.getElementById("mobileSidebarBackdrop");
const mobileSidebarCloseBtn = document.getElementById("mobileSidebarCloseBtn");
const sidebarCollapseBtn = document.getElementById("sidebarCollapseBtn");
const desktopSidebarRevealBtn = document.getElementById("desktopSidebarRevealBtn");

const attachmentTray = document.getElementById("attachmentTray");
const attachmentFileInput = document.getElementById("attachmentFileInput");
const attachmentBtn = document.getElementById("attachmentBtn");
const searchBtn = document.getElementById("searchBtn");
const contextChips = document.getElementById("contextChips");
const timelineOverlayPortal = document.getElementById("timelineOverlayPortal");

// Metric DOMs
const statTotal = document.getElementById("statTotal");
const statProgress = document.getElementById("statProgress");
const statOpen = document.getElementById("statOpen");
const statDone = document.getElementById("statDone");

const barEpic = document.getElementById("barEpic"); // maps to GOAL
const barUs = document.getElementById("barUs");     // maps to NOTE
const barTt = document.getElementById("barTt");     // maps to TASK
const barPt = document.getElementById("barPt");     // maps to ISSUE

const barEpicQty = document.getElementById("barEpicQty");
const barUsQty = document.getElementById("barUsQty");
const barTtQty = document.getElementById("barTtQty");
const barPtQty = document.getElementById("barPtQty");

const tracesContainer = document.getElementById("tracesContainer");

const baseTabBtnClass = "flex items-center justify-center space-x-2 px-3 py-2 text-sm md:text-xs font-bold text-gray-400 hover:text-white rounded-xl transition shrink-0";
const activeTabBtnClass = "flex items-center justify-center space-x-2 px-3 py-2 text-sm md:text-xs font-bold bg-blue-600 text-white rounded-xl transition shadow shrink-0";
let timelineLayoutMode = localStorage.getItem("timelineLayoutMode");
if (!timelineLayoutMode || !ENABLED_TIMELINE_VIEWS.includes(timelineLayoutMode)) {
    timelineLayoutMode = ENABLED_TIMELINE_VIEWS.includes(isMobileViewport() ? "cards" : "table")
        ? (isMobileViewport() ? "cards" : "table")
        : (ENABLED_TIMELINE_VIEWS[0] || "cards");
}
const expandedTimelineCards = new Set();
const collapsedTimelineGroups = new Set();
let lastCopiedTimelineCardId = null;
let lastCopiedTimelineCardResetHandle = null;
const slashCommandDefinitions = [
    { command: "/todo", template: "/todo ", description: "Create a new entry from a title or pipe-form payload." },
    { command: "/done", template: "/done #", description: "Mark an entry as done by ID." },
    { command: "/close", template: "/close #", description: "Close an entry using the same flow as done." },
    { command: "/status", template: "/status #0001 in-progress", description: "Set an entry status to open, in-progress, done, or archived." },
    { command: "/search", template: "/search ", description: "Search and open matching timeline entries." },
    { command: "/export", template: "/export", description: "Download the current workspace as JSON." },
    { command: "/import", template: "/import", description: "Restore entries from an exported JSON backup." },
    { command: "/help", template: "/help", description: "Show the built-in MemoryVault command guide." }
];
let filteredSlashCommands = [];
let activeSlashCommandIndex = -1;

function isMobileViewport() {
    return window.innerWidth < 768;
}

function getTimelineLayoutMode() {
    return timelineLayoutMode;
}

function syncTimelineContentShellLayout() {
    if (!timelineContentShell) return;

    timelineContentShell.classList.toggle("is-stream", getTimelineLayoutMode() === "stream");
    timelineContentShell.classList.toggle("is-cards", getTimelineLayoutMode() === "cards");
    timelineContentShell.classList.toggle("is-table", getTimelineLayoutMode() === "table");
}

function renderTimelineLayoutToggle() {
    const toggleContainer = document.getElementById("timelineLayoutToggle");
    if (!toggleContainer) return;
    
    toggleContainer.innerHTML = '';
    
    ENABLED_TIMELINE_VIEWS.forEach(view => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = view.charAt(0).toUpperCase() + view.slice(1);
        btn.id = `timeline${view.charAt(0).toUpperCase() + view.slice(1)}ViewBtn`;
        btn.onclick = () => setTimelineLayoutMode(view);
        toggleContainer.appendChild(btn);
    });
}

function renderTimelineLayoutToggle() {
    const toggleContainer = document.getElementById("timelineLayoutToggle");
    if (!toggleContainer) return;
    
    toggleContainer.innerHTML = '';
    
    ENABLED_TIMELINE_VIEWS.forEach(view => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = view.charAt(0).toUpperCase() + view.slice(1);
        btn.id = `timeline${view.charAt(0).toUpperCase() + view.slice(1)}ViewBtn`;
        btn.onclick = () => setTimelineLayoutMode(view);
        toggleContainer.appendChild(btn);
    });
}

function syncTimelineLayoutToggle() {
    const activeMode = getTimelineLayoutMode();
    syncTimelineContentShellLayout();

    ENABLED_TIMELINE_VIEWS.forEach(view => {
        const btn = document.getElementById(`timeline${view.charAt(0).toUpperCase() + view.slice(1)}ViewBtn`);
        if (btn) {
            btn.className = activeMode === view
                ? "px-3 py-1.5 rounded-full text-2xs font-bold bg-blue-600 text-white shadow-sm transition"
                : "px-3 py-1.5 rounded-full text-2xs font-bold text-gray-400 hover:text-white transition";
        }
    });
}

function setTimelineLayoutMode(mode) {
    if (!ENABLED_TIMELINE_VIEWS.includes(mode)) return;
    timelineLayoutMode = mode;
    localStorage.setItem("timelineLayoutMode", mode);
    syncTimelineLayoutToggle();
    if (currentViewEnv === "timeline") {
        renderFilteredTimeline();
    }
}

function getSlashCommandQuery() {
    if (!chatInput) return null;
    const trimmedValue = chatInput.value.trimStart();
    if (!trimmedValue.startsWith("/") || trimmedValue.includes(" ")) return null;
    return trimmedValue.slice(1).toLowerCase();
}

function hideSlashCommandMenu() {
    filteredSlashCommands = [];
    activeSlashCommandIndex = -1;
    if (!slashCommandMenu) return;
    slashCommandMenu.classList.add("hidden");
    slashCommandMenu.innerHTML = "";
}

function renderSlashCommandMenu() {
    if (!slashCommandMenu) return;
    if (filteredSlashCommands.length === 0) {
        hideSlashCommandMenu();
        return;
    }

    slashCommandMenu.innerHTML = filteredSlashCommands.map((item, index) => {
        const isActive = index === activeSlashCommandIndex;
        return `
            <button
                type="button"
                data-slash-index="${index}"
                class="w-full flex items-start gap-3 px-4 py-3 text-left transition ${isActive ? 'bg-blue-500/12 text-white' : 'text-gray-300 hover:bg-gray-800/80'}"
            >
                <span class="text-2xl leading-none ${isActive ? 'text-blue-300' : 'text-blue-400/90'}">/</span>
                <span class="min-w-0 flex-1">
                    <span class="block text-base font-semibold leading-tight">${escapeHtml(item.command.slice(1))}</span>
                    <span class="block text-xs text-gray-400 mt-1 leading-5">${escapeHtml(item.description)}</span>
                </span>
            </button>
        `;
    }).join("");

    slashCommandMenu.classList.remove("hidden");
}

function updateSlashCommandMenu() {
    const query = getSlashCommandQuery();
    if (query === null) {
        hideSlashCommandMenu();
        return;
    }

    if (query.length === 0) {
        filteredSlashCommands = [...slashCommandDefinitions];
    } else {
        const prefixMatches = slashCommandDefinitions.filter((item) => item.command.slice(1).toLowerCase().startsWith(query));
        const secondaryMatches = slashCommandDefinitions.filter((item) => {
            const normalizedCommand = item.command.slice(1).toLowerCase();
            return !normalizedCommand.startsWith(query) && item.description.toLowerCase().includes(query);
        });
        filteredSlashCommands = [...prefixMatches, ...secondaryMatches];
    }

    if (filteredSlashCommands.length === 0) {
        hideSlashCommandMenu();
        return;
    }

    activeSlashCommandIndex = Math.min(
        Math.max(activeSlashCommandIndex, 0),
        filteredSlashCommands.length - 1
    );

    if (activeSlashCommandIndex === -1) {
        activeSlashCommandIndex = 0;
    }

    renderSlashCommandMenu();
}

function applySlashCommandSuggestion(index) {
    const selected = filteredSlashCommands[index];
    if (!selected || !chatInput) return;
    chatInput.value = selected.template;
    autoResizeChatInput();
    chatInput.focus();
    const caretPosition = chatInput.value.length;
    chatInput.setSelectionRange(caretPosition, caretPosition);
    hideSlashCommandMenu();
}

function moveSlashCommandSelection(direction) {
    if (filteredSlashCommands.length === 0) return;
    activeSlashCommandIndex = (activeSlashCommandIndex + direction + filteredSlashCommands.length) % filteredSlashCommands.length;
    renderSlashCommandMenu();
}

function setQuickBucketDropdownOpen(isOpen) {
    if (!quickBucketDropdown) return;
    syncQuickBucketDropdownLayout();
    quickBucketDropdown.classList.toggle("hidden", !isOpen);
    if (quickBucketBackdrop) {
        quickBucketBackdrop.classList.toggle("hidden", !isOpen || !isMobileViewport());
    }

    const icon = quickBucketBtn ? quickBucketBtn.querySelector("i") : null;
    if (icon) {
        icon.classList.toggle("rotate-45", isOpen);
    }

    if (quickBucketBtn) {
        quickBucketBtn.classList.toggle("bg-blue-600", isOpen);
        quickBucketBtn.classList.toggle("text-white", isOpen);
        quickBucketBtn.classList.toggle("bg-gray-800", !isOpen);
        quickBucketBtn.classList.toggle("text-gray-300", !isOpen);
    }
}

function syncQuickBucketDropdownLayout() {
    if (!quickBucketDropdown || !quickBucketBtn) return;

    const mobile = isMobileViewport();
    const buttonRect = quickBucketBtn.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    quickBucketDropdown.style.position = "fixed";
    quickBucketDropdown.style.backgroundColor = "#11151d";
    quickBucketDropdown.style.borderColor = "#1f2937";

    if (mobile) {
        quickBucketDropdown.style.left = "0";
        quickBucketDropdown.style.right = "0";
        quickBucketDropdown.style.bottom = "0";
        quickBucketDropdown.style.top = "auto";
        quickBucketDropdown.style.width = "auto";
        quickBucketDropdown.style.maxHeight = "56vh";
        quickBucketDropdown.style.padding = "0.9rem 1rem calc(1rem + env(safe-area-inset-bottom))";
        quickBucketDropdown.style.borderWidth = "1px 0 0 0";
        quickBucketDropdown.style.borderRadius = "28px 28px 0 0";
        quickBucketDropdown.style.boxShadow = "0 -32px 80px rgba(0, 0, 0, 0.68)";
        return;
    }

    const popupWidth = 336;
    const popupLeft = Math.max(16, Math.min(buttonRect.left - 6, viewportWidth - popupWidth - 16));
    const popupBottom = Math.max(96, viewportHeight - buttonRect.top + 12);

    quickBucketDropdown.style.left = `${popupLeft}px`;
    quickBucketDropdown.style.right = "auto";
    quickBucketDropdown.style.bottom = `${popupBottom}px`;
    quickBucketDropdown.style.top = "auto";
    quickBucketDropdown.style.width = `${popupWidth}px`;
    quickBucketDropdown.style.maxHeight = `${Math.min(440, viewportHeight - 120)}px`;
    quickBucketDropdown.style.padding = "0.85rem";
    quickBucketDropdown.style.borderWidth = "1px";
    quickBucketDropdown.style.borderRadius = "24px";
    quickBucketDropdown.style.boxShadow = "0 24px 60px rgba(0, 0, 0, 0.42)";
}

function closeMobileSidebar() {
    if (!sidebar) return;
    sidebar.classList.remove("open");
    if (mobileSidebarBackdrop) mobileSidebarBackdrop.classList.add("hidden");
}

function isMobileSidebarOpen() {
    return Boolean(sidebar && isMobileViewport() && sidebar.classList.contains("open"));
}

function syncSidebarCollapsedState(isCollapsed) {
    if (!sidebar) return;

    const applyCollapse = isCollapsed && !isMobileViewport();

    sidebar.classList.toggle("collapsed", applyCollapse);
    localStorage.setItem("sidebarCollapsed", isCollapsed);

    const collapseIcon = sidebarCollapseBtn ? sidebarCollapseBtn.querySelector(".fa-chevron-left") : null;
    if (collapseIcon) {
        collapseIcon.style.transform = applyCollapse ? "scaleX(-1)" : "";
    }

    if (desktopSidebarRevealBtn) {
        desktopSidebarRevealBtn.classList.toggle("hidden", !applyCollapse);
        desktopSidebarRevealBtn.classList.toggle("md:flex", applyCollapse);
    }
}

function toggleMobileSidebar() {
    if (!sidebar || !isMobileViewport()) return;

    const nextIsOpen = !sidebar.classList.contains("open");
    sidebar.classList.toggle("open", nextIsOpen);
    if (mobileSidebarBackdrop) mobileSidebarBackdrop.classList.toggle("hidden", !nextIsOpen);
}

function syncResponsiveUI() {
    if (contextChips) {
        const showChips = currentViewEnv === "chat" && !isMobileViewport();
        contextChips.classList.toggle("hidden", !showChips);
        contextChips.classList.toggle("md:flex", showChips);
    }

    if (chatInput) {
        chatInput.placeholder = isMobileViewport() ? "Message..." : "Message MemoryVault...";
    }

    if (desktopSidebarRevealBtn && sidebar) {
        const isCollapsed = sidebar.classList.contains("collapsed");
        desktopSidebarRevealBtn.classList.toggle("hidden", !isCollapsed || isMobileViewport());
        desktopSidebarRevealBtn.classList.toggle("md:flex", isCollapsed && !isMobileViewport());
    }

    syncTimelineLayoutToggle();
    syncQuickBucketDropdownLayout();
}

// --- STARTUP LOGIC ---
document.addEventListener("DOMContentLoaded", async () => {
    try { if (typeof renderExploreTagsCloud === "function") renderExploreTagsCloud(); } catch(e){}
    await loadBuckets();
    await refreshMetrics();
    refreshTraces();
    checkConnectionStatus();
    
    // Bind Tab Click Switchers
    if (tabChatBtn) {
        tabChatBtn.addEventListener("click", () => {
            console.log("Chat tab clicked");
            switchView("chat");
        });
    }
    if (tabTimelineBtn) {
        tabTimelineBtn.addEventListener("click", () => {
            console.log("Timeline tab clicked");
            switchView("timeline");
        });
    }
    if (tabGraphBtn) {
        tabGraphBtn.addEventListener("click", () => {
            console.log("Graph tab clicked");
            switchView("graph");
        });
    }

    renderTimelineLayoutToggle();
    
    // Auto-focus chat input field on '/' keypress
    document.addEventListener("keydown", (e) => {
        if ((e.key === "/" || e.code === "Slash") && document.activeElement !== chatInput) {
            e.preventDefault();
            chatInput.focus();
            chatInput.value = "/";
            autoResizeChatInput();
            updateSlashCommandMenu();
        }
        // Cmd+K or Ctrl+K search triggers focus
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
            e.preventDefault();
            chatInput.focus();
            chatInput.value = "/search ";
            autoResizeChatInput();
            hideSlashCommandMenu();
        }
    });

    // Custom Bucket Form submission listener
    const customBucketForm = document.getElementById("customBucketForm");
    if (customBucketForm) {
        customBucketForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const nameField = document.getElementById("customBucketName");
            const colorField = document.getElementById("customBucketColor");
            const templateField = document.getElementById("customBucketTemplate");
            
            const name = nameField.value.trim().toUpperCase();
            const color = colorField.value;
            const template = templateField.value.trim() || null;
            
            if (!name) return;
            
            try {
                const res = await fetch(`${API_BASE}/buckets/add`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name, color, template, is_custom: true })
                });
                if (res.ok) {
                    closeCustomBucketModal();
                    nameField.value = "";
                    templateField.value = "";
                    appendSystemMessage(`🎉 Created custom category **${name}** successfully!`);
                    await loadBuckets();
                    refreshMetrics();
                } else {
                    const data = await res.json();
                    appendSystemMessage(`❌ Bucket creation failed: ${data.detail || "Server error"}`, "error");
                }
            } catch (err) {
                appendSystemMessage(`❌ Network error while creating category.`, "error");
            }
        });
    }

    // Toggle Mobile menu
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener("click", () => {
            toggleMobileSidebar();
        });
    }

    if (mobileSidebarCloseBtn) {
        mobileSidebarCloseBtn.addEventListener("click", closeMobileSidebar);
    }

    if (mobileSidebarBackdrop) {
        mobileSidebarBackdrop.addEventListener("click", closeMobileSidebar);
        mobileSidebarBackdrop.addEventListener("pointerdown", closeMobileSidebar);
    }

    document.addEventListener("pointerdown", (e) => {
        if (!isMobileSidebarOpen() || !sidebar) return;
        if (sidebar.contains(e.target) || (mobileMenuBtn && mobileMenuBtn.contains(e.target))) return;
        closeMobileSidebar();
    }, true);

    // Toggle Desktop Sidebar collapse
    if (sidebarCollapseBtn) {
        sidebarCollapseBtn.addEventListener("click", () => {
            syncSidebarCollapsedState(!sidebar.classList.contains("collapsed"));
        });
    }

    if (desktopSidebarRevealBtn) {
        desktopSidebarRevealBtn.addEventListener("click", () => {
            syncSidebarCollapsedState(false);
        });
    }

    // Restore sidebar collapsed state from localStorage
    syncSidebarCollapsedState(localStorage.getItem("sidebarCollapsed") === "true");

    // Toggle quick bucket dropdown
    if (quickBucketBtn) {
        quickBucketBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            setQuickBucketDropdownOpen(quickBucketDropdown.classList.contains("hidden"));
        });
    }

    if (quickBucketDropdown) {
        quickBucketDropdown.addEventListener("click", (e) => e.stopPropagation());
        quickBucketDropdown.addEventListener("pointerdown", (e) => e.stopPropagation());
    }

    if (quickBucketBackdrop) {
        quickBucketBackdrop.addEventListener("click", () => setQuickBucketDropdownOpen(false));
        quickBucketBackdrop.addEventListener("pointerdown", () => setQuickBucketDropdownOpen(false));
    }

    if (chatInput) {
        chatInput.addEventListener("keydown", (e) => {
            if (!slashCommandMenu?.classList.contains("hidden")) {
                if (e.key === "ArrowDown") {
                    e.preventDefault();
                    moveSlashCommandSelection(1);
                    return;
                }
                if (e.key === "ArrowUp") {
                    e.preventDefault();
                    moveSlashCommandSelection(-1);
                    return;
                }
                if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
                    e.preventDefault();
                    applySlashCommandSuggestion(activeSlashCommandIndex);
                    return;
                }
                if (e.key === "Escape") {
                    e.preventDefault();
                    hideSlashCommandMenu();
                    return;
                }
            }

            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                chatForm.dispatchEvent(new Event("submit"));
            }
        });
        // Auto-resize textarea as user types or pastes content
        chatInput.addEventListener("input", () => {
            autoResizeChatInput();
            updateSlashCommandMenu();
        });
        chatInput.addEventListener("focus", updateSlashCommandMenu);
        chatInput.addEventListener("blur", () => {
            window.setTimeout(() => {
                if (document.activeElement && slashCommandMenu?.contains(document.activeElement)) return;
                hideSlashCommandMenu();
            }, 120);
        });
    }

    if (slashCommandMenu) {
        slashCommandMenu.addEventListener("mousedown", (e) => e.preventDefault());
        slashCommandMenu.addEventListener("click", (e) => {
            const button = e.target.closest("button[data-slash-index]");
            if (!button) return;
            const nextIndex = Number(button.getAttribute("data-slash-index"));
            applySlashCommandSuggestion(nextIndex);
        });
    }

    // Wire up Attachment Paperclip click trigger
    if (attachmentBtn && attachmentFileInput) {
        attachmentBtn.addEventListener("click", () => attachmentFileInput.click());
    }

    // Attachment file uploading logic
    if (attachmentFileInput) {
        attachmentFileInput.addEventListener("change", async (e) => {
            const files = e.target.files;
            if (!files || files.length === 0) return;
            
            for (const file of files) {
                const formData = new FormData();
                formData.append("file", file);
                
                try {
                    const headers = {};
                    if (typeof MEMORYVAULT_TOKEN !== "undefined" && MEMORYVAULT_TOKEN) {
                        headers["Authorization"] = `Bearer ${MEMORYVAULT_TOKEN}`;
                    }
                    const res = await fetch(`${API_BASE}/upload`, {
                        method: "POST",
                        headers: headers,
                        body: formData
                    });
                    if (res.ok) {
                        const uploadedInfo = await res.json();
                        pendingAttachments.push(uploadedInfo);
                        renderAttachmentTray();
                    } else {
                        appendSystemMessage(`❌ Failed to upload attachment: ${file.name}`, "error");
                    }
                } catch (err) {
                    appendSystemMessage(`❌ Network error while uploading attachment: ${file.name}`, "error");
                }
            }
            attachmentFileInput.value = "";
        });
    }

    // Global Paste Event Listener for Screenshots
    window.addEventListener("paste", async (e) => {
        if (e.clipboardData && e.clipboardData.items) {
            const items = e.clipboardData.items;
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf("image") !== -1) {
                    const file = items[i].getAsFile();
                    const formData = new FormData();
                    formData.append("file", file);
                    
                    try {
                        const headers = {};
                        if (typeof MEMORYVAULT_TOKEN !== "undefined" && MEMORYVAULT_TOKEN) {
                            headers["Authorization"] = `Bearer ${MEMORYVAULT_TOKEN}`;
                        }
                        const res = await fetch(`${API_BASE}/upload`, {
                            method: "POST",
                            headers: headers,
                            body: formData
                        });
                        if (res.ok) {
                            const uploadedInfo = await res.json();
                            pendingAttachments.push(uploadedInfo);
                            renderAttachmentTray(); // update the visual tray
                        } else {
                            appendSystemMessage(`❌ Failed to paste attachment`, "error");
                        }
                    } catch (err) {
                        appendSystemMessage(`❌ Network error pasting attachment`, "error");
                    }
                }
            }
        }
    });

    // Search button click handler
    if (searchBtn) {
        searchBtn.addEventListener("click", () => {
            const rawText = chatInput.value.trim();
            if (!rawText) {
                appendSystemMessage("🔍 Type keywords in the chat box, then click the search button to search entries!");
                return;
            }
            let query = rawText;
            if (rawText.startsWith("/search ")) {
                query = rawText.substring(8).trim();
            }
            
            // Switch view to timeline and execute search interactively
            switchView("timeline");
            setTimeout(() => {
                const timelineSearchInput = document.getElementById("timelineSearchQuery");
                if (timelineSearchInput) {
                    timelineSearchInput.value = query;
                    triggerTimelineSearch();
                }
            }, 100);
            
            chatInput.value = "";
            chatInput.style.height = "";
        });
    }

    document.addEventListener("click", (e) => {
        setQuickBucketDropdownOpen(false);

        const tagFilters = document.getElementById("timelineTagFilters");
        const clickedInsidePortal = timelineOverlayPortal && timelineOverlayPortal.contains(e.target);
        const clickedTimelineTagControl = e.target instanceof Element && !!e.target.closest("[data-timeline-tag-control]");
        if (isTimelineTagFiltersExpanded && tagFilters && !tagFilters.contains(e.target) && !clickedInsidePortal && !clickedTimelineTagControl) {
            isTimelineTagFiltersExpanded = false;
            updateTimelineTagFiltersUI();
        }
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            setQuickBucketDropdownOpen(false);
            closeMobileSidebar();
            if (isTimelineTagFiltersExpanded) {
                isTimelineTagFiltersExpanded = false;
                updateTimelineTagFiltersUI();
            }
        }
    });

    syncResponsiveUI();
    setupGraphBindings();
});

function renderAttachmentTray() {
    if (!attachmentTray) return;
    if (pendingAttachments.length === 0) {
        attachmentTray.classList.add("hidden");
        attachmentTray.innerHTML = "";
        return;
    }
    
    attachmentTray.classList.remove("hidden");
    let html = "";
    pendingAttachments.forEach((att, idx) => {
        const isImg = att.mime_type.startsWith("image/");
        const previewHtml = isImg 
            ? `<img src="${att.url}" class="w-6 h-6 rounded object-cover border border-gray-750 shrink-0">`
            : `<i class="fa-solid fa-file text-gray-400 text-xs shrink-0"></i>`;
            
        html += `
            <div class="flex items-center space-x-1.5 bg-gray-800 border border-gray-700/80 px-2.5 py-1.5 rounded-lg text-xs text-gray-200 shadow-sm shrink-0">
                ${previewHtml}
                <span class="max-w-[120px] truncate font-semibold" title="${att.filename}">${att.filename}</span>
                <button type="button" class="text-gray-400 hover:text-red-400 font-bold ml-1 text-3xs active:scale-95 transition" onclick="removePendingAttachment(${idx})">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
        `;
    });
    attachmentTray.innerHTML = html;
}

window.removePendingAttachment = async (index) => {
    const att = pendingAttachments[index];
    pendingAttachments.splice(index, 1);
    renderAttachmentTray();
    
    // Call backend to physically delete the file since it's canceled
    try {
        const headers = {};
        if (typeof MEMORYVAULT_TOKEN !== "undefined" && MEMORYVAULT_TOKEN) {
            headers["Authorization"] = `Bearer ${MEMORYVAULT_TOKEN}`;
        }
        await fetch(`${API_BASE}/upload/${att.id}`, {
            method: "DELETE",
            headers: headers
        });
    } catch(err) {
        console.error("Failed to delete queued attachment from server", err);
    }
};

window.openLightbox = (url) => {
    let lightbox = document.getElementById("attachmentLightbox");
    if (!lightbox) {
        lightbox = document.createElement("div");
        lightbox.id = "attachmentLightbox";
        lightbox.className = "fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm cursor-zoom-out p-4 opacity-0 transition-opacity duration-300";
        lightbox.onclick = () => {
            lightbox.style.opacity = "0";
            setTimeout(() => lightbox.remove(), 300);
        };
        const img = document.createElement("img");
        img.id = "lightboxImage";
        img.className = "max-w-full max-h-full rounded-xl shadow-2xl scale-95 transition-transform duration-300";
        
        lightbox.appendChild(img);
        document.body.appendChild(lightbox);
    }
    
    const img = document.getElementById("lightboxImage");
    img.src = url;
    
    // Animate in
    setTimeout(() => {
        lightbox.style.opacity = "1";
        img.style.transform = "scale(1)";
    }, 10);
};

// Sync offline queue if connection is restored
window.addEventListener("online", syncOfflineQueue);
window.addEventListener("offline", () => {
    setNetworkState(true);
});

// Resize textarea to fit content; collapses back to single-row when cleared
function autoResizeChatInput() {
    if (!chatInput) return;
    chatInput.style.height = "auto";
    chatInput.style.height = Math.min(chatInput.scrollHeight, 104) + "px";
}

// Form submission router
chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const rawText = chatInput.value.trim();
    if (!rawText && pendingAttachments.length === 0) {
        // Empty Enter triggers a list of recent items for convenience
        triggerRecentList();
        return;
    }

    chatInput.value = "";
    chatInput.style.height = "";
    processRawInput(rawText);
});

// --- TEXT PARSING ENGINE ---
function processRawInput(text) {
    appendMessage(text, "user");

    // 1. Slash command detection
    if (text.startsWith("/")) {
        handleSlashCommand(text);
        return;
    }

    // 2. Parse standard delimited entry (Bucket | Title | Tags | Description)
    const payload = parseEntryString(text);
    payload.attachments = [...pendingAttachments];
    pendingAttachments = [];
    renderAttachmentTray();

    // Submit directly so that the backend handles automatic classification and semantic synonym tagging
    submitNewEntry(payload);
}

function parseEntryString(text) {
    // Cap split at 3 pipes so description may safely contain | characters (e.g. markdown tables)
    const raw = text.split("|");

    // Extract optional parent:# reference from the last pipe segment
    let parentId = null;
    const lastSeg = (raw[raw.length - 1] || "").trim();
    if (lastSeg.toLowerCase().startsWith("parent:") && raw.length > 1) {
        parentId = lastSeg.slice(7).trim();
        if (parentId && !parentId.startsWith("#")) parentId = `#${parentId}`;
        raw.pop();
    }

    const parts = [
        (raw[0] || "").trim(),
        (raw[1] || "").trim(),
        (raw[2] || "").trim(),
        raw.slice(3).join("|").trim()
    ];
    
    // Check if the first token is a valid bucket value — use activeBuckets so custom/extended buckets are recognized
    const allBucketNames = activeBuckets.length > 0
        ? activeBuckets.map(b => b.name.toUpperCase())
        : ["GOAL", "NOTE", "TASK", "ISSUE", "EVENT", "REMINDER", "JOURNAL"];
    const legacyMap = { "EPIC": "GOAL", "US": "NOTE", "TT": "TASK", "PT": "ISSUE" };
    let firstToken = parts[0].toUpperCase();
    if (legacyMap[firstToken]) {
        firstToken = legacyMap[firstToken];
    }
    
    if (allBucketNames.includes(firstToken)) {
        return {
            bucket: firstToken,
            title: parts[1] || "Untitled note",
            tags: parts[2] || "",
            description: parts[3] || "",
            parent_id: parentId
        };
    } else {
        // Missing bucket. Return parsed fields with blank bucket
        if (parts.length > 1) {
            return {
                bucket: null,
                title: parts[0] || "Untitled note",
                tags: parts[1] || "",
                description: parts[2] || "",
                parent_id: parentId
            };
        } else {
            return {
                bucket: null,
                title: text,
                tags: "",
                description: "",
                parent_id: null
            };
        }
    }
}

// --- SLASH COMMANDS HANDLER ---
function handleSlashCommand(commandStr) {
    const tokens = commandStr.split(" ").map(t => t.trim());
    const action = tokens[0].toLowerCase();
    const arg = tokens.slice(1).join(" ");

    switch (action) {
        case "/todo":
            if (!arg) {
                appendSystemMessage("⚠️ `/todo` requires a title or pipe-separated note (e.g., `/todo TASK | Review deck | presentation | check feedback`).", "error");
                return;
            }
            const payload = parseEntryString(arg);
            if (!payload.bucket) payload.bucket = currentBucket; // Default to UI selected quick bucket
            
            // Attach attachments for slash command todo as well
            payload.attachments = [...pendingAttachments];
            pendingAttachments = [];
            renderAttachmentTray();

            submitNewEntry(payload);
            break;

        case "/done":
        case "/close":
            if (!arg) {
                appendSystemMessage("⚠️ Specify an entry numeric ID to close (e.g. `/done #0012` or `/done 12`).", "error");
                return;
            }
            updateEntryStatus(arg, "done");
            break;

        case "/status":
            const spaceIdx = arg.indexOf(" ");
            if (spaceIdx === -1) {
                appendSystemMessage("⚠️ Provide both ID and preferred status value (e.g. `/status #0012 in-progress`).", "error");
                return;
            }
            const entryId = arg.substring(0, spaceIdx).trim();
            const nextStatus = arg.substring(spaceIdx).trim().toLowerCase();
            const allowedStatus = ["open", "in-progress", "done", "archived"];
            if (!allowedStatus.includes(nextStatus)) {
                appendSystemMessage(`⚠️ Invalid status state. Try one of: ${allowedStatus.join(", ")}`, "error");
                return;
            }
            updateEntryStatus(entryId, nextStatus);
            break;

        case "/search":
            switchView("timeline");
            setTimeout(() => {
                const timelineSearchInput = document.getElementById("timelineSearchQuery");
                if (timelineSearchInput) {
                    timelineSearchInput.value = arg;
                    triggerTimelineSearch();
                }
            }, 100);
            break;

        case "/import":
            document.getElementById("importFile").click();
            break;

        case "/export":
            triggerBackupDownload();
            break;

        case "/help":
            const helpMarkdown = `### 🤝 MemoryVault Assistance Menu
- **Add Notes on fly**: \`Bucket | Title | Tags | Description\`
- **Slash Commands**:
  - \`/todo [payload]\` — Save notes quickly.
  - \`/done [id]\` — Set task status Completed.
  - \`/status [id] [value]\` — Switch item state (open, in-progress, done, archived).
  - \`/search [query]\` — Filter matching items.
  - \`/export\` — Run JSON Backup download.
  - \`/import\` — Import JSON restoration.
  - \`/help\` — Open this modal.`;
            appendSystemMessage(helpMarkdown);
            break;

        default:
            // Custom direct natural-language question mapping -> Calls LLM general chat API endpoint!
            askLlmGeneralChat(commandStr);
            break;
    }
}

// --- API ACTIONS ---

async function submitNewEntry(payload) {
    if (isOfflineMode || !navigator.onLine) {
        queueOfflineEntry(payload);
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/add`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            const data = await res.json();
            appendCompletedEntryBubble(data);
            refreshMetrics();
            if (currentViewEnv === "graph") {
                fetchAndRenderGraph();
            }
        } else {
            console.warn("Backend error. Queueing note locally.");
            queueOfflineEntry(payload);
        }
    } catch (e) {
        console.warn("Offline capture active. Queueing note locally.");
        queueOfflineEntry(payload);
    }
}

async function updateEntryStatus(id, newStatus) {
    // Standardize ID matching
    const formattedId = id.startsWith("#") ? id : `#${parseInt(id).toString().padStart(4, "0")}`;
    
    try {
        const res = await fetch(`${API_BASE}/item/${encodeURIComponent(formattedId)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: newStatus })
        });
        if (res.ok) {
            const data = await res.json();
            appendSystemMessage(`✅ Entry **${formattedId}** updated to status: **${newStatus.toUpperCase()}**.`);
            refreshMetrics();
            
            // Re-render matching bubble if it is visible on-screen
            const bubbleDom = document.getElementById(`entry-bubble-${formattedId.replace("#", "")}`);
            if (bubbleDom) {
                // Update badge inline
                const badge = bubbleDom.querySelector(".status-badge");
                if (badge) {
                    badge.className = `status-badge text-2xs px-2.5 py-0.5 rounded-full font-bold ${getStatusClass(newStatus)}`;
                    badge.textContent = newStatus.toUpperCase();
                }
            }
            if (currentViewEnv === "graph") {
                fetchAndRenderGraph();
            }
        } else {
            appendSystemMessage(`❌ Could not locate or patch backlog item ${formattedId}.`, "error");
        }
    } catch (e) {
        appendSystemMessage(`❌ Network error updating status of ${formattedId}.`, "error");
    }
}

async function searchEntries(query) {
    try {
        const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}`);
        if (res.ok) {
            const data = await res.json();
            if (data.length === 0) {
                appendSystemMessage(`🔎 Search results for **"${query}"** returned 0 matching entries.`);
                return;
            }
            
            let listMarkup = `### 🔎 Matching Results for: "${query}"\n\n`;
            data.forEach(entry => {
                const tagSection = entry.tags ? ` *[${entry.tags}]*` : "";
                const descriptionStr = entry.description ? ` — *"${entry.description}"*` : "";
                listMarkup += `- **${entry.id}** [${entry.bucket}] **${entry.title}**${tagSection} | Stat: \`${entry.status.toUpperCase()}\`${descriptionStr}\n`;
            });
            appendSystemMessage(listMarkup);
        }
    } catch (e) {
        appendSystemMessage("❌ Search action failed due to network connection issues.", "error");
    }
}

async function triggerRecentList() {
    searchEntries("");
}

async function askLlmGeneralChat(queryText) {
    appendSystemMessage("🧬 *Querying local evaluation models...*");
    try {
        const res = await fetch(`${API_BASE}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: queryText })
        });
        if (res.ok) {
            const data = await res.json();
            
            // Remove processing indicator
            removeLastTraceSpinner();
            
            appendLlmResponseBubble(data.response, data.model_used, data.latency_ms);
            refreshTraces();
        } else {
            removeLastTraceSpinner();
            appendSystemMessage("⚠️ Local model endpoint returned an processing error.", "error");
        }
    } catch (e) {
        removeLastTraceSpinner();
        appendSystemMessage("⚠️ Could not contact the local server models.", "error");
    }
}

// --- DYNAMIC CORE ACTIONS (UI TRIGGERS) ---

function renderDynamicAllocationBars(data) {
    if (!allocationBarsContainer || !activeBuckets || activeBuckets.length === 0) return;
    
    const totalBuckets = Object.values(data.buckets).reduce((a, b) => a + b, 0) || 1;
    let barsHtml = "";
    
    activeBuckets.forEach(b => {
        const count = data.buckets[b.name] || 0;
        const pct = Math.round((count / totalBuckets) * 100);
        const colorClassText = colorsTextMap[b.color] || "text-gray-400";
        const colorClassBg = colorsThemeMap[b.color] || "bg-gray-500";
        
        barsHtml += `
            <div>
                <div class="flex justify-between text-xs mb-1">
                    <span class="font-medium ${colorClassText}">${b.name}</span>
                    <span class="text-gray-400 font-semibold">${count} (${pct}%)</span>
                </div>
                <div class="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden">
                    <div class="${colorClassBg} h-full rounded-full transition-all duration-500" style="width: ${pct}%"></div>
                </div>
            </div>
        `;
    });
    
    allocationBarsContainer.innerHTML = barsHtml;
}

// Metrics calculation loader
async function refreshMetrics() {
    try {
        const res = await fetch(`${API_BASE}/metrics`);
        if (res.ok) {
            const data = await res.json();
            statTotal.textContent = data.total;
            statProgress.textContent = data.in_progress;
            statOpen.textContent = data.open;
            statDone.textContent = data.done;

            // Load and animate breakdown allocation bars dynamically
            renderDynamicAllocationBars(data);
        }
    } catch (e) {
        console.warn("Metrics update bypassed during offline limitations.");
    }
}

// Traces statistics visual representation
async function refreshTraces() {
    try {
        const res = await fetch(`${API_BASE}/traces`);
        if (res.ok) {
            const data = await res.json();
            if (data.traces.length === 0) {
                tracesContainer.innerHTML = '<p class="text-center italic py-2">No trace matches found</p>';
                return;
            }
            let html = '<div class="space-y-2">';
            data.traces.forEach(t => {
                const isFail = t.status === "failed";
                const modelBadgeColor = isFail ? "bg-red-500/10 text-red-400" : (t.model_used.includes("proxy") ? "bg-yellow-500/15 text-yellow-400" : "bg-blue-500/15 text-blue-400");
                const cleanTime = t.timestamp.substring(11, 19);
                const safePrompt = escapeHtml(t.prompt || "");
                const safeResponse = escapeHtml(t.response || "");
                html += `
                    <details class="group rounded-lg border border-gray-700/60 bg-gray-800/60 font-sans overflow-hidden">
                        <summary class="cursor-pointer list-none px-2.5 py-2 flex justify-between items-center gap-2 text-3xs font-semibold">
                            <span class="px-1.5 py-0.5 rounded font-mono ${modelBadgeColor}">${t.model_used}</span>
                            <span class="flex-1 min-w-0 truncate text-left text-gray-300">${safePrompt}</span>
                            <span class="text-gray-500 shrink-0">${cleanTime}</span>
                        </summary>
                        <div class="border-t border-gray-700/60 px-2.5 py-2 space-y-2 text-3xs text-gray-300">
                            <div>
                                <div class="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Prompt</div>
                                <div class="whitespace-pre-wrap break-words max-h-28 overflow-y-auto pr-1">${safePrompt}</div>
                            </div>
                            <div>
                                <div class="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Response</div>
                                <div class="whitespace-pre-wrap break-words max-h-28 overflow-y-auto pr-1">${safeResponse}</div>
                            </div>
                            <div class="flex justify-between text-3xs text-gray-500 font-mono pt-1 border-t border-gray-700/50">
                                <span>Latency: ${t.latency_ms}ms</span>
                                <span class="${isFail ? 'text-red-500' : 'text-green-500'} font-bold">${t.status.toUpperCase()}</span>
                            </div>
                        </div>
                    </details>
                `;
            });
            html += "</div>";
            tracesContainer.innerHTML = html;
        }
    } catch (e) {
        tracesContainer.innerHTML = '<p class="text-center text-yellow-500 italic py-2">Running Offline</p>';
    }
}

// Summarize button click handler
document.getElementById("summarizeBtn").addEventListener("click", triggerLLMSummary);

async function triggerLLMSummary() {
    appendSystemMessage("✨ *Executing local evaluators summarizing analysis...*");
    try {
        const res = await fetch(`${API_BASE}/summarize`, { method: "POST" });
        if (res.ok) {
            const data = await res.json();
            removeLastTraceSpinner();
            appendLlmResponseBubble(data.summary, data.model_used, data.latency_ms);
            refreshTraces();
        } else {
            removeLastTraceSpinner();
            appendSystemMessage("❌ Back-end returned summarizing failure code.", "error");
        }
    } catch (e) {
        removeLastTraceSpinner();
        appendSystemMessage("❌ Failed to query summarization engines due to connection timeout.", "error");
    }
}

// Backup file downloader
document.getElementById("exportBtn").addEventListener("click", triggerBackupDownload);

async function triggerBackupDownload() {
    try {
        window.location.href = `${API_BASE}/export`;
    } catch (e) {
        appendSystemMessage("❌ Export failed during offline connection timeouts.", "error");
    }
}

// Dynamic CSV exporter plugin helper trigger
document.getElementById("exportCsvBtn").addEventListener("click", () => {
    try {
        window.location.href = `${API_BASE}/plugin/csv-export`;
    } catch (e) {
        appendSystemMessage("❌ CSV dynamic export failed. Offline or plugin missing.", "error");
    }
});

// Import backup trigger setup
const importFile = document.getElementById("importFile");
document.getElementById("importBtn").addEventListener("click", () => importFile.click());
importFile.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    appendSystemMessage(`📁 Overwriting local tables with uploaded database backup: **"${file.name}"**...`);
    const formData = new FormData();
    formData.append("file", file);

    try {
        const res = await fetch(`${API_BASE}/import`, {
            method: "POST",
            body: formData
        });
        if (res.ok) {
            const data = await res.json();
            appendSystemMessage(`✅ RESTORATION SUCCESSFUL! Overwrote **${data.imported_count}** workspace notes and synchronized FTS5 elements.`);
            refreshMetrics();
            if (currentViewEnv === "graph") fetchAndRenderGraph();
        } else {
            appendSystemMessage("❌ Import failed. Check schema rules.", "error");
        }
    } catch (err) {
        appendSystemMessage("❌ Restore rejected - Connection error.", "error");
    }
});

// --- OFFLINE CAPTURE STORAGE ENGINE ---

function queueOfflineEntry(payload) {
    const queue = JSON.parse(localStorage.getItem("offline_backlog_queue") || "[]");
    
    // Supplement timestamp locally
    payload.id = `[Offline Queue #${queue.length + 1}]`;
    payload.timestamp = new Date().toISOString();
    payload.status = "open";
    
    queue.push(payload);
    localStorage.setItem("offline_backlog_queue", JSON.stringify(queue));
    
    setNetworkState(true);
    appendCompletedEntryBubble(payload, true);
}

async function syncOfflineQueue() {
    const queue = JSON.parse(localStorage.getItem("offline_backlog_queue") || "[]");
    if (queue.length === 0) {
        setNetworkState(false);
        return;
    }

    appendSystemMessage(`🔄 Reconnect detected! Syncing **${queue.length}** cached entries back to central repository...`);

    let failureCount = 0;
    for (const item of queue) {
        try {
            const cleanItem = {
                bucket: item.bucket,
                title: item.title,
                tags: item.tags,
                description: item.description
            };
            const res = await fetch(`${API_BASE}/add`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(cleanItem)
            });
            if (!res.ok) failureCount++;
        } catch (e) {
            failureCount++;
        }
    }

    if (failureCount === 0) {
        localStorage.removeItem("offline_backlog_queue");
        appendSystemMessage("🎉 **SYNC COMPLETE!** All offline logs safely inserted. Central calculations updated successfully.");
        setNetworkState(false);
        refreshMetrics();
        if (currentViewEnv === "graph") fetchAndRenderGraph();
    } else {
        appendSystemMessage("⚠️ Sync experienced errors. Retained some elements in localStorage queuing.", "error");
    }
}

function setNetworkState(isOffline) {
    isOfflineMode = isOffline;
    const webIndicator = document.getElementById("offlineIndicator");
    const mobileBadge = document.getElementById("mobileOfflineBadge");
    const netStatus = document.getElementById("connectionStatus");

    if (isOffline) {
        if (webIndicator) webIndicator.classList.remove("hidden");
        if (mobileBadge) mobileBadge.classList.remove("hidden");
        if (netStatus) {
            netStatus.className = "flex items-center space-x-1.5 px-2 py-1 bg-yellow-500/15 border border-yellow-500/30 text-yellow-500 text-xs rounded-full";
            netStatus.querySelector("span:last-child").textContent = "Offline Locked";
        }
    } else {
        if (webIndicator) webIndicator.classList.add("hidden");
        if (mobileBadge) mobileBadge.classList.add("hidden");
        if (netStatus) {
            netStatus.className = "flex items-center space-x-1.5 px-2 py-1 bg-green-500/15 border border-green-500/30 text-green-500 text-xs rounded-full";
            netStatus.querySelector("span:last-child").textContent = "Online";
        }
    }
}

async function checkConnectionStatus() {
    try {
        const res = await fetch(`${API_BASE}/metrics`);
        setNetworkState(!res.ok);
    } catch (e) {
        setNetworkState(true);
    }
}

// --- VIEW SWITCHERS & TIMELINE VIEW RENDERING ---

function switchView(viewName) {
    currentViewEnv = viewName;
    syncResponsiveUI();
    
    // Reset panes hidden status
    if (chatPane) chatPane.classList.add("hidden");
    if (timelinePane) timelinePane.classList.add("hidden");
    if (graphPane) graphPane.classList.add("hidden");
    
    // Clean tab styling
    if (tabChatBtn) tabChatBtn.className = baseTabBtnClass;
    if (tabTimelineBtn) tabTimelineBtn.className = baseTabBtnClass;
    if (tabGraphBtn) tabGraphBtn.className = baseTabBtnClass;

    if (viewName === "chat") {
        if (chatPane) chatPane.classList.remove("hidden");
        if (tabChatBtn) tabChatBtn.className = activeTabBtnClass;
        scrollChatBottom();
    } else if (viewName === "timeline") {
        if (timelinePane) timelinePane.classList.remove("hidden");
        if (tabTimelineBtn) tabTimelineBtn.className = activeTabBtnClass;
        renderTimelineView();
    } else if (viewName === "graph") {
        if (graphPane) graphPane.classList.remove("hidden");
        if (tabGraphBtn) tabGraphBtn.className = activeTabBtnClass;
        fetchAndRenderGraph();
    }

    if (isMobileViewport()) {
        closeMobileSidebar();
    }
}

let allTimelineEntries = [];
let activeTimelineStatusFilter = "all";
let activeTimelineTagFilters = [];
let isTimelineTagFiltersExpanded = false;

function buildCommaSeparatedSearchQuery(rawValue) {
    return rawValue
        .split(",")
        .map((term) => term.trim())
        .filter(Boolean)
        .map((term) => {
            const words = term.split(/\s+/).filter(Boolean);
            if (words.length <= 1) {
                return `${term}*`;
            }
            return `(${words.map((word) => `${word}*`).join(" AND ")})`;
        })
        .join(" OR ");
}

async function triggerTimelineSearch() {
    const queryInput = document.getElementById("timelineSearchQuery");
    const sortOrderSelect = document.getElementById("timelineSortOrder");
    if (!queryInput) return;

    const rawVal = queryInput.value.trim();
    const sort_by = sortOrderSelect ? sortOrderSelect.value : "recency";

    let finalQuery = "";
    let searchMode = "keyword";
    if (rawVal) {
        if (rawVal.includes(",")) {
            finalQuery = buildCommaSeparatedSearchQuery(rawVal);
        } else {
            finalQuery = rawVal;
        }
    }

    try {
        const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(finalQuery)}&sort_by=${sort_by}&mode=${searchMode}`);
        if (res.ok) {
            const entries = await res.json();
            allTimelineEntries = entries;
            updateTimelineTagFiltersUI();
            renderFilteredTimeline();
        }
    } catch (err) {
        console.error("Timeline query fetch error", err);
    }
}
window.triggerTimelineSearch = triggerTimelineSearch;

async function clearTimelineSearch() {
    const queryInput = document.getElementById("timelineSearchQuery");
    const sortOrderSelect = document.getElementById("timelineSortOrder");
    if (queryInput) queryInput.value = "";
    if (sortOrderSelect) sortOrderSelect.value = "recency";
    activeTimelineTagFilters = [];

    await renderTimelineView();
}
window.clearTimelineSearch = clearTimelineSearch;

function withPreservedTimelineScroll(renderAction) {
    if (!timelinePane) {
        renderAction();
        return;
    }

    const previousScrollTop = timelinePane.scrollTop;
    renderAction();
    window.requestAnimationFrame(() => {
        timelinePane.scrollTop = previousScrollTop;
    });
}

async function renderTimelineView(options = {}) {
    if (!timelineContainer) return;
    const { preserveScroll = false, showLoading = true } = options;
    
    if (showLoading) {
        timelineContainer.innerHTML = `
            <div class="flex justify-center items-center py-12 space-x-2">
                <i class="fa-solid fa-circle-notch animate-spin text-xl text-blue-500"></i>
                <span class="text-xs text-gray-400 font-medium">Reconstructing timeline records...</span>
            </div>
        `;
    }
    
    try {
        const res = await fetch(`${API_BASE}/search?q=`);
        if (!res.ok) throw new Error("Server responded with error status");
        
        const entries = await res.json();
        allTimelineEntries = entries;
        
        // Update tags cloud sidebar/panel on timeline
        updateTimelineTagFiltersUI();
        
        // Execute rendering of filtered entries
        if (preserveScroll) {
            withPreservedTimelineScroll(() => renderFilteredTimeline());
        } else {
            renderFilteredTimeline();
        }
        
    } catch (err) {
        timelineContainer.innerHTML = `
            <div class="text-center py-12 bg-red-500/5 border border-red-500/20 rounded-2xl p-6">
                <i class="fa-solid fa-triangle-exclamation text-3xl text-red-400 mb-2 animate-bounce"></i>
                <p class="text-sm font-semibold text-red-400">Failed to render timeline</p>
                <p class="text-xs text-red-500/70 mt-1 max-w-sm mx-auto">Error details: ${err.message || err}</p>
            </div>
        `;
    }
}

function updateTimelineTagFiltersUI() {
    const tagFiltersContainer = document.getElementById("timelineTagFilters");
    if (!tagFiltersContainer) return;
    if (timelineOverlayPortal) timelineOverlayPortal.innerHTML = "";
    
    const tagMap = {};
    allTimelineEntries.forEach(entry => {
        if (entry.tags) {
            entry.tags.split(",").forEach(t => {
                const clean = t.trim().toLowerCase();
                if (clean) tagMap[clean] = (tagMap[clean] || 0) + 1;
            });
        }
    });
    
    const uniqueTags = Object.keys(tagMap).sort((left, right) => {
        const countDelta = tagMap[right] - tagMap[left];
        return countDelta !== 0 ? countDelta : left.localeCompare(right);
    });
    if (uniqueTags.length === 0) {
        tagFiltersContainer.innerHTML = `<span class="text-[11px] text-gray-500 italic">No tags in timeline items</span>`;
        return;
    }

    const prioritizedTags = [
        ...activeTimelineTagFilters.filter((tag) => uniqueTags.includes(tag)),
        ...uniqueTags.filter((tag) => !activeTimelineTagFilters.includes(tag))
    ];
    let chipsHtml = "";
    prioritizedTags.forEach(tag => {
        const isActive = activeTimelineTagFilters.includes(tag);
        const chipStateClass = isActive ? " is-active" : "";

        chipsHtml += `
            <button type="button" data-timeline-tag-control="true" onclick="toggleTimelineTagFilter('${tag}')" class="timeline-tag-chip${chipStateClass} inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium tracking-[0.01em] transition whitespace-nowrap">
                <span>#${tag}</span>
                <span class="timeline-tag-chip-count rounded-full px-1.5 py-0.5 text-[11px] font-semibold">${tagMap[tag]}</span>
            </button>
        `;
    });

    const hasActiveFilters = activeTimelineTagFilters.length > 0;
    const summaryText = hasActiveFilters
        ? `${activeTimelineTagFilters.length} active filter${activeTimelineTagFilters.length === 1 ? '' : 's'}`
        : `${uniqueTags.length} tags`;
    const activeFilterHtml = activeTimelineTagFilters.map((tag) => `
        <button type="button" onclick="toggleTimelineTagFilter('${tag}')" class="timeline-tag-pill inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition whitespace-nowrap">
            <span>#${tag}</span>
            <i class="fa-solid fa-xmark text-[11px] opacity-70"></i>
        </button>
    `).join("");

    const hostRect = tagFiltersContainer.getBoundingClientRect();
    const panelWidth = Math.min(440, Math.max(280, window.innerWidth - 48));
    const panelLeft = Math.min(Math.max(24, hostRect.left), Math.max(24, window.innerWidth - panelWidth - 24));
    const panelTop = Math.max(96, hostRect.bottom + 10);
    const panelStyle = `left:${panelLeft}px; top:${panelTop}px; width:${panelWidth}px; max-height:min(24rem, calc(100vh - ${panelTop + 24}px));`;
    const mobilePanelLeft = 12;
    const mobilePanelWidth = Math.max(280, window.innerWidth - (mobilePanelLeft * 2));
    const mobilePanelStyle = `left:${mobilePanelLeft}px; width:${mobilePanelWidth}px; bottom:calc(env(safe-area-inset-bottom, 0px) + 5.5rem); max-height:min(9.5rem, calc(100vh - 18rem));`;
    const desktopSheetMarkup = `
        <button id="timelineTagSheetBackdrop" type="button" onclick="toggleTimelineTagFiltersExpanded()" class="fixed inset-0 z-30 bg-black/20 backdrop-blur-[1px]"></button>
        <div id="timelineTagSheetPanel" class="timeline-tag-sheet fixed z-40 rounded-[18px] px-3 py-3" style="${panelStyle}">
            <div class="flex items-center justify-between gap-3">
                <div>
                    <p class="timeline-tag-label text-[10px] font-semibold">Filter tags</p>
                    <p class="timeline-tag-subtitle mt-1 text-[10px]">Select one or more tags.</p>
                </div>
                <span class="timeline-tag-summary rounded-full px-2.5 py-1 text-[10px] font-medium whitespace-nowrap">${summaryText}</span>
            </div>
            <div class="mt-3 overflow-y-auto pr-1 custom-scrollbar" style="max-height:calc(min(24rem, 100vh - ${panelTop + 96}px));">
                <div class="flex flex-wrap gap-1.5">
                    ${chipsHtml}
                </div>
            </div>
        </div>
    `;
    const mobileSheetMarkup = `
        <button id="timelineTagSheetBackdrop" type="button" onclick="toggleTimelineTagFiltersExpanded()" class="fixed inset-0 z-30 bg-black/35 backdrop-blur-[2px]"></button>
        <div id="timelineTagSheetPanel" class="timeline-tag-sheet fixed z-40 rounded-[22px] px-3 py-3" style="${mobilePanelStyle}">
            <div class="timeline-tag-handle mx-auto mb-2 h-1.5 w-10 rounded-full"></div>
            <div class="flex items-center justify-between gap-3">
                <div class="flex min-w-0 items-center gap-2">
                    <p class="timeline-tag-label text-[10px] font-semibold whitespace-nowrap">Tags</p>
                    <span class="timeline-tag-summary rounded-full px-2.5 py-1 text-[10px] font-medium whitespace-nowrap">${summaryText}</span>
                </div>
                ${hasActiveFilters ? `<button type="button" data-timeline-tag-control="true" onclick="clearTimelineTagFilters()" class="timeline-tag-clear-btn rounded-full px-2.5 py-1.5 text-[10px] font-semibold whitespace-nowrap">Clear</button>` : `<button type="button" data-timeline-tag-control="true" onclick="toggleTimelineTagFiltersExpanded()" class="timeline-tag-icon-btn flex h-8 w-8 items-center justify-center rounded-full"><i class="fa-solid fa-xmark text-[11px]"></i></button>`}
            </div>
            <div class="mt-2 overflow-y-auto pr-1 custom-scrollbar" style="max-height:5.5rem;">
                <div class="flex flex-wrap gap-2">
                    ${chipsHtml}
                </div>
            </div>
        </div>
    `;

    tagFiltersContainer.innerHTML = `
        <div class="relative shrink-0">
            <div class="flex flex-wrap items-center gap-2 lg:justify-end">
                <button type="button" data-timeline-tag-control="true" onclick="toggleTimelineTagFiltersExpanded()" class="timeline-tag-trigger ${isTimelineTagFiltersExpanded ? 'is-expanded' : ''} inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold transition whitespace-nowrap">
                    <i class="fa-solid fa-hashtag text-[11px]"></i>
                    <span>${hasActiveFilters ? `Tags · ${summaryText}` : `Tags · ${uniqueTags.length}`}</span>
                    <i class="fa-solid ${isTimelineTagFiltersExpanded ? 'fa-chevron-up' : 'fa-chevron-down'} text-[10px] opacity-70"></i>
                </button>
                ${hasActiveFilters ? `<div class="flex flex-wrap items-center gap-2 min-w-0">${activeFilterHtml}</div>` : ""}
                ${hasActiveFilters ? `<button type="button" data-timeline-tag-control="true" onclick="clearTimelineTagFilters()" class="timeline-tag-clear-btn rounded-full px-3 py-2 text-[11px] font-semibold transition whitespace-nowrap">Clear</button>` : ""}
            </div>
        </div>
    `;

    if (isTimelineTagFiltersExpanded && timelineOverlayPortal) {
        timelineOverlayPortal.innerHTML = isMobileViewport() ? mobileSheetMarkup : desktopSheetMarkup;
    }
}

function selectTimelineStatusFilter(status) {
    activeTimelineStatusFilter = status;
    const pills = document.querySelectorAll(".status-filter-pill");
    pills.forEach(pill => {
        const pillStatus = pill.getAttribute("data-status");
        if (pillStatus === status) {
            pill.className = "status-filter-pill px-3 py-1 font-bold rounded-lg border border-blue-500/25 bg-blue-500/10 text-blue-400 transition";
        } else {
            pill.className = "status-filter-pill px-3 py-1 font-semibold rounded-lg border border-gray-800/80 bg-gray-900/40 text-gray-400 hover:text-white transition";
        }
    });
    renderFilteredTimeline();
}

window.selectTimelineStatusFilter = selectTimelineStatusFilter;

function toggleTimelineTagFilter(tag) {
    const idx = activeTimelineTagFilters.indexOf(tag);
    if (idx > -1) {
        activeTimelineTagFilters.splice(idx, 1);
    } else {
        activeTimelineTagFilters.push(tag);
    }
    updateTimelineTagFiltersUI();
    renderFilteredTimeline();
}

window.toggleTimelineTagFilter = toggleTimelineTagFilter;

function toggleTimelineTagFiltersExpanded() {
    isTimelineTagFiltersExpanded = !isTimelineTagFiltersExpanded;
    updateTimelineTagFiltersUI();
}

window.toggleTimelineTagFiltersExpanded = toggleTimelineTagFiltersExpanded;

function clearTimelineTagFilters() {
    activeTimelineTagFilters = [];
    isTimelineTagFiltersExpanded = false;
    updateTimelineTagFiltersUI();
    renderFilteredTimeline();
}

window.clearTimelineTagFilters = clearTimelineTagFilters;

function toggleTimelineCardExpanded(entryId) {
    if (expandedTimelineCards.has(entryId)) {
        expandedTimelineCards.delete(entryId);
    } else {
        expandedTimelineCards.add(entryId);
    }

    if (currentViewEnv === "timeline") {
        renderFilteredTimeline();
    }
}

window.toggleTimelineCardExpanded = toggleTimelineCardExpanded;

function toggleTimelineGroupCollapsed(groupName) {
    if (collapsedTimelineGroups.has(groupName)) {
        collapsedTimelineGroups.delete(groupName);
    } else {
        collapsedTimelineGroups.add(groupName);
    }
    renderFilteredTimeline();
}

window.toggleTimelineGroupCollapsed = toggleTimelineGroupCollapsed;

async function copyTimelineCardReference(entryId) {
    const entry = allTimelineEntries.find((candidate) => candidate.id === entryId);
    if (!entry) return;

    const referenceText = [
        entry.id,
        decodeHtmlEntities(entry.title || "Untitled"),
        decodeHtmlEntities(entry.description || "").trim()
    ].filter(Boolean).join("\n");

    try {
        await navigator.clipboard.writeText(referenceText);
        lastCopiedTimelineCardId = entryId;

        if (lastCopiedTimelineCardResetHandle) {
            clearTimeout(lastCopiedTimelineCardResetHandle);
        }

        lastCopiedTimelineCardResetHandle = window.setTimeout(() => {
            lastCopiedTimelineCardId = null;
            if (currentViewEnv === "timeline") {
                renderFilteredTimeline();
            }
        }, 1400);

        if (currentViewEnv === "timeline") {
            renderFilteredTimeline();
        }
    } catch (error) {
        console.error("Could not copy timeline card reference", error);
    }
}

window.copyTimelineCardReference = copyTimelineCardReference;

function renderFilteredTimeline() {
    if (!timelineContainer) return;
    const layoutMode = getTimelineLayoutMode();
    const useCardsLayout = layoutMode === "cards";
    const useStreamLayout = layoutMode === "stream";
    const useTableLayout = layoutMode === "table";
    let streamHeaderRendered = false;
    let tableHeaderRendered = false;
    
    let filtered = allTimelineEntries;
    if (activeTimelineStatusFilter !== "all") {
        filtered = filtered.filter(entry => entry.status.toLowerCase() === activeTimelineStatusFilter);
    }
    
    if (activeTimelineTagFilters.length > 0) {
        filtered = filtered.filter(entry => {
            if (!entry.tags) return false;
            const entryTagsList = entry.tags.split(",").map(t => t.trim().toLowerCase());
            return activeTimelineTagFilters.every(fTag => entryTagsList.includes(fTag));
        });
    }

    // Build parent→children map so sub-tasks are rendered indented below their parent
    const childrenMap = {};
    const childIds = new Set();
    filtered.forEach(e => {
        if (e.parent_id) {
            if (!childrenMap[e.parent_id]) childrenMap[e.parent_id] = [];
            childrenMap[e.parent_id].push(e);
            childIds.add(e.id);
        }
    });
    // Root entries: entries that are NOT sub-tasks of another entry
    const rootFiltered = filtered.filter(e => !childIds.has(e.id));

    if (timelineTotalCount) timelineTotalCount.textContent = rootFiltered.length;
    
    if (filtered.length === 0) {
        timelineContainer.innerHTML = `
            <div class="text-center py-12 bg-gray-900/10 border border-gray-800/80 rounded-2xl p-6">
                <i class="fa-solid fa-list-check text-3xl text-gray-650 mb-2"></i>
                <p class="text-xs font-semibold text-gray-300">No matching timeline entries found!</p>
                <p class="text-xs text-gray-500 mt-1 max-w-sm mx-auto">Try selecting a different status filter or toggling off some tags to see your continuous stream.</p>
            </div>
        `;
        return;
    }
    
    // Group entries by date
    const groups = {
        "Today": [],
        "Yesterday": [],
        "This Week": [],
        "Earlier": []
    };
    
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - (24 * 60 * 60 * 1000);
    const startOfSevenDaysAgo = startOfToday - (7 * 24 * 60 * 60 * 1000);
    
    rootFiltered.forEach(entry => {
        const entryDate = new Date(entry.timestamp);
        const entryTime = entryDate.getTime();
        
        if (entryTime >= startOfToday) {
            groups["Today"].push(entry);
        } else if (entryTime >= startOfYesterday) {
            groups["Yesterday"].push(entry);
        } else if (entryTime >= startOfSevenDaysAgo) {
            groups["This Week"].push(entry);
        } else {
            groups["Earlier"].push(entry);
        }
    });
    
    let html = "";
    
            for (const [groupName, groupEntries] of Object.entries(groups)) {
            if (groupEntries.length === 0) continue;
            
            const isGroupCollapsed = collapsedTimelineGroups.has(groupName);
            const chevronIcon = isGroupCollapsed ? "fa-chevron-down" : "fa-chevron-up";
            
            // Subtle Date Divider
            html += `
                <div class="mb-4 mt-8 first:mt-0 flex items-center justify-between px-2">
                    <button type="button" onclick="toggleTimelineGroupCollapsed('${escapeHtml(groupName)}')" class="flex items-center gap-2 text-left focus:outline-none group/divider">
                        <span class="text-sm font-bold text-white tracking-wide shrink-0">${groupName}</span>
                        <i class="fa-solid ${chevronIcon} text-[11px] text-gray-500 group-hover/divider:text-white transition duration-150"></i>
                    </button>
                    ${isGroupCollapsed ? `
                        <span class="text-[11px] text-gray-500 font-medium shrink-0 bg-gray-900/60 border border-gray-800/40 rounded-full px-2.5 py-1 leading-none">
                            ${groupEntries.length} ${groupEntries.length === 1 ? 'item' : 'items'} hidden
                        </span>
                    ` : ''}
                </div>
            `;
            
            if (isGroupCollapsed) continue;
            
            if (useTableLayout && !tableHeaderRendered) {
                html += `
                    <div class="timeline-table-grid rounded-t-lg mb-1">
                        <div class="timeline-table-header">Status</div>
                        <div class="timeline-table-header">Time</div>
                        <div class="timeline-table-header">Task Details</div>
                        <div class="timeline-table-header">Tags</div>
                        <div class="timeline-table-header"></div>
                    </div>
                `;
                tableHeaderRendered = true;
            }

            if (useStreamLayout && !streamHeaderRendered) {
                html += `
                    <div class="timeline-stream-header timeline-stream-grid hidden md:grid mb-0 rounded-[18px] text-[11px] font-semibold uppercase tracking-[0.08em]">
                        <div class="timeline-stream-cell px-4 py-3 relative">Meta<div class="column-resizer" data-col="--stream-meta-col"></div></div>
                        <div class="timeline-stream-cell px-4 py-3 relative">Task Details<div class="column-resizer" data-col="--stream-details-col"></div></div>
                        <div class="timeline-stream-cell px-4 py-3">Tags</div>
                    </div>
                `;
                streamHeaderRendered = true;
            }

            html += `<div class="${useCardsLayout ? 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 items-start' : 'flex flex-col gap-0'}">`;
            
            groupEntries.forEach(entry => {
                const dt = new Date(entry.timestamp);
                const timeStr = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const dateStr = dt.toLocaleDateString([], { month: 'short', day: 'numeric' });
                const isExpanded = expandedTimelineCards.has(entry.id);
                
                let borderColor = "border-gray-800";
                let badgeColor = "bg-gray-800 text-gray-400";
                
                if (entry.bucket === 'GOAL') { borderColor = "border-purple-500 rounded-[20px]"; badgeColor = "bg-gray-800 border border-gray-700 text-purple-400"; }
                else if (entry.bucket === 'NOTE') { borderColor = "border-blue-500 rounded-[20px]"; badgeColor = "bg-gray-800 border border-gray-700 text-blue-400"; }
                else if (entry.bucket === 'TASK') { borderColor = "border-yellow-500 rounded-[20px]"; badgeColor = "bg-gray-800 border border-gray-700 text-yellow-400"; }
                else if (entry.bucket === 'ISSUE') { borderColor = "border-red-500 rounded-[20px]"; badgeColor = "bg-gray-800 border border-gray-700 text-red-400"; }
                
                const cleanTitle = escapeHtml(decodeHtmlEntities(entry.title || "Untitled"));
                const decodedDescription = decodeHtmlEntities(entry.description || "").trim();
                const descPreview = escapeHtml(toPlainTextPreview(decodedDescription, 220));
                const streamDescPreview = escapeHtml(toPlainTextPreview(decodedDescription, 150));
                const fullDescription = escapeHtml(decodedDescription);
                const descriptionMarkup = decodedDescription
                    ? isExpanded
                        ? `<p class="text-[13px] text-gray-200 whitespace-pre-line leading-6 break-words">${fullDescription}</p>`
                        : `<p class="text-[12px] text-gray-300 break-words ${useCardsLayout ? 'line-clamp-4 leading-5' : 'line-clamp-2 leading-6'}">${descPreview}</p>`
                    : "";
                
                let cardTagsHtml = "";
                let streamTagsHtml = "";
                if (entry.tags) {
                    const tagArr = entry.tags.split(",").map(t => t.trim()).filter(Boolean);
                    if (tagArr.length > 0) {
                        const maxTags = useCardsLayout ? 2 : 100;
                        const visibleTags = isExpanded ? tagArr : tagArr.slice(0, maxTags);
                        const overflowCount = tagArr.length - visibleTags.length;
                        const visibleTagsMarkup = visibleTags.map(t => `<span class="bg-gray-900/80 px-2.5 py-0.5 border border-gray-700/50 rounded-full text-3xs font-medium text-gray-400 shrink-0">#${escapeHtml(decodeHtmlEntities(t))}</span>`).join("");
                        const overflowTagMarkup = !isExpanded && overflowCount > 0
                            ? `<span class="px-2 py-0.5 rounded-full text-3xs font-semibold text-gray-500 border border-gray-800 bg-gray-950/80 shrink-0">+${overflowCount}</span>`
                            : "";
                        cardTagsHtml = `<div class="flex flex-wrap gap-1.5 ${useCardsLayout ? 'mt-2.5' : 'mt-3'}">${visibleTagsMarkup}${overflowTagMarkup}</div>`;
                        streamTagsHtml = `<div class="flex flex-wrap items-start content-start gap-1.5 min-w-0 max-w-full">${visibleTagsMarkup}${overflowTagMarkup}</div>`;
                    }
                }
                
                const currentStatus = (entry.status || "open").toLowerCase();
                const badgeClass = getStatusClass(currentStatus);
                const statusDotClass = currentStatus === "done" ? "bg-green-500" : currentStatus === "in-progress" ? "bg-blue-400" : currentStatus === "archived" ? "bg-gray-500" : "bg-yellow-400";
                const expandLabel = isExpanded ? "Collapse" : "Details";
                const copyLabel = lastCopiedTimelineCardId === entry.id ? "Copied" : "Copy ref";
                const cardStateClass = isExpanded ? "ring-1 ring-blue-500/30 shadow-lg shadow-blue-950/20" : "";

                if (useTableLayout) {
                    html += `
                    <article class="timeline-table-row timeline-table-grid border-l border-r border-t border-gray-800/40 group">
                        <div class="timeline-table-cell justify-center relative group/status" title="Change Status: ${currentStatus.toUpperCase()}">
                            <select onchange="updateEntryStatusAsync('${entry.id}', this.value)" class="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10">
                                <option value="open" class="text-yellow-500" ${currentStatus === 'open' ? 'selected' : ''}>OPEN</option>
                                <option value="in-progress" class="text-blue-400" ${currentStatus === 'in-progress' ? 'selected' : ''}>IN-PROGRESS</option>
                                <option value="done" class="text-green-500" ${currentStatus === 'done' ? 'selected' : ''}>DONE</option>
                                <option value="archived" class="text-gray-500" ${currentStatus === 'archived' ? 'selected' : ''}>ARCHIVED</option>
                            </select>
                            <span class="h-2 w-2 rounded-full shrink-0 ${statusDotClass} group-hover/status:ring-4 group-hover/status:ring-gray-700 transition-all duration-200"></span>
                        </div>
                        <div class="timeline-table-cell">
                            <span class="text-xs text-gray-500 font-mono tracking-tight cursor-default" title="${dateStr}">${timeStr}</span>
                        </div>
                        <div class="timeline-table-cell flex-col items-start justify-center">
                            <button type="button" onclick="toggleTimelineCardExpanded('${entry.id}')" class="w-full text-left focus:outline-none flex gap-2 items-center min-w-0">
                                <h3 class="flex-shrink-0 min-w-0 text-[13px] font-semibold text-white leading-tight truncate" title="${cleanTitle}">${cleanTitle}</h3>
                                ${decodedDescription ? `<p class="text-[11px] text-gray-500 truncate w-full max-w-full">- ${streamDescPreview}</p>` : ''}
                            </button>
                        </div>
                        <div class="timeline-table-cell">
                            ${streamTagsHtml || ``}
                        </div>
                        <div class="timeline-table-cell">
                            <div class="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button type="button" onclick="copyTimelineCardReference('${entry.id}')" class="inline-flex h-6 w-6 items-center justify-center rounded-md hover:bg-gray-800 text-gray-500 hover:text-white transition" title="Copy Reference">
                                    <i class="fa-solid ${lastCopiedTimelineCardId === entry.id ? 'fa-check text-emerald-400' : 'fa-copy'} text-[10px]"></i>
                                </button>
                                <button type="button" onclick="null" class="inline-flex h-6 w-6 items-center justify-center rounded-md hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition" title="Delete (Stub)">
                                    <i class="fa-solid fa-trash text-[10px]"></i>
                                </button>
                            </div>
                        </div>
                    </article>
                `;
                                } else if (useStreamLayout) {
                    html += `
                    <article class="bubble-system timeline-stream-card relative overflow-hidden transition duration-200 hover:shadow-lg group border ${cardStateClass}">
                        <div class="timeline-stream-grid items-center">
                            <div class="timeline-stream-cell timeline-stream-meta px-3 py-2 min-w-0">
                                <div class="timeline-meta-line">
                                    <span class="timeline-meta-key">Meta</span>
                                    <span class="timeline-meta-value">
                                        <span class="inline-flex px-1.5 py-0.5 rounded-md ${badgeColor} font-bold text-[11px] uppercase leading-none">${entry.bucket}</span>
                                        <span class="timeline-meta-id ml-1">${entry.id}</span>
                                        <button type="button" onclick="copyTimelineCardReference('${entry.id}')" class="ml-1 inline-flex items-center justify-center text-gray-500 hover:text-white transition group/copy" aria-label="Copy Ref">
                                            <i class="fa-solid ${lastCopiedTimelineCardId === entry.id ? 'fa-check text-emerald-400' : 'fa-copy'} text-[11px]"></i>
                                        </button>
                                    </span>
                                </div>
                                <div class="timeline-meta-line">
                                    <span class="timeline-meta-key">Date</span>
                                    <span class="timeline-meta-value">${dateStr}, ${timeStr}</span>
                                </div>
                                <div class="timeline-meta-line">
                                    <span class="timeline-meta-key">Status</span>
                                    <span class="timeline-meta-value">
                                        <span class="relative inline-block min-w-0 pointer-events-auto">
                                            <select onchange="updateEntryStatusAsync('${entry.id}', this.value)" class="appearance-none outline-none status-badge timeline-meta-select cursor-pointer transition bg-transparent relative z-20">
                                            <option value="open" class="bg-gray-800 text-yellow-500" ${currentStatus === 'open' ? 'selected' : ''}>OPEN</option>
                                            <option value="in-progress" class="bg-gray-800 text-blue-400" ${currentStatus === 'in-progress' ? 'selected' : ''}>IN-PROGRESS</option>
                                            <option value="done" class="bg-gray-800 text-green-500" ${currentStatus === 'done' ? 'selected' : ''}>DONE</option>
                                            <option value="archived" class="bg-gray-800 text-gray-500" ${currentStatus === 'archived' ? 'selected' : ''}>ARCHIVED</option>
                                            </select>
                                            <span class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-1.5">
                                                <i class="fa-solid fa-chevron-down text-3xs opacity-60"></i>
                                            </span>
                                        </span>
                                    </span>
                                </div>
                            </div>
                            <div class="timeline-stream-cell px-3 py-2.5 md:py-3 min-w-0 flex flex-col">
                                <button type="button" onclick="toggleTimelineCardExpanded('${entry.id}')" class="w-full h-full min-w-0 space-y-1 text-left focus:outline-none">
                                    <h3 class="min-w-0 text-base md:text-lg font-semibold text-white leading-tight ${isExpanded ? '' : 'truncate'}">${cleanTitle}</h3>
                                    ${isExpanded
                                        ? `<p class="text-[13px] text-gray-200 whitespace-pre-line leading-6 break-words">${fullDescription}</p>`
                                        : decodedDescription
                                            ? `<p class="text-[12px] text-gray-300 leading-6 line-clamp-1 break-words">${streamDescPreview}</p>`
                                            : `<span class="text-[11px] text-gray-400">No description</span>`}
                                </button>
                            </div>
                            <div class="timeline-stream-cell px-3 py-2.5 md:py-3 min-w-0 flex items-start content-start">
                                ${streamTagsHtml || `<span class="text-[11px] text-gray-400">No tags</span>`}
                            </div>
                        </div>
                        ${decodedDescription ? `
                        <button type="button" onclick="toggleTimelineCardExpanded('${entry.id}')" class="absolute bottom-1.5 right-1.5 text-gray-500 hover:text-white transition focus:outline-none text-[11px] z-20" aria-label="Toggle details">
                            <i class="fa-solid ${isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'}"></i>
                        </button>
                        ` : ''}
                    </article>
                `;
                } else if (useCardsLayout) {
                    html += `
                    
                    <article class="bubble-system px-3 py-3 transition duration-200 hover:shadow-lg flex flex-col gap-2.5 group border ${isExpanded ? '' : 'min-h-[11rem]'} ${borderColor} ${cardStateClass}">
                        <div class="flex items-start justify-between gap-2">
                            <span class="text-3xs font-extrabold px-2 py-0.5 rounded-full ${badgeColor}">${entry.bucket}</span>
                            <span class="text-[11px] rounded-lg px-1.5 py-1 border border-gray-800 text-gray-500 font-mono bg-gray-950/60">${entry.id}</span>
                        </div>
                        <div class="flex items-center justify-between gap-2">
                            <span class="text-[11px] text-gray-500 font-medium">${timeStr}</span>
                            <div class="relative inline-block shrink-0">
                                <select onchange="updateEntryStatusAsync('${entry.id}', this.value)" class="appearance-none outline-none status-badge text-3xs px-2 py-0.5 pr-5 rounded-full font-bold cursor-pointer transition ${badgeClass} bg-gray-900/90 max-w-[6.7rem]">
                                    <option value="open" class="bg-gray-800 text-yellow-500" ${currentStatus === 'open' ? 'selected' : ''}>OPEN</option>
                                    <option value="in-progress" class="bg-gray-800 text-blue-400" ${currentStatus === 'in-progress' ? 'selected' : ''}>IN-PROGRESS</option>
                                    <option value="done" class="bg-gray-800 text-green-500" ${currentStatus === 'done' ? 'selected' : ''}>DONE</option>
                                    <option value="archived" class="bg-gray-800 text-gray-500" ${currentStatus === 'archived' ? 'selected' : ''}>ARCHIVED</option>
                                </select>
                                <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-1.5">
                                    <i class="fa-solid fa-chevron-down text-3xs opacity-60"></i>
                                </div>
                            </div>
                        </div>
                        <button type="button" onclick="toggleTimelineCardExpanded('${entry.id}')" class="space-y-1 text-left rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-0">
                            <h3 class="text-sm font-semibold text-white leading-snug ${isExpanded ? '' : 'line-clamp-3'}">${cleanTitle}</h3>
                            ${descriptionMarkup}
                        </button>
                        ${cardTagsHtml}
                        <div class="mt-auto flex items-center gap-2 pt-1.5">
                            <button type="button" onclick="toggleTimelineCardExpanded('${entry.id}')" class="inline-flex items-center gap-1.5 rounded-full border border-gray-800 bg-gray-950/80 px-2.5 py-1 text-3xs font-bold text-gray-300 hover:text-white hover:border-blue-500/40 transition">
                                <i class="fa-solid ${isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'} text-[11px]"></i>
                                <span>${expandLabel}</span>
                            </button>
                        </div>
                    </article>
                `;
                }
            });
            html += `</div>`;
        }
        
        timelineContainer.innerHTML = html;
    }

// Separate helper for async updates inside the Timeline view with immediate table refresh
async function updateEntryStatusAsync(id, newStatus) {
    const formattedId = id.startsWith("#") ? id : `#${parseInt(id).toString().padStart(4, "0")}`;
    try {
        const res = await fetch(`${API_BASE}/item/${encodeURIComponent(formattedId)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: newStatus })
        });
        if (res.ok) {
            refreshMetrics();
            // Automatically refresh chronological timeline immediately
            renderTimelineView({ preserveScroll: true, showLoading: false });
        } else {
            console.error(`Could not update entry status for ${formattedId}`);
        }
    } catch (e) {
        console.error("Timeline action patch error", e);
    }
}

// --- OVERLAY SELECTORS CONTROLLER ---

const colorsMap = {
    purple: "text-purple-400 border-purple-500/20 bg-purple-500/10 hover:border-purple-500",
    blue: "text-blue-400 border-blue-500/20 bg-blue-500/10 hover:border-blue-500",
    yellow: "text-yellow-400 border-yellow-500/20 bg-yellow-500/10 hover:border-yellow-500",
    red: "text-red-400 border-red-500/20 bg-red-500/10 hover:border-red-500",
    green: "text-green-400 border-green-500/20 bg-green-500/10 hover:border-green-500",
    orange: "text-orange-400 border-orange-500/20 bg-orange-500/10 hover:border-orange-500",
    pink: "text-pink-400 border-pink-500/20 bg-pink-500/10 hover:border-pink-500"
};
const colorsThemeMap = {
    purple: "bg-purple-500",
    blue: "bg-blue-500",
    yellow: "bg-yellow-500",
    red: "bg-red-500",
    green: "bg-green-500",
    orange: "bg-orange-500",
    pink: "bg-pink-500"
};
const colorsTextMap = {
    purple: "text-purple-400",
    blue: "text-blue-400",
    yellow: "text-yellow-400",
    red: "text-red-400",
    green: "text-green-400",
    orange: "text-orange-400",
    pink: "text-pink-400"
};

async function loadBuckets() {
    try {
        const res = await fetch(`${API_BASE}/buckets`);
        if (res.ok) {
            activeBuckets = await res.json();
            renderQuickBucketSelector();
            
            // Re-render allocation bars components after fetching newest structures
            const metricsRes = await fetch(`${API_BASE}/metrics`);
            if (metricsRes.ok) {
                const data = await metricsRes.json();
                renderDynamicAllocationBars(data);
            }
        }
    } catch (e) {
        console.warn("Failed to load buckets from server:", e);
    }
}

function renderQuickBucketSelector() {
    if (!quickBucketDropdown) return;

    const quickActions = [
        {
            id: "attach",
            label: "Attach",
            detail: "Files and images",
            icon: "fa-paperclip",
            accent: "text-blue-300 border-blue-500/20 bg-blue-500/10 hover:bg-blue-500/15"
        },
        {
            id: "search",
            label: "Search",
            detail: "Find notes fast",
            icon: "fa-magnifying-glass",
            accent: "text-emerald-300 border-emerald-500/20 bg-emerald-500/10 hover:bg-emerald-500/15"
        },
        {
            id: "timeline",
            label: "Timeline",
            detail: "Browse backlog",
            icon: "fa-clock-rotate-left",
            accent: "text-amber-300 border-amber-500/20 bg-amber-500/10 hover:bg-amber-500/15"
        },
        {
            id: "summarize",
            label: "Summarize",
            detail: "Workspace brief",
            icon: "fa-bolt",
            accent: "text-fuchsia-300 border-fuchsia-500/20 bg-fuchsia-500/10 hover:bg-fuchsia-500/15"
        }
    ];

    const bucketMeta = {
        GOAL: { icon: "fa-bullseye", title: "Strategic Goal", detail: "Milestones and initiatives", tone: "text-purple-300 border-purple-500/20 bg-purple-500/10 hover:bg-purple-500/15" },
        NOTE: { icon: "fa-align-left", title: "Reference Note", detail: "Thoughts, context, research", tone: "text-blue-300 border-blue-500/20 bg-blue-500/10 hover:bg-blue-500/15" },
        TASK: { icon: "fa-check", title: "Actionable Task", detail: "Next steps and chores", tone: "text-amber-300 border-amber-500/20 bg-amber-500/10 hover:bg-amber-500/15" },
        ISSUE: { icon: "fa-triangle-exclamation", title: "Issue Block", detail: "Problems and friction", tone: "text-red-300 border-red-500/20 bg-red-500/10 hover:bg-red-500/15" },
        EVENT: { icon: "fa-calendar-day", title: "Event", detail: "Meetings and milestones", tone: "text-cyan-300 border-cyan-500/20 bg-cyan-500/10 hover:bg-cyan-500/15" },
        REMINDER: { icon: "fa-bell", title: "Reminder", detail: "Things to revisit", tone: "text-lime-300 border-lime-500/20 bg-lime-500/10 hover:bg-lime-500/15" },
        JOURNAL: { icon: "fa-book-open", title: "Journal", detail: "Reflections and daily notes", tone: "text-indigo-300 border-indigo-500/20 bg-indigo-500/10 hover:bg-indigo-500/15" },
        PRODUCT: { icon: "fa-box-archive", title: "Product", detail: "Features and product ideas", tone: "text-orange-300 border-orange-500/20 bg-orange-500/10 hover:bg-orange-500/15" }
    };

    const quickActionHtml = quickActions.map((action) => `
        <button type="button" onclick="runQuickAction('${action.id}')" class="w-full flex items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition ${action.accent}">
            <div class="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-black/10 shrink-0">
                <i class="fa-solid ${action.icon} text-sm"></i>
            </div>
            <div class="min-w-0">
                <div class="text-sm font-semibold text-white leading-tight">${action.label}</div>
                <div class="text-xs text-gray-400 truncate mt-0.5">${action.detail}</div>
            </div>
        </button>
    `).join("");

    const bucketCardsHtml = activeBuckets.map((bucket) => {
        const meta = bucketMeta[bucket.name] || {
            icon: "fa-layer-group",
            title: bucket.name,
            detail: bucket.is_custom ? "Custom capture type" : "Structured capture",
            tone: "text-gray-200 border-gray-700/70 bg-gray-800/80 hover:bg-gray-800"
        };
        const selectedClass = currentBucket === bucket.name ? "ring-2 ring-blue-500/70 border-blue-500/40" : "border-transparent";
        return `
            <button type="button" onclick="selectQuickBucket('${bucket.name}')" class="rounded-2xl border ${selectedClass} ${meta.tone} px-3 py-3 text-left transition">
                <div class="flex items-center gap-2.5">
                    <div class="flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-black/10 shrink-0">
                        <i class="fa-solid ${meta.icon} text-sm"></i>
                    </div>
                    <div class="min-w-0">
                        <div class="text-xs font-black tracking-[0.14em] text-gray-500 uppercase">${bucket.name}</div>
                        <div class="text-sm font-semibold text-white truncate">${meta.title}</div>
                    </div>
                </div>
            </button>
        `;
    }).join("");

    const customBuckets = activeBuckets.filter((bucket) => bucket.is_custom);
    const customBucketHtml = customBuckets.length > 0 ? `
        <div class="mt-5">
            <div class="flex items-center justify-between mb-2">
                <p class="text-xs font-bold tracking-[0.18em] text-gray-500 uppercase">Custom Categories</p>
            </div>
            <div class="space-y-2">
                ${customBuckets.map((bucket) => `
                    <div class="flex items-center gap-2 rounded-2xl border border-gray-800 bg-gray-900/70 px-3 py-2.5">
                        <button type="button" onclick="selectQuickBucket('${bucket.name}')" class="flex-1 text-left">
                            <div class="text-sm font-semibold text-white">${bucket.name}</div>
                            <div class="text-2xs text-gray-500 mt-0.5">Tap to use this capture type.</div>
                        </button>
                        <button type="button" onclick="deleteCustomBucketAsync('${bucket.name}')" class="h-9 w-9 shrink-0 rounded-xl border border-gray-800 text-gray-500 hover:text-red-400 hover:border-red-500/30 transition">
                            <i class="fa-solid fa-trash text-xs"></i>
                        </button>
                    </div>
                `).join("")}
            </div>
        </div>
    ` : "";

    quickBucketDropdown.innerHTML = `
        <div class="mx-auto mb-3 h-1.5 w-12 rounded-full bg-gray-700 md:hidden"></div>
        <div class="flex items-start justify-between gap-3 mb-4">
            <div>
                <p class="text-xs font-bold tracking-[0.18em] text-gray-500 uppercase">Tools</p>
                <h3 class="text-base md:text-lg font-bold text-white mt-1">Create, search, or capture</h3>
                <p class="text-xs text-gray-400 mt-1">The same capture and workflow options are available on desktop and mobile.</p>
            </div>
            <button type="button" onclick="setQuickBucketDropdownOpen(false)" class="h-10 w-10 shrink-0 rounded-2xl border border-gray-800 text-gray-400 hover:text-white transition md:hidden">
                <i class="fa-solid fa-xmark"></i>
            </button>
        </div>

        <div class="space-y-2.5">
            ${quickActionHtml}
        </div>

        <div class="mt-5">
            <div class="flex items-center justify-between mb-3 gap-3">
                <p class="text-xs font-bold tracking-[0.18em] text-gray-500 uppercase">Log As</p>
                <span class="text-2xs text-gray-500">Current: ${currentBucket}</span>
            </div>
            <div class="grid grid-cols-2 gap-2">
                ${bucketCardsHtml}
            </div>
        </div>

        ${customBucketHtml}

        <button type="button" onclick="openCustomBucketModal()" class="mt-4 w-full rounded-2xl border border-gray-700 bg-gray-900 hover:border-blue-500/30 hover:text-white text-gray-300 px-4 py-3 text-sm font-bold flex items-center justify-center gap-2 transition">
            <i class="fa-solid fa-square-plus text-blue-400"></i>
            <span>Add Custom Category</span>
        </button>
    `;
    syncQuickBucketDropdownLayout();
}

function runQuickAction(action) {
    setQuickBucketDropdownOpen(false);

    if (action === "attach") {
        if (attachmentFileInput) attachmentFileInput.click();
        return;
    }

    if (action === "search") {
        switchView("chat");
        chatInput.value = "/search ";
        chatInput.focus();
        autoResizeChatInput();
        return;
    }

    if (action === "timeline") {
        switchView("timeline");
        return;
    }

    if (action === "summarize") {
        if (typeof triggerLLMSummary === "function") {
            triggerLLMSummary();
            return;
        }
        const summaryButton = document.getElementById("summarizeBtn");
        if (summaryButton) summaryButton.click();
    }
}
window.runQuickAction = runQuickAction;

async function deleteCustomBucketAsync(bucketName) {
    if (!confirm(`Are you absolutely sure you want to delete category "${bucketName}"? This will not delete entries inside it, but will revoke its template.`)) return;
    try {
        const res = await fetch(`${API_BASE}/buckets/${encodeURIComponent(bucketName)}`, {
            method: "DELETE"
        });
        if (res.ok) {
            appendSystemMessage(`🗑️ Custom category **${bucketName}** was successfully deleted.`);
            if (currentBucket === bucketName) {
                selectQuickBucket("TASK");
            }
            await loadBuckets();
            refreshMetrics();
        } else {
            const data = await res.json();
            appendSystemMessage(`❌ Bucket deletion failed: ${data.detail || "Server error"}`, "error");
        }
    } catch (e) {
        appendSystemMessage(`❌ Network error while deleting custom bucket ${bucketName}.`, "error");
    }
}

function openCustomBucketModal() {
    const modal = document.getElementById("customBucketModal");
    if (modal) modal.classList.remove("hidden");
    setQuickBucketDropdownOpen(false);
}

function closeCustomBucketModal() {
    const modal = document.getElementById("customBucketModal");
    if (modal) modal.classList.add("hidden");
}
window.closeCustomBucketModal = closeCustomBucketModal;
window.openCustomBucketModal = openCustomBucketModal;

function openBucketModal() {
    bucketModal.classList.remove("hidden");
}

function closeBucketModal() {
    bucketModal.classList.add("hidden");
    pendingInputPayload = null;
}

function selectQuickBucket(bucket) {
    currentBucket = bucket;
    if (quickBucketVal) quickBucketVal.textContent = bucket;
    setQuickBucketDropdownOpen(false);
    
    // Template Auto-Fill integration
    const match = activeBuckets.find(b => b.name === bucket);
    if (match && match.template && chatInput) {
        const hasInputText = chatInput.value.trim().length > 0;
        const isStandardValue = chatInput.value === "" || chatInput.value.includes("Journals") || chatInput.value.includes("Event Outline") || chatInput.value.includes("Reminder Alert");
        
        if (!hasInputText || isStandardValue) {
            // Expand {{DATE}} to localized string nicely
            const today = new Date();
            const formattedDate = today.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
            const populatedTemplate = match.template.replace(/\{\{DATE\}\}/g, formattedDate).replace(/\\n/g, "\n");
            
            chatInput.value = populatedTemplate;
            autoResizeChatInput();
            chatInput.focus();
        }
    }
}

function submitWithBucket(bucket) {
    if (pendingInputPayload) {
        pendingInputPayload.bucket = bucket;
        submitNewEntry(pendingInputPayload);
    }
    closeBucketModal();
}

// --- RENDERING BUBBLES ---

function appendMessage(text, sender) {
    const bubble = document.createElement("div");
    bubble.className = `flex flex-col space-y-1 max-w-xl px-5 py-4 text-sm font-medium ${sender === "user" ? "self-end bubble-user" : "self-start bubble-system text-gray-200"}`;
    bubble.textContent = text;
    chatPane.appendChild(bubble);
    scrollChatBottom();
}

function appendSystemMessage(markdownText, type = "normal") {
    const bubble = document.createElement("div");
    bubble.className = "flex flex-col space-y-1 max-w-4xl self-start bubble-system px-5 py-4 leading-relaxed text-sm transition-all";
    
    if (type === "error") {
        bubble.className += " border-red-500/30 text-red-500";
    }

    // Elementary markup interpreter for helpful lists
    bubble.innerHTML = parseMiniMarkdown(markdownText);
    chatPane.appendChild(bubble);
    scrollChatBottom();
}

function appendCompletedEntryBubble(entry, offlineQueued = false) {
    const cleanId = entry.id.replace("#", "");
    const bubble = document.createElement("div");
    bubble.id = `entry-bubble-${cleanId}`;
    bubble.className = "flex flex-col space-y-2 max-w-md self-start bubble-system px-5 py-4 transition-all duration-300 hover:shadow-lg font-sans";
    
    const labelColor = entry.bucket === 'GOAL' ? 'text-purple-400 border-purple-500/20 bg-purple-500/10' : (entry.bucket === 'NOTE' ? 'text-blue-400 border-blue-500/20 bg-blue-500/10' : (entry.bucket === 'TASK' ? 'text-yellow-400 border-yellow-500/20 bg-yellow-500/10' : 'text-red-400 border-red-500/20 bg-red-500/10'));
    const badgeText = offlineQueued ? "OFFLINE QUEUED" : entry.status.toUpperCase();
    const badgeClass = offlineQueued ? "bg-yellow-500/10 border border-yellow-500/20 text-yellow-500" : getStatusClass(entry.status);

    innerHTML = `
        <div class="flex items-center justify-between space-x-4 border-b border-gray-800 pb-1.5 mb-1 text-2xs md:text-xs">
            <div class="flex items-center space-x-2">
                <span class="font-bold text-white text-sm font-mono">${entry.id}</span>
                <span class="px-2 py-0.5 rounded-md border font-extrabold tracking-wide ${labelColor}">${entry.bucket}</span>
            </div>
            <span class="status-badge text-2xs px-2.5 py-0.5 rounded-full font-bold ${badgeClass}">${badgeText}</span>
        </div>
        <p class="font-bold text-gray-100 text-sm font-sans">${entry.title}</p>
    `;

    if (entry.tags) {
        const tagBadges = entry.tags.split(",").map(t => `<span class="bg-gray-800 text-gray-300 px-2 py-0.5 rounded text-3xs font-bold border border-gray-700/50">#${t.trim()}</span>`).join(" ");
        innerHTML += `<div class="flex flex-wrap gap-1.5">${tagBadges}</div>`;
    }

    if (entry.description) {
        const parsedDesc = parseDoubleBracketsInHTML(parseMiniMarkdown(decodeHtmlEntities(entry.description)));
        innerHTML += `<div class="text-[12px] text-gray-300 leading-normal pl-2.5 border-l-2 border-gray-700 mt-1">${parsedDesc}</div>`;
    }

    let attachmentHtml = "";
    if (entry.attachments && entry.attachments.length > 0) {
        attachmentHtml = `<div class="mt-2.5 space-y-2 border-t border-gray-800/60 pt-2.5">`;
        entry.attachments.forEach(att => {
            const isImg = att.mime_type.startsWith("image/");
            if (isImg) {
                attachmentHtml += `
                    <div class="relative group max-w-full overflow-hidden rounded-xl border border-gray-800">
                        <img src="${att.url}" alt="${att.filename}" class="w-full max-h-48 object-cover rounded-xl hover:opacity-90 transition cursor-zoom-in" onclick="openLightbox('${att.url}')">
                        <div class="absolute bottom-2 left-2 bg-black/75 backdrop-blur-sm text-3xs font-mono text-gray-300 px-2 py-0.5 rounded border border-gray-800 tracking-wide">${att.filename} (${(att.size / 1024).toFixed(1)} KB)</div>
                    </div>
                `;
            } else {
                attachmentHtml += `
                    <a href="${att.url}" target="_blank" class="flex items-center space-x-2 bg-gray-850 hover:bg-gray-800 border border-gray-800 rounded-xl p-2 text-2xs md:text-xs text-gray-300 transition shrink-0">
                        <i class="fa-solid fa-file-arrow-down text-blue-400 text-sm"></i>
                        <span class="truncate font-semibold flex-1 leading-snug" title="${att.filename}">${att.filename}</span>
                        <span class="text-3xs font-mono text-gray-500">${(att.size / 1024).toFixed(1)} KB</span>
                    </a>
                `;
            }
        });
        attachmentHtml += `</div>`;
    }
    innerHTML += attachmentHtml;

    if (!offlineQueued) {
        // Render Interactive Action Buttons right on Chat Entry Card Bubbles
        innerHTML += `
            <div class="flex space-x-1.5 pt-2 border-t border-gray-800/60 text-3xs mt-1">
                <button onclick="updateEntryStatus('${entry.id}', 'in-progress')" class="px-1.5 py-0.5 bg-blue-500/10 border border-blue-400/20 text-blue-400 font-bold hover:bg-blue-500 hover:text-white rounded text-3xs transition">Mark In Progress</button>
                <button onclick="updateEntryStatus('${entry.id}', 'done')" class="px-1.5 py-0.5 bg-green-500/10 border border-green-400/20 text-green-400 font-bold hover:bg-green-500 hover:text-white rounded text-3xs transition">Mark Completed</button>
                <button onclick="updateEntryStatus('${entry.id}', 'archived')" class="px-1.5 py-0.5 bg-gray-800 border border-gray-700 text-gray-400 font-semibold hover:bg-gray-700 hover:text-white rounded text-3xs transition">Archive</button>
            </div>
        `;
    }

    bubble.innerHTML = innerHTML;
    chatPane.appendChild(bubble);
    scrollChatBottom();
}

function appendLlmResponseBubble(responseMarkdown, modelName, latencyMs) {
    const bubble = document.createElement("div");
    bubble.className = "flex flex-col space-y-2 max-w-4xl self-start bubble-system p-4 rounded-xl leading-relaxed text-sm shadow-md transition-all";
    
    // Model signature statistics header
    const colorBadge = modelName.includes("proxy") ? "text-yellow-400 bg-yellow-500/10 border border-yellow-500/20" : "text-blue-400 bg-blue-500/10 border border-blue-500/20";
    bubble.innerHTML = `
        <div class="flex justify-between items-center text-3xs border-b border-gray-800 pb-2 mb-2">
            <div class="flex items-center space-x-1">
                <i class="fa-solid fa-bolt text-blue-500 animate-pulse"></i>
                <span class="px-2 py-0.5 rounded font-mono font-bold ${colorBadge}">${modelName}</span>
            </div>
            <span class="text-gray-500 font-mono">Response latency: ${latencyMs}ms</span>
        </div>
        <div class="text-sm prose dark:prose-invert max-w-none text-gray-200">\s8</div>
    `.replace("\s8", parseMiniMarkdown(responseMarkdown));
    chatPane.appendChild(bubble);
    scrollChatBottom();
}

// Tracing visual indicators
function removeLastTraceSpinner() {
    const indicators = chatPane.querySelectorAll(".bubble-system");
    indicators.forEach(ind => {
        if (ind.innerHTML.includes("Querying local evaluation models") || ind.innerHTML.includes("Executing local evaluators summarizing analysis")) {
            ind.remove();
        }
    });
}

// --- HELPER UTILS ---

function scrollChatBottom() {
    chatPane.scrollTop = chatPane.scrollHeight;
}

function getStatusClass(status) {
    switch (status.toLowerCase()) {
        case "open": return "bg-gray-800 border border-gray-700 text-yellow-500";
        case "in-progress": return "bg-gray-800 border border-gray-700 text-blue-400 animate-pulse";
        case "done": return "bg-gray-800 border border-gray-700 text-green-500";
        case "archived": return "bg-gray-800 border border-gray-700 text-gray-500";
        default: return "bg-gray-800 border border-gray-700 text-gray-400";
    }
}

// Elementary mini markdown parser for UI blocks
function parseMiniMarkdown(text) {
    if (!text) return "";
    let html = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        // Headings
        .replace(/^### (.*$)/gim, '<h3 class="text-md font-bold text-white mt-3 mb-1 uppercase tracking-wider flex items-center space-x-2"><i class="fa-solid fa-list-check text-blue-500"></i><span>$1</span></h3>')
        .replace(/^## (.*$)/gim, '<h2 id="summaryHeader" class="text-lg font-bold text-white border-b border-gray-800 pb-1 mt-4 mb-2 flex items-center space-x-2"><i class="fa-solid fa-chart-line text-blue-400"></i><span>$1</span></h2>')
        .replace(/^# (.*$)/gim, '<h1 class="text-xl font-extrabold text-blue-400 mt-5 mb-2">$1</h1>')
        // Bold
        .replace(/\*\*(.*?)\*\*/gim, '<strong class="text-white font-bold">$1</strong>')
        // Italic
        .replace(/\*(.*?)\*/gim, '<em class="italic text-gray-350">$1</em>')
        // Inline backticks
        .replace(/`(.*?)`/gim, '<code class="bg-gray-900 text-yellow-400 px-1.5 py-0.5 rounded font-mono border border-gray-800 text-xs">$1</code>')
        // Unordered lists
        .replace(/^\s*-\s+(.*?)$/gim, '<li class="ml-4 list-disc text-gray-300 pl-1 leading-relaxed">$1</li>')
        // Linebreaks
        .replace(/\n/g, "<br>");
        
    return html;
}

function decodeHtmlEntities(text) {
    if (!text) return "";

    const textarea = document.createElement("textarea");
    textarea.innerHTML = text;
    return textarea.value;
}

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function toPlainTextPreview(text, maxLength = 280) {
    if (!text) return "No description available.";
    const plain = String(text)
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    if (plain.length <= maxLength) return plain;
    return `${plain.slice(0, maxLength).trimEnd()}…`;
}

// Function to convert Obsidian-style [[#0012]] double bracket string links into clickable tags
function parseDoubleBracketsInHTML(text) {
    if (!text) return "";
    return text.replace(/\[\((#\d{4})\)\]/g, (match, idStr) => {
        return `<span class="text-blue-400 hover:text-blue-300 underline font-semibold font-mono cursor-pointer transition active:scale-95" onclick="snapFocusToNote('${idStr}')">${idStr}</span>`;
    }).replace(/\[\[(#\d{4})\s*(.*?)\]\]/g, (match, idStr) => {
        return `<span class="text-blue-400 hover:text-blue-300 underline font-semibold font-mono cursor-pointer transition active:scale-95" onclick="snapFocusToNote('${idStr}')">${idStr}</span>`;
    }).replace(/\[\[(#\d{4})\]\]/g, (match, idStr) => {
        return `<span class="text-blue-400 hover:text-blue-300 underline font-semibold font-mono cursor-pointer transition active:scale-95" onclick="snapFocusToNote('${idStr}')">${idStr}</span>`;
    }).replace(/([^\w])(#\d{4})\b/g, (match, prefix, idStr) => {
        return `${prefix}<span class="text-blue-400 hover:text-blue-300 underline font-semibold font-mono cursor-pointer transition active:scale-95" onclick="snapFocusToNote('__ID__')">__ID__</span>`.replace(/__ID__/g, idStr);
    });
}

// Action executing snap views to focus on a particular note ID
function snapFocusToNote(idStr) {
    switchView("chat");
    setTimeout(() => {
        const cleanId = idStr.replace("#", "");
        const bubble = document.getElementById(`entry-bubble-${cleanId}`);
        if (bubble) {
            bubble.scrollIntoView({ behavior: "smooth", block: "center" });
            bubble.classList.add("ring-2", "ring-blue-500", "ring-offset-2", "ring-offset-gray-950");
            setTimeout(() => {
                bubble.classList.remove("ring-2", "ring-blue-500", "ring-offset-2", "ring-offset-gray-950");
            }, 3500);
        } else {
            // If card isn't loaded in scroll pool, force a fuzzy metadata search for it
            searchEntries(idStr);
        }
    }, 100);
}


// ==========================================
// --- OBSIDIAN-STYLE KNOWLEDGE GRAPH ---
// ==========================================

const canvas = document.getElementById("knowledgeGraphCanvas");
let ctx = null;
if (canvas) ctx = canvas.getContext("2d");

// Interactive variables
let nodes = [];
let edges = [];
let transform = { x: 0, y: 0, k: 1 }; // Pan coordinates and scale
let dragNode = null;
let isPanning = false;
let startPanMouse = { x: 0, y: 0 };
let currentHoverNode = null;
let graphSimulationTimer = null;
let drawTagLinksOption = true;

function setupGraphBindings() {
    const toggleTagsInput = document.getElementById("toggleTagLinks");
    if (toggleTagsInput) {
        toggleTagsInput.addEventListener("change", (e) => {
            drawTagLinksOption = e.target.checked;
            fetchAndRenderGraph();
        });
    }

    const resetBtn = document.getElementById("resetGraphBtn");
    if (resetBtn) {
        resetBtn.addEventListener("click", () => {
            nodes.forEach(n => {
                n.x = (Math.random() - 0.5) * 500 + canvas.width / 2;
                n.y = (Math.random() - 0.5) * 500 + canvas.height / 2;
                n.vx = 0;
                n.vy = 0;
            });
            triggerGraphSimulation();
        });
    }

    const recenterBtn = document.getElementById("recenterGraphBtn");
    if (recenterBtn) {
        recenterBtn.addEventListener("click", recenterGraphCamera);
    }

    const closeDetails = document.getElementById("closeNodeDetailsBtn");
    if (closeDetails) {
        closeDetails.addEventListener("click", () => {
            document.getElementById("graphNodeDetails").classList.add("hidden");
        });
    }

    const detailsEdit = document.getElementById("nodeDetailsEditBtn");
    if (detailsEdit) {
        detailsEdit.addEventListener("click", () => {
            const selectedTitle = document.getElementById("nodeDetailsTitle").innerText;
            const match = selectedTitle.match(/#\\d{4}/);
            if (match) {
                snapFocusToNote(match[0]);
            }
        });
    }

    // Canvas Mouse Listeners
    if (canvas) {
        canvas.addEventListener("mousedown", onCanvasMouseDown);
        canvas.addEventListener("mousemove", onCanvasMouseMove);
        canvas.addEventListener("mouseup", onCanvasMouseUp);
        canvas.addEventListener("wheel", onCanvasWheel);
        canvas.addEventListener("dblclick", onCanvasDoubleClick);
    }
}

async function fetchAndRenderGraph() {
    if (!canvas || !ctx) return;
    
    // Size canvas container dynamically
    resizeGraphCanvas();
    
    try {
        const res = await fetch(`${API_BASE}/search?q=`);
        if (!res.ok) return;
        const entries = await res.json();
        
        initializeGraphSimulation(entries);
    } catch (e) {
        console.error("Failed to construct knowledge graph dynamic data model", e);
    }
}

function resizeGraphCanvas() {
    if (!canvas) return;
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
}

// Convert absolute entries list into connected Node + Edge lists
function initializeGraphSimulation(entries) {
    // Preserve old coordinates if rebuilding data model
    const coordMap = new Map();
    nodes.forEach(n => coordMap.set(n.id, { x: n.x, y: n.y, vx: n.vx, vy: n.vy }));
    
    nodes = entries.map(entry => {
        const cached = coordMap.get(entry.id);
        const x = cached ? cached.x : (Math.random() - 0.5) * 400 + canvas.width / 2;
        const y = cached ? cached.y : (Math.random() - 0.5) * 400 + canvas.height / 2;
        return {
            id: entry.id,
            bucket: entry.bucket,
            title: entry.title,
            tags: entry.tags ? entry.tags.split(",").map(t => t.trim()) : [],
            description: entry.description || "",
            status: entry.status,
            x: x,
            y: y,
            vx: cached ? cached.vx : 0,
            vy: cached ? cached.vy : 0,
            radius: 8 + (entry.tags ? entry.tags.split(",").length : 0) // size depends on relations / tags richness
        };
    });

    edges = [];
    
    // Parse Explicit Links inside titles or descriptions (e.g. #0012 or [[#0012]])
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    
    nodes.forEach(node => {
        const contentText = (node.title + " " + node.description).toLowerCase();
        
        // Match standard ID anchors like [[#0012]] or #0012
        const links = contentText.match(/#\\d{4}/g) || [];
        links.forEach(match => {
            const destId = match.toUpperCase();
            if (nodeMap.has(destId) && destId !== node.id) {
                // Ensure link duplicate protection
                if (!edges.some(e => e.source === node.id && e.target === destId)) {
                    edges.push({
                        source: node.id,
                        target: destId,
                        type: "explicit"
                    });
                }
            }
        });

        // Toggleable soft connections sharing tags
        if (drawTagLinksOption) {
            node.tags.forEach(tag => {
                if (!tag) return;
                nodes.forEach(other => {
                    if (other.id !== node.id && other.tags.includes(tag)) {
                        // Soft link drew symmetrically. Prevent redundant duplicates
                        const linkGroupKey = [node.id, other.id].sort().join("-");
                        if (!edges.some(e => e.key === linkGroupKey)) {
                            edges.push({
                                source: node.id,
                                target: other.id,
                                type: "tag",
                                tag: tag,
                                key: linkGroupKey
                            });
                        }
                    }
                });
            });
        }
    });

    // Animate camera on empty initialization
    if (coordMap.size === 0) {
        recenterGraphCamera();
    }

    triggerGraphSimulation();
}

function recenterGraphCamera() {
    if (nodes.length === 0) {
        transform = { x: 0, y: 0, k: 1 };
        return;
    }
    
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    nodes.forEach(n => {
        if (n.x < minX) minX = n.x;
        if (n.x > maxX) maxX = n.x;
        if (n.y < minY) minY = n.y;
        if (n.y > maxY) maxY = n.y;
    });

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    
    transform.x = canvas.width / 2 - centerX;
    transform.y = canvas.height / 2 - centerY;
    transform.k = 1;
}

function zoomInGraph() {
    transform.k = Math.min(transform.k * 1.3, 4);
    triggerGraphSimulation();
}

// Trigger loop physics
function triggerGraphSimulation() {
    if (graphSimulationTimer) cancelAnimationFrame(graphSimulationTimer);
    
    // Physics engine iteration
    function step() {
        applyPhysicsGravityAndAttraction();
        drawGraph();
        
        // Sleep simulation when velocity drops close to minimal
        const avgVelocity = nodes.reduce((sum, n) => sum + Math.sqrt(n.vx*n.vx + n.vy*n.vy), 0) / (nodes.length || 1);
        if (avgVelocity > 0.05 || dragNode || isPanning) {
            graphSimulationTimer = requestAnimationFrame(step);
        } else {
            drawGraph(); // Draw final settled frame
        }
    }
    graphSimulationTimer = requestAnimationFrame(step);
}

// 2D Physics Vector Mechanics formula models
function applyPhysicsGravityAndAttraction() {
    const kGravity = 0.04;     // Gravity coefficient
    const kRepulsion = 800;   // repulsive charge push
    const kSpring = 0.03;      // attractive spring constants
    const restLength = 90;     // relaxed edge distance
    const damping = 0.82;     // damping frictional loss

    const centerW = canvas.width / 2;
    const centerH = canvas.height / 2;

    // Apply gravity pulls to middle
    nodes.forEach(n => {
        n.vx += (centerW - n.x) * kGravity * 0.1;
        n.vy += (centerH - n.y) * kGravity * 0.1;
    });

    // Apply repulsive force between all nodes (Coulomb electrostatic force)
    for (let i = 0; i < nodes.length; i++) {
        const u = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
            const v = nodes[j];
            const dx = v.x - u.x;
            const dy = v.y - u.y;
            const distSq = dx*dx + dy*dy || 1;
            const dist = Math.sqrt(distSq);
            
            if (dist < 400) {
                // Calculate push scalar
                const force = kRepulsion / distSq;
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;
                
                // Subtract from original and add to target
                u.vx -= fx;
                u.vy -= fy;
                v.vx += fx;
                v.vy += fy;
            }
        }
    }

    // Apply attractive spring forces on links (Hooke elasticity force)
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    edges.forEach(e => {
        const u = nodeMap.get(e.source);
        const v = nodeMap.get(e.target);
        if (!u || !v) return;

        const dx = v.x - u.x;
        const dy = v.y - u.y;
        const dist = Math.sqrt(dx*dx + dy*dy) || 1;
        
        // Elasticity parameter adjusts based on tag links or explicit link types
        const strength = e.type === "explicit" ? kSpring : kSpring * 0.35;
        const targetLen = e.type === "explicit" ? restLength : restLength * 1.5;
        
        const force = (dist - targetLen) * strength;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        u.vx += fx;
        u.vy += fy;
        v.vx -= fx;
        v.vy -= fy;
    });

    // Displace nodes using current velocity bounds
    nodes.forEach(n => {
        if (n === dragNode) return; // ignore layout physics on manually dragged item
        
        n.x += n.vx;
        n.y += n.vy;
        
        // Friction damping
        n.vx *= damping;
        n.vy *= damping;
    });
}

function drawGraph() {
    if (!canvas || !ctx) return;
    
    // Clear viewport canvas
    ctx.clearRect(0,0, canvas.width, canvas.height);
    
    ctx.save();
    // Apply pan & zoom transforms
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.k, transform.k);
    
    // 1. Paint Edges
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    edges.forEach(e => {
        const u = nodeMap.get(e.source);
        const v = nodeMap.get(e.target);
        if (!u || !v) return;
        
        ctx.beginPath();
        ctx.moveTo(u.x, u.y);
        ctx.lineTo(v.x, v.y);
        
        if (e.type === "explicit") {
            ctx.strokeStyle = "#38bdf8"; // Light Blue for explicit
            ctx.lineWidth = 1.8;
            ctx.setLineDash([]); // solid lines
        } else {
            ctx.strokeStyle = "rgba(48, 54, 61, 0.4)"; // Soft grey transparent for soft tags
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]); // dashed lines
        }
        ctx.stroke();
        
        // Draw relationship arrows for explicit connections
        if (e.type === "explicit" && e.source !== e.target) {
            drawArrowhead(ctx, u.x, u.y, v.x, v.y, u.radius, v.radius);
        }
    });

    // 2. Paint Nodes
    nodes.forEach(node => {
        const colorPalette = getNodeColors(node.bucket);
        
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, 2*Math.PI);
        
        // Fill gradient
        const grad = ctx.createRadialGradient(node.x, node.y, 2, node.x, node.y, node.radius);
        grad.addColorStop(0, colorPalette.fill);
        grad.addColorStop(1, colorPalette.gradientEnd);
        ctx.fillStyle = grad;
        ctx.fill();
        
        // White active outer selection borders
        if (node === currentHoverNode) {
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 2.5;
            ctx.shadowColor = "#ffffff";
            ctx.shadowBlur = 12;
        } else {
            ctx.strokeStyle = colorPalette.border;
            ctx.lineWidth = 1.5;
            ctx.shadowColor = "transparent";
            ctx.shadowBlur = 0;
        }
        ctx.stroke();
        ctx.shadowBlur = 0; // reset
        
        // Node labels
        ctx.font = "bold 9px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#8b949e";
        
        // ID Badge
        ctx.fillText(node.id, node.x, node.y - node.radius - 12);
        
        // Title Text
        ctx.font = "9px sans-serif";
        ctx.fillStyle = "#e6edf3";
        const textVal = node.title.length > 20 ? node.title.substring(0, 18) + '...' : node.title;
        ctx.fillText(textVal, node.x, node.y + node.radius + 11);
    });
    
    ctx.restore();
}

function drawArrowhead(ctx, fromX, fromY, toX, toY, fromRadius, toRadius) {
    const angle = Math.atan2(toY - fromY, toX - fromX);
    
    // Stop at node borders
    const targetX = toX - (toRadius + 2) * Math.cos(angle);
    const targetY = toY - (toRadius + 2) * Math.sin(angle);
    
    const arrowLength = 7;
    const arrowWidth = 4;
    
    ctx.beginPath();
    ctx.moveTo(targetX, targetY);
    ctx.lineTo(targetX - arrowLength * Math.cos(angle - Math.PI/9), targetY - arrowLength * Math.sin(angle - Math.PI/9));
    ctx.lineTo(targetX - arrowLength * Math.cos(angle + Math.PI/9), targetY - arrowLength * Math.sin(angle + Math.PI/9));
    ctx.closePath();
    
    ctx.fillStyle = "#38bdf8";
    ctx.fill();
}

function getNodeColors(bucket) {
    switch (bucket.toUpperCase()) {
        case "GOAL": return { fill: "#7c3aed", gradientEnd: "#6d28d9", border: "#a78bfa" };      // Purple
        case "NOTE": return { fill: "#2563eb", gradientEnd: "#1d4ed8", border: "#60a5fa" };      // Blue
        case "TASK": return { fill: "#d97706", gradientEnd: "#b45309", border: "#fbbf24" };      // Yellow
        case "ISSUE": return { fill: "#dc2626", gradientEnd: "#b91c1c", border: "#f87171" };     // Red
        default: return { fill: "#4b5563", gradientEnd: "#374151", border: "#9ca3af" };          // Grey
    }
}

// Event Vector Trackers
function getMousePosFromCanvas(e) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Reverse coordinate transforms (zoom & pan offsets)
    const graphSpaceX = (mouseX - transform.x) / transform.k;
    const graphSpaceY = (mouseY - transform.y) / transform.k;
    
    return { x: graphSpaceX, y: graphSpaceY };
}

function findClosestNodeAtPosition(point, extraRadius = 0) {
    let closestNode = null;
    let closestDistanceSq = Infinity;

    nodes.forEach((node) => {
        const dx = point.x - node.x;
        const dy = point.y - node.y;
        const hitRadius = node.radius + extraRadius;
        const distanceSq = dx * dx + dy * dy;

        if (distanceSq <= hitRadius * hitRadius && distanceSq < closestDistanceSq) {
            closestNode = node;
            closestDistanceSq = distanceSq;
        }
    });

    return closestNode;
}

function onCanvasMouseDown(e) {
    const m = getMousePosFromCanvas(e);
    const hitNode = findClosestNodeAtPosition(m, 4);

    if (hitNode) {
        dragNode = hitNode;
        // Float side information details panel
        populateNodeDetailsWidget(hitNode);
        triggerGraphSimulation();
    } else {
        isPanning = true;
        startPanMouse = { x: e.clientX, y: e.clientY };
    }
}

function onCanvasMouseMove(e) {
    const m = getMousePosFromCanvas(e);
    
    if (dragNode) {
        dragNode.x = m.x;
        dragNode.y = m.y;
        dragNode.vx = 0;
        dragNode.vy = 0;
        triggerGraphSimulation();
        return;
    }

    if (isPanning) {
        const dx = e.clientX - startPanMouse.x;
        const dy = e.clientY - startPanMouse.y;
        
        transform.x += dx;
        transform.y += dy;
        
        startPanMouse = { x: e.clientX, y: e.clientY };
        triggerGraphSimulation();
        return;
    }

    const hover = findClosestNodeAtPosition(m, 6);

    if (hover !== currentHoverNode) {
        currentHoverNode = hover;
        canvas.style.cursor = hover ? "pointer" : "grab";
        triggerGraphSimulation();
    }
}

function onCanvasMouseUp() {
    dragNode = null;
    isPanning = false;
}

function onCanvasWheel(e) {
    e.preventDefault();
    const zoomIntensity = 0.06;
    
    // Zoom centered at mouse position coords
    const rect = canvas.getBoundingClientRect();
    const ex = e.clientX - rect.left;
    const ey = e.clientY - rect.top;
    
    const mouseX = (ex - transform.x) / transform.k;
    const mouseY = (ey - transform.y) / transform.k;

    const zoomFactor = e.deltaY < 0 ? (1 + zoomIntensity) : (1 - zoomIntensity);
    const nextScale = Math.min(Math.max(transform.k * zoomFactor, 0.25), 4);
    
    transform.k = nextScale;
    transform.x = ex - mouseX * transform.k;
    transform.y = ey - mouseY * transform.k;

    triggerGraphSimulation();
}

function onCanvasDoubleClick(e) {
    const m = getMousePosFromCanvas(e);
    const hitNode = findClosestNodeAtPosition(m, 6);
    if (hitNode) {
        snapFocusToNote(hitNode.id);
    }
}

function populateNodeDetailsWidget(node) {
    const details = document.getElementById("graphNodeDetails");
    const badge = document.getElementById("nodeDetailsBadge");
    const title = document.getElementById("nodeDetailsTitle");
    const desc = document.getElementById("nodeDetailsDesc");
    const tagsDiv = document.getElementById("nodeDetailsTags");
    
    if (!details) return;
    
    details.classList.remove("hidden");
    
    title.innerText = node.title;
    const detailIdEl = document.getElementById('nodeDetailsId');
    if (detailIdEl) detailIdEl.innerText = node.id;
    desc.textContent = toPlainTextPreview(node.description || "No description detailed.");
    
    badge.innerText = node.bucket;
    badge.className = `text-2xs px-2.5 py-0.5 rounded-full font-bold ${getStatusClass(node.status)}`;
    
    tagsDiv.innerHTML = "";
    node.tags.forEach(t => {
        if (!t) return;
        const tSpan = document.createElement("span");
        tSpan.className = "bg-gray-800 text-gray-400 px-2 py-0.5 rounded text-3xs font-bold border border-gray-750";
        tSpan.innerText = `#${t}`;
        tagsDiv.appendChild(tSpan);
    });
}

// Window resizing adjustments
window.addEventListener("resize", () => {
    if (!isMobileViewport()) {
        closeMobileSidebar();
    }

    syncSidebarCollapsedState(localStorage.getItem("sidebarCollapsed") === "true");
    syncResponsiveUI();

    if (currentViewEnv === "graph") {
        fetchAndRenderGraph();
    }
});

// Logic for dynamic hybrid UI
function runContextChipCommand(cmd) {
    if (cmd === '✨ Summarize') {
        const btn = document.getElementById('summarizeBtn');
        if (btn) btn.click();
    } else if (cmd === '🎯 Add a Goal') {
        chatInput.value = 'GOAL | ';
        chatInput.focus();
    } else if (cmd === '⏳ Open Tasks') {
        chatInput.value = '/search status:open bucket:TASK';
        chatForm.dispatchEvent(new Event("submit"));
    } else if (cmd === '🚨 Search Issues') {
        chatInput.value = '/search status:open bucket:ISSUE';
        chatForm.dispatchEvent(new Event("submit"));
    }
}

async function renderExploreTagsCloud() {
    const list = document.getElementById("dynamicTagsList");
    if (!list) return;
    
    try {
        const res = await fetch(`${API_BASE}/search?q=`);
        if (res.ok) {
            const data = await res.json();
            const tagCounts = {};
            data.forEach(entry => {
                if (entry.tags) {
                    entry.tags.split(',').forEach(tag => {
                        const t = tag.trim( ).toLowerCase();
                        if (t) tagCounts[t] = (tagCounts[t] || 0) + 1;
                    });
                }
            });
            
            const maxTags = isMobileViewport() ? 8 : 10;
            const sortedTags = Object.entries(tagCounts)
                .sort((a,b) => b[1] - a[1])
                .slice(0, maxTags);
                
            if (sortedTags.length > 0) {
                list.innerHTML = "";
                sortedTags.forEach(([tag, count]) => {
                    const btn = document.createElement("button");
                    btn.type = "button";
                    btn.className = "px-3 py-1.5 bg-gray-900 border border-gray-800 hover:bg-gray-800 text-gray-300 rounded-full text-xs font-semibold shadow-sm transition transform active:scale-95 inline-flex items-center space-x-1.5";
                    btn.innerHTML = `<span>${tag}</span><span class="text-3xs text-gray-500 bg-gray-950 px-1.5 py-0.5 rounded-full">${count}</span>`;
                    btn.onclick = () => {
                        chatInput.value = '/search ' + tag;
                        chatForm.dispatchEvent(new Event("submit"));
                    };
                    list.appendChild(btn);
                });
            } else {
                list.innerHTML = "<div class='italic text-xs text-gray-500'>Write your first entry to see tags here!</div>";
            }
        }
    } catch(e) {
        list.innerHTML = "<div class='italic text-xs text-gray-500'>Could not load tags.</div>";
    }
}

document.addEventListener("DOMContentLoaded", () => {
    setQuickBucketDropdownOpen(false);
});

// Adjustable column resizer logic
document.addEventListener('mousedown', function(e) {
    if (e.target.classList.contains('column-resizer')) {
        const resizer = e.target;
        const colVar = resizer.getAttribute('data-col');
        const shell = document.getElementById('timelineContentShell');
        if (!shell) return;
        
        const startX = e.pageX;
        const startWidth = resizer.parentElement.getBoundingClientRect().width;
        
        resizer.classList.add('resizing');
        document.body.style.cursor = 'col-resize';
        e.preventDefault(); // Prevent text selection
        
        function onMouseMove(moveEvent) {
            const newWidth = startWidth + (moveEvent.pageX - startX);
            shell.style.setProperty(colVar, `${Math.max(100, newWidth)}px`);
        }
        
        function onMouseUp() {
            resizer.classList.remove('resizing');
            document.body.style.cursor = '';
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        }
        
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }
});
