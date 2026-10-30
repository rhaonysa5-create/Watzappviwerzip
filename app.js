/**
 * WhatsApp Export Viewer
 */
(() => {
  "use strict";

  const state = {
    chats: [],
    currentChatId: null,
    zip: null,
    editPhotoData: null,
  };

  const $ = (sel) => document.querySelector(sel);
  const btnLoad = $("#btnLoad");
  const zipInput = $("#zipInput");
  const chatList = $("#chatList");
  const welcome = $("#welcome");
  const chatView = $("#chatView");
  const messagesEl = $("#messages");
  const chatTitle = $("#chatTitle");
  const chatMeta = $("#chatMeta");
  const chatAvatar = $("#chatAvatar");
  const btnBack = $("#btnBack");
  const lightbox = $("#lightbox");
  const lightboxImg = $("#lightboxImg");
  const toast = $("#toast");
  const editModal = $("#editModal");
  const editNameInput = $("#editNameInput");
  const editPhotoInput = $("#editPhotoInput");
  const editAvatarPreview = $("#editAvatarPreview");
  const btnSaveEdit = $("#btnSaveEdit");
  const btnCancelEdit = $("#btnCancelEdit");
  const btnEditContact = $("#btnEditContact");

  // ---------- Utils ----------
  function showToast(msg, isError = false) {
    toast.textContent = msg;
    toast.classList.toggle("error", isError);
    toast.classList.remove("hidden");
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.add("hidden"), 3500);
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getInitials(name) {
    if (!name) return "?";
    const parts = name.replace(/[+\d\s-]/g, " ").trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return name.slice(0, 2).toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  function formatDayLabel(dateStr) {
    const [d, m, y] = dateStr.split("/").map(Number);
    const date = new Date(y, m - 1, d);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return "Hoje";
    if (date.toDateString() === yesterday.toDateString()) return "Ontem";
    const months = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
    return `${d} de ${months[m - 1]} de ${y}`;
  }

  // ---------- Contact overrides (localStorage) ----------
  function loadOverrides() {
    try { return JSON.parse(localStorage.getItem("wa_contact_overrides") || "{}"); }
    catch { return {}; }
  }

  function saveOverrides(obj) {
    localStorage.setItem("wa_contact_overrides", JSON.stringify(obj));
  }

  function getContactDisplay(chat) {
    const o = loadOverrides()[chat.id] || {};
    return {
      name: o.name || chat.name,
      photo: o.photo || null,
    };
  }

  function setAvatarEl(el, name, photo) {
    if (photo) {
      el.style.backgroundImage = `url(${photo})`;
      el.textContent = "";
    } else {
      el.style.backgroundImage = "";
      el.textContent = getInitials(name);
    }
  }

  // ---------- Parser ----------
  function parseChatText(text, fileName) {
    const lines = text.split(/\r?\n/);
    const messages = [];
    const participants = new Set();
    const reLine = /^\[?(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?)\]?\s+-\s+(?:(.+?):\s)?([\s\S]*)$/;
    let current = null;

    for (const raw of lines) {
      const line = raw.replace(/^\u200e|\u200f/g, "");
      const match = line.match(reLine);
      if (match) {
        if (current) messages.push(current);
        const [, date, time, sender, body] = match;
        if (sender) participants.add(sender.trim());
        current = { date, time, sender: sender ? sender.trim() : null, text: body || "", isSystem: !sender, media: null };
      } else if (current) {
        current.text += "\n" + line;
      }
    }
    if (current) messages.push(current);

    const mediaRe = /(?:[\u200e\u200f])?([^\n]+?\.(?:jpg|jpeg|png|gif|webp|opus|ogg|mp3|m4a|aac|wav|mp4|webm|avi|mov|3gp|pdf|doc|docx|xls|xlsx|zip|apk|vcf|txt|bin))(?:\s*\(arquivo anexado\))?/i;
    const hiddenMediaRe = /<(Mídia oculta|Media omitted|imagem ocultada|áudio ocultado|vídeo ocultado|sticker omitido|documento omitido)>/i;

    for (const msg of messages) {
      const m = msg.text.match(mediaRe);
      if (m) {
        const rawName = m[1].replace(/[\u200e\u200f\u202a-\u202e]/g, "").trim();
        msg.media = { fileName: rawName, type: guessMediaType(rawName) };
        msg.text = msg.text.replace(mediaRe, "").replace(/\s*\(arquivo anexado\)/gi, "").replace(/^[\u200e\u200f]+/, "").trim();
      } else if (hiddenMediaRe.test(msg.text)) {
        msg.media = { fileName: null, type: "hidden", label: msg.text.match(hiddenMediaRe)[1] };
        msg.text = msg.text.replace(hiddenMediaRe, "").trim();
      }
    }

    let name = fileName
      .replace(/\.txt$/i, "")
      .replace(/^Conversa do WhatsApp com\s+/i, "")
      .replace(/^WhatsApp Chat with\s+/i, "")
      .replace(/^Chat de WhatsApp con\s+/i, "")
      .trim() || "Conversa";

    return { id: fileName, name, messages, participants: Array.from(participants), mediaMap: {} };
  }

  function guessMediaType(fileName) {
    const ext = (fileName.split(".").pop() || "").toLowerCase();
    if (["jpg","jpeg","png","gif"].includes(ext)) return "image";
    if (["webp"].includes(ext)) return "sticker";
    if (["opus","ogg","mp3","m4a","aac","wav"].includes(ext)) return "audio";
    if (["mp4","webm","avi","mov","3gp"].includes(ext)) return "video";
    return "file";
  }

  // ---------- ZIP ----------
  async function loadZip(file) {
    showToast("Carregando…");
    btnLoad.disabled = true;
    const overlay = document.createElement("div");
    overlay.className = "loading-overlay";
    overlay.innerHTML = `<div class="spinner"></div><p>Processando…</p>`;
    $("#main").appendChild(overlay);

    try {
      const zip = await JSZip.loadAsync(file);
      state.zip = zip;
      const txtFiles = [];
      const mediaEntries = {};

      zip.forEach((relativePath, entry) => {
        if (entry.dir) return;
        const name = relativePath.split("/").pop();
        const cleanName = name.replace(/[\u200e\u200f\u202a-\u202e]/g, "");
        if (/\.txt$/i.test(cleanName) && !cleanName.startsWith(".")) {
          txtFiles.push({ path: relativePath, name: cleanName });
        } else {
          mediaEntries[name] = relativePath;
          mediaEntries[cleanName] = relativePath;
          mediaEntries[relativePath] = relativePath;
        }
      });

      if (txtFiles.length === 0) throw new Error("Nenhum arquivo de conversa (.txt) encontrado.");

      const chats = [];
      for (const tf of txtFiles) {
        const text = await zip.file(tf.path).async("string");
        const chat = parseChatText(text, tf.name);
        chat.mediaMap = mediaEntries;
        chats.push(chat);
      }

      state.chats = chats;
      renderChatList();

      if (chats.length === 1) openChat(chats[0].id);
      else {
        welcome.classList.remove("hidden");
        chatView.classList.add("hidden");
      }
      showToast(`${chats.length} conversa(s) carregada(s).`);
    } catch (err) {
      console.error(err);
      showToast("Erro: " + (err.message || err), true);
    } finally {
      btnLoad.disabled = false;
      overlay.remove();
    }
  }

  // ---------- Render ----------
  function renderChatList() {
    if (state.chats.length === 0) {
      chatList.innerHTML = `<div class="empty-state"><p>Nenhuma conversa carregada</p><small>Clique em “Carregar conversas”</small></div>`;
      return;
    }
    chatList.innerHTML = state.chats.map((chat) => {
      const disp = getContactDisplay(chat);
      const last = chat.messages[chat.messages.length - 1];
      const preview = last ? (last.media ? "📎 " + (last.media.fileName || "Mídia") : last.text.slice(0, 55)) : "";
      const active = chat.id === state.currentChatId ? "active" : "";
      const avatarStyle = disp.photo ? `style="background-image:url(${disp.photo})"` : "";
      const avatarText = disp.photo ? "" : escapeHtml(getInitials(disp.name));
      return `<div class="chat-item ${active}" data-id="${escapeHtml(chat.id)}">
        <div class="avatar" ${avatarStyle}>${avatarText}</div>
        <div class="info">
          <div class="name">${escapeHtml(disp.name)}</div>
          <div class="preview">${escapeHtml(preview)}</div>
        </div>
        <span class="count">${chat.messages.length}</span>
      </div>`;
    }).join("");

    chatList.querySelectorAll(".chat-item").forEach((el) => {
      el.addEventListener("click", () => openChat(el.dataset.id));
    });
  }

  async function openChat(chatId) {
    const chat = state.chats.find((c) => c.id === chatId);
    if (!chat) return;
    state.currentChatId = chatId;
    renderChatList();

    welcome.classList.add("hidden");
    chatView.classList.remove("hidden");

    const disp = getContactDisplay(chat);
    chatTitle.textContent = disp.name;
    setAvatarEl(chatAvatar, disp.name, disp.photo);
    chatMeta.textContent = `${chat.messages.length} mensagens`;

    if (window.innerWidth <= 768) {
      $("#sidebar").classList.add("hidden-mobile");
    }

    await renderMessages(chat);
  }

  async function renderMessages(chat) {
    messagesEl.innerHTML = "";
    const frag = document.createDocumentFragment();
    let lastDate = null;
    const otherName = getContactDisplay(chat).name;
    const participants = chat.participants;

    for (const msg of chat.messages) {
      if (msg.date !== lastDate) {
        lastDate = msg.date;
        const sep = document.createElement("div");
        sep.className = "day-separator";
        sep.innerHTML = `<span>${escapeHtml(formatDayLabel(msg.date))}</span>`;
        frag.appendChild(sep);
      }

      const row = document.createElement("div");
      if (msg.isSystem) {
        row.className = "message system";
        row.innerHTML = `<div class="bubble">${escapeHtml(msg.text)}</div>`;
        frag.appendChild(row);
        continue;
      }

      const isOut = !isIncoming(msg.sender, otherName, participants);
      row.className = `message ${isOut ? "out" : "in"}`;

      let mediaHtml = "";
      if (msg.media) mediaHtml = await buildMediaHtml(msg.media, chat);

      const showSender = !isOut && participants.length > 2;
      const senderHtml = showSender ? `<div class="sender-name">${escapeHtml(msg.sender)}</div>` : "";
      const textHtml = msg.text ? `<div class="message-text">${linkify(escapeHtml(msg.text))}</div>` : "";

      row.innerHTML = `<div class="bubble">${senderHtml}${mediaHtml}${textHtml}<span class="message-meta">${escapeHtml(msg.time)}</span></div>`;
      frag.appendChild(row);
    }

    messagesEl.appendChild(frag);
    requestAnimationFrame(() => { messagesEl.scrollTop = messagesEl.scrollHeight; });

    messagesEl.querySelectorAll(".media-image").forEach((img) => {
      img.addEventListener("click", () => {
        lightboxImg.src = img.src;
        lightbox.classList.remove("hidden");
      });
    });
  }

  function isIncoming(sender, chatName, participants) {
    if (!sender) return true;
    const s = sender.toLowerCase().trim();
    const n = chatName.toLowerCase().trim();
    if (s === n) return true;
    const sDigits = s.replace(/\D/g, "");
    const nDigits = n.replace(/\D/g, "");
    if (sDigits && nDigits && (sDigits.endsWith(nDigits) || nDigits.endsWith(sDigits))) return true;
    return false;
  }

  async function buildMediaHtml(media, chat) {
    if (media.type === "hidden") {
      return `<div class="media-missing">🔒 ${escapeHtml(media.label || "Mídia oculta")}</div>`;
    }
    const fileName = media.fileName;
    if (!fileName) return `<div class="media-missing">Arquivo não informado</div>`;

    const cleanName = fileName.replace(/[\u200e\u200f\u202a-\u202e]/g, "");
    const path =
      chat.mediaMap[fileName] ||
      chat.mediaMap[cleanName] ||
      chat.mediaMap["\u200e" + cleanName] ||
      Object.entries(chat.mediaMap).find(([k]) => k.replace(/[\u200e\u200f\u202a-\u202e]/g, "") === cleanName)?.[1];

    if (!path || !state.zip.file(path)) {
      return `<div class="media-missing">⚠️ Não encontrado: ${escapeHtml(cleanName)}</div>`;
    }

    try {
      const blob = await state.zip.file(path).async("blob");
      const url = URL.createObjectURL(blob);
      const size = blob.size;
      switch (media.type) {
        case "image":
          return `<img class="media-image" src="${url}" alt="${escapeHtml(fileName)}" loading="lazy" />`;
        case "sticker":
          return `<img class="media-sticker" src="${url}" alt="Sticker" loading="lazy" />`;
        case "audio":
          return `<div class="media-audio"><audio controls preload="metadata" src="${url}"></audio></div>`;
        case "video":
          return `<video class="media-image" controls preload="metadata" src="${url}" style="max-height:280px"></video>`;
        default:
          return `<div class="media-file">
            <div class="file-icon">${escapeHtml((fileName.split(".").pop() || "FILE").slice(0, 4).toUpperCase())}</div>
            <div class="file-info"><div class="file-name">${escapeHtml(fileName)}</div><div class="file-size">${formatBytes(size)}</div></div>
            <a href="${url}" download="${escapeHtml(fileName)}">Baixar</a>
          </div>`;
      }
    } catch (err) {
      return `<div class="media-missing">⚠️ Erro: ${escapeHtml(fileName)}</div>`;
    }
  }

  function linkify(escapedText) {
    return escapedText.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener" style="color:#53bdeb;text-decoration:underline">$1</a>');
  }

  // ---------- Edit contact ----------
  function openEditModal() {
    const chat = state.chats.find((c) => c.id === state.currentChatId);
    if (!chat) return;
    const disp = getContactDisplay(chat);
    editNameInput.value = disp.name;
    state.editPhotoData = disp.photo;
    setAvatarEl(editAvatarPreview, disp.name, disp.photo);
    editModal.classList.remove("hidden");
  }

  function closeEditModal() {
    editModal.classList.add("hidden");
    state.editPhotoData = null;
    editPhotoInput.value = "";
  }

  function saveContactEdit() {
    const chat = state.chats.find((c) => c.id === state.currentChatId);
    if (!chat) return;
    const name = editNameInput.value.trim() || chat.name;
    const overrides = loadOverrides();
    overrides[chat.id] = { name, photo: state.editPhotoData || null };
    saveOverrides(overrides);

    chatTitle.textContent = name;
    setAvatarEl(chatAvatar, name, state.editPhotoData);
    renderChatList();
    closeEditModal();
    showToast("Contato atualizado");
  }

  // ---------- Events ----------
  btnLoad.addEventListener("click", () => zipInput.click());
  zipInput.addEventListener("change", () => {
    const file = zipInput.files?.[0];
    if (file) loadZip(file);
    zipInput.value = "";
  });

  btnBack.addEventListener("click", () => {
    $("#sidebar").classList.remove("hidden-mobile");
    chatView.classList.add("hidden");
    welcome.classList.remove("hidden");
    state.currentChatId = null;
    renderChatList();
  });

  btnEditContact.addEventListener("click", openEditModal);
  btnCancelEdit.addEventListener("click", closeEditModal);
  btnSaveEdit.addEventListener("click", saveContactEdit);

  editPhotoInput.addEventListener("change", () => {
    const file = editPhotoInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      state.editPhotoData = reader.result;
      setAvatarEl(editAvatarPreview, editNameInput.value, reader.result);
    };
    reader.readAsDataURL(file);
  });

  editAvatarPreview.addEventListener("click", () => editPhotoInput.click());

  editModal.addEventListener("click", (e) => {
    if (e.target === editModal) closeEditModal();
  });

  lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox || e.target.classList.contains("lightbox-close")) {
      lightbox.classList.add("hidden");
      lightboxImg.src = "";
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      lightbox.classList.add("hidden");
      lightboxImg.src = "";
      closeEditModal();
    }
  });

  document.body.addEventListener("dragover", (e) => { e.preventDefault(); });
  document.body.addEventListener("drop", (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && (file.name.toLowerCase().endsWith(".zip") || file.type === "application/zip")) {
      loadZip(file);
    } else {
      showToast("Solte um arquivo .zip", true);
    }
  });
})();
