const STORAGE_KEY = "mural-digital-state";
const MAX_POST_LENGTH = 280;

const defaultState = {
  currentUserId: null,
  authMode: "login",
  activeView: "feed",
  filterTopic: "all",
  searchQuery: "",
  users: [
    {
      id: "u-demo",
      name: "Maria Silva",
      email: "maria@demo.com",
      password: "1234",
      role: "admin",
    },
  ],
  topics: [
    { id: "t-education", name: "Educacao", description: "Escolas, cursos, bibliotecas e formacao." },
    { id: "t-health", name: "Saude", description: "Atendimento, prevencao e cuidado nos bairros." },
    { id: "t-mobility", name: "Mobilidade", description: "Transporte, ruas, acessibilidade e seguranca." },
  ],
  posts: [
    {
      id: "p-1",
      userId: "u-demo",
      topicId: "t-education",
      text: "Uma biblioteca comunitaria no bairro poderia ser ponto de estudo, oficinas e encontros com jovens.",
      photo:
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1100' height='720' viewBox='0 0 1100 720'%3E%3Crect width='1100' height='720' fill='%23edf4ef'/%3E%3Crect x='120' y='180' width='760' height='360' rx='24' fill='%23ffffff' stroke='%23dfe5df' stroke-width='8'/%3E%3Crect x='180' y='240' width='220' height='240' rx='12' fill='%23f2c14e'/%3E%3Crect x='440' y='240' width='300' height='34' rx='8' fill='%231d6f51'/%3E%3Crect x='440' y='306' width='420' height='24' rx='8' fill='%23376996' opacity='.75'/%3E%3Crect x='440' y='360' width='360' height='24' rx='8' fill='%23d96c5f' opacity='.75'/%3E%3Crect x='440' y='414' width='260' height='24' rx='8' fill='%2310231a' opacity='.35'/%3E%3C/svg%3E",
      createdAt: Date.now() - 1000 * 60 * 45,
      editedAt: null,
      likes: ["u-demo"],
      comments: [
        {
          id: "c-1",
          userId: "u-demo",
          text: "Podemos mapear espacos publicos vazios para comecar pequeno.",
          createdAt: Date.now() - 1000 * 60 * 30,
        },
      ],
    },
  ],
};

let state = loadState();
let selectedPhotoData = "";

const elements = {
  accountBox: document.querySelector("#accountBox"),
  authScreen: document.querySelector("#authScreen"),
  workspace: document.querySelector("#workspace"),
  authForm: document.querySelector("#authForm"),
  nameInput: document.querySelector("#nameInput"),
  emailInput: document.querySelector("#emailInput"),
  passwordInput: document.querySelector("#passwordInput"),
  authNote: document.querySelector("#authNote"),
  postForm: document.querySelector("#postForm"),
  postText: document.querySelector("#postText"),
  charCount: document.querySelector("#charCount"),
  photoInput: document.querySelector("#photoInput"),
  photoName: document.querySelector("#photoName"),
  photoPreview: document.querySelector("#photoPreview"),
  clearPhotoButton: document.querySelector("#clearPhotoButton"),
  topicSelect: document.querySelector("#topicSelect"),
  searchInput: document.querySelector("#searchInput"),
  filterSelect: document.querySelector("#filterSelect"),
  postList: document.querySelector("#postList"),
  topicForm: document.querySelector("#topicForm"),
  newTopicInput: document.querySelector("#newTopicInput"),
  topicList: document.querySelector("#topicList"),
  profilePanel: document.querySelector("#profilePanel"),
};

document.querySelectorAll("[data-auth-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    state.authMode = button.dataset.authMode;
    saveState();
    renderAuthMode();
  });
});

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => {
    state.activeView = button.dataset.view;
    saveState();
    render();
  });
});

elements.authForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const email = elements.emailInput.value.trim().toLowerCase();
  const password = elements.passwordInput.value;
  const name = elements.nameInput.value.trim();

  if (!email || !password) {
    showAuthNote("Preencha email e senha.");
    return;
  }

  if (password.length < 4) {
    showAuthNote("A senha precisa ter pelo menos 4 caracteres.");
    return;
  }

  if (state.authMode === "register") {
    if (!name) {
      showAuthNote("Informe seu nome para criar a conta.");
      return;
    }

    if (state.users.some((user) => user.email === email)) {
      showAuthNote("Este email ja esta cadastrado. Entre com sua senha.");
      return;
    }

    const user = { id: createId(), name, email, password, role: "member" };
    state.users.push(user);
    state.currentUserId = user.id;
  } else {
    const user = state.users.find((candidate) => candidate.email === email && candidate.password === password);
    if (!user) {
      showAuthNote("Email ou senha incorretos.");
      return;
    }
    state.currentUserId = user.id;
  }

  elements.authForm.reset();
  saveState();
  render();
});

elements.postText.addEventListener("input", renderCharacterCount);

elements.photoInput.addEventListener("change", async () => {
  const file = elements.photoInput.files[0];
  if (!file) {
    clearSelectedPhoto();
    return;
  }

  if (!file.type.startsWith("image/")) {
    alert("Selecione um arquivo de imagem.");
    clearSelectedPhoto();
    return;
  }

  selectedPhotoData = await readFileAsDataUrl(file);
  elements.photoName.textContent = file.name;
  elements.photoPreview.src = selectedPhotoData;
  elements.photoPreview.classList.remove("hidden");
  elements.clearPhotoButton.classList.remove("hidden");
});

elements.clearPhotoButton.addEventListener("click", clearSelectedPhoto);

elements.postForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const user = getCurrentUser();
  const text = elements.postText.value.trim();
  if (!user || !text) return;

  state.posts.unshift({
    id: createId(),
    userId: user.id,
    topicId: elements.topicSelect.value,
    text,
    photo: selectedPhotoData,
    createdAt: Date.now(),
    editedAt: null,
    likes: [],
    comments: [],
  });

  elements.postForm.reset();
  clearSelectedPhoto();
  renderCharacterCount();
  saveState();
  render();
});

elements.searchInput.addEventListener("input", () => {
  state.searchQuery = elements.searchInput.value.trim();
  saveState();
  renderPosts();
});

elements.filterSelect.addEventListener("change", () => {
  state.filterTopic = elements.filterSelect.value;
  saveState();
  renderPosts();
});

elements.topicForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = elements.newTopicInput.value.trim();
  if (!name) return;

  if (state.topics.some((topic) => topic.name.toLowerCase() === name.toLowerCase())) {
    alert("Este tema ja existe.");
    return;
  }

  state.topics.push({
    id: createId(),
    name,
    description: "Tema criado pela comunidade para organizar novas conversas.",
  });
  elements.newTopicInput.value = "";
  saveState();
  render();
});

function loadState() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return cloneDefaultState();

  try {
    return normalizeState({ ...cloneDefaultState(), ...JSON.parse(stored) });
  } catch {
    return cloneDefaultState();
  }
}

function normalizeState(nextState) {
  nextState.users = Array.isArray(nextState.users) ? nextState.users : cloneDefaultState().users;
  nextState.topics = Array.isArray(nextState.topics) ? nextState.topics : cloneDefaultState().topics;
  nextState.posts = Array.isArray(nextState.posts) ? nextState.posts : cloneDefaultState().posts;
  nextState.searchQuery = nextState.searchQuery || "";
  nextState.users = nextState.users.map((user) => ({ role: "member", ...user }));
  nextState.posts = nextState.posts.map((post) => ({
    editedAt: null,
    likes: [],
    comments: [],
    photo: "",
    ...post,
  }));
  return nextState;
}

function cloneDefaultState() {
  return JSON.parse(JSON.stringify(defaultState));
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getCurrentUser() {
  return state.users.find((user) => user.id === state.currentUserId) || null;
}

function showAuthNote(message) {
  elements.authNote.textContent = message;
}

function render() {
  const user = getCurrentUser();
  elements.authScreen.classList.toggle("hidden", Boolean(user));
  elements.workspace.classList.toggle("hidden", !user);
  renderAuthMode();
  renderAccount(user);

  if (!user) return;
  renderNavigation();
  renderTopicControls();
  renderCharacterCount();
  renderPosts();
  renderTopics();
  renderProfile(user);
}

function renderAuthMode() {
  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.authMode === state.authMode);
  });
  elements.nameInput.parentElement.classList.toggle("hidden", state.authMode === "login");
  elements.authForm.querySelector(".primary-button").textContent = state.authMode === "login" ? "Entrar" : "Criar conta";
  elements.authNote.textContent =
    state.authMode === "login"
      ? "Use maria@demo.com / 1234 para testar agora."
      : "A conta sera salva localmente neste navegador.";
}

function renderAccount(user) {
  if (!user) {
    elements.accountBox.innerHTML = "";
    return;
  }

  elements.accountBox.innerHTML = `
    <div class="avatar">${getInitials(user.name)}</div>
    <strong>${escapeHtml(user.name)}</strong>
    <button class="logout-button" type="button">Sair</button>
  `;
  elements.accountBox.querySelector("button").addEventListener("click", () => {
    state.currentUserId = null;
    saveState();
    render();
  });
}

function renderNavigation() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.activeView);
  });

  document.querySelector("#feedView").classList.toggle("hidden", state.activeView !== "feed");
  document.querySelector("#topicsView").classList.toggle("hidden", state.activeView === "profile");
  document.querySelector("#profileView").classList.toggle("hidden", state.activeView !== "profile");
}

function renderTopicControls() {
  const topicOptions = state.topics.map((topic) => `<option value="${topic.id}">${escapeHtml(topic.name)}</option>`).join("");
  elements.topicSelect.innerHTML = topicOptions;
  elements.filterSelect.innerHTML =
    `<option value="all">Todos os temas</option>` +
    state.topics.map((topic) => `<option value="${topic.id}">${escapeHtml(topic.name)}</option>`).join("");
  elements.filterSelect.value = state.filterTopic;
  elements.searchInput.value = state.searchQuery;
}

function renderCharacterCount() {
  elements.charCount.textContent = `${elements.postText.value.length}/${MAX_POST_LENGTH}`;
}

function renderPosts() {
  const template = document.querySelector("#postTemplate");
  const user = getCurrentUser();
  const query = state.searchQuery.toLowerCase();
  const posts = state.posts.filter((post) => {
    const author = state.users.find((candidate) => candidate.id === post.userId);
    const topic = state.topics.find((candidate) => candidate.id === post.topicId);
    const matchesTopic = state.filterTopic === "all" || post.topicId === state.filterTopic;
    const searchable = `${post.text} ${author?.name || ""} ${topic?.name || ""}`.toLowerCase();
    return matchesTopic && (!query || searchable.includes(query));
  });

  elements.postList.innerHTML = "";
  if (!posts.length) {
    elements.postList.innerHTML = `<article class="post-card"><p>Nenhuma publicacao encontrada.</p></article>`;
    return;
  }

  posts.forEach((post) => {
    const author = state.users.find((candidate) => candidate.id === post.userId);
    const topic = state.topics.find((candidate) => candidate.id === post.topicId);
    const node = template.content.cloneNode(true);
    const article = node.querySelector(".post-card");

    article.dataset.postId = post.id;
    node.querySelector(".avatar").textContent = getInitials(author?.name || "Pessoa");
    node.querySelector(".post-author").textContent = author?.name || "Pessoa";
    node.querySelector(".post-time").textContent = `${formatTime(post.createdAt)}${post.editedAt ? " | editado" : ""}`;
    node.querySelector(".topic-pill").textContent = topic?.name || "Tema";
    node.querySelector(".post-body").textContent = post.text;

    const photo = node.querySelector(".post-photo");
    if (post.photo) {
      photo.src = post.photo;
      photo.alt = `Foto publicada por ${author?.name || "participante"}`;
    } else {
      photo.remove();
    }

    const ownerActions = node.querySelector(".post-owner-actions");
    if (user.id === post.userId || user.role === "admin") {
      ownerActions.classList.remove("hidden");
      ownerActions.querySelector(".edit-post-button").addEventListener("click", () => editPost(post.id));
      ownerActions.querySelector(".delete-post-button").addEventListener("click", () => deletePost(post.id));
    }

    const liked = post.likes.includes(user.id);
    const likeButton = node.querySelector(".like-button");
    likeButton.textContent = `${liked ? "Curtido" : "Curtir"} (${post.likes.length})`;
    likeButton.addEventListener("click", () => toggleLike(post.id));

    const commentForm = node.querySelector(".comment-form");
    commentForm.classList.add("hidden");
    node.querySelector(".comment-toggle").textContent = `Comentar (${post.comments.length})`;
    node.querySelector(".comment-toggle").addEventListener("click", () => {
      commentForm.classList.toggle("hidden");
      if (!commentForm.classList.contains("hidden")) {
        commentForm.querySelector("input").focus();
      }
    });

    const comments = node.querySelector(".comments");
    comments.innerHTML = post.comments.map((comment) => renderComment(comment, user)).join("");
    comments.querySelectorAll("[data-delete-comment]").forEach((button) => {
      button.addEventListener("click", () => deleteComment(post.id, button.dataset.deleteComment));
    });

    commentForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const input = event.currentTarget.querySelector("input");
      addComment(post.id, input.value.trim());
    });

    elements.postList.appendChild(node);
  });
}

function renderComment(comment, user) {
  const commenter = state.users.find((candidate) => candidate.id === comment.userId);
  const canDelete = user.id === comment.userId || user.role === "admin";
  const deleteButton = canDelete
    ? `<button class="comment-delete" data-delete-comment="${comment.id}" type="button">Excluir</button>`
    : "";

  return `
    <div class="comment">
      <div>
        <strong>${escapeHtml(commenter?.name || "Pessoa")}</strong>
        <span>${escapeHtml(comment.text)}</span>
      </div>
      ${deleteButton}
    </div>
  `;
}

function renderTopics() {
  elements.topicList.innerHTML = "";

  state.topics.forEach((topic) => {
    const postCount = state.posts.filter((post) => post.topicId === topic.id).length;
    const commentCount = state.posts
      .filter((post) => post.topicId === topic.id)
      .reduce((total, post) => total + post.comments.length, 0);

    const article = document.createElement("article");
    article.className = "topic-card";
    article.innerHTML = `
      <strong>${escapeHtml(topic.name)}</strong>
      <span>${escapeHtml(topic.description)}</span>
      <span>${postCount} publicacoes | ${commentCount} comentarios</span>
      <button class="ghost-button" type="button">Ver debate</button>
    `;
    article.querySelector("button").addEventListener("click", () => {
      state.filterTopic = topic.id;
      state.activeView = "feed";
      saveState();
      render();
    });
    elements.topicList.appendChild(article);
  });
}

function renderProfile(user) {
  const posts = state.posts.filter((post) => post.userId === user.id);
  const comments = state.posts.reduce(
    (total, post) => total + post.comments.filter((comment) => comment.userId === user.id).length,
    0
  );

  elements.profilePanel.innerHTML = `
    <div class="avatar">${getInitials(user.name)}</div>
    <h3>${escapeHtml(user.name)}</h3>
    <p>${escapeHtml(user.email)}</p>
    <div class="profile-stats">
      <span><strong>${posts.length}</strong> publicacoes</span>
      <span><strong>${comments}</strong> comentarios</span>
      <span><strong>${state.posts.reduce((total, post) => total + post.likes.length, 0)}</strong> curtidas</span>
    </div>
    <form class="profile-form" id="profileForm">
      <label>Nome<input id="profileName" value="${escapeAttribute(user.name)}" required /></label>
      <label>Email<input id="profileEmail" value="${escapeAttribute(user.email)}" required type="email" /></label>
      <label>Nova senha<input id="profilePassword" minlength="4" placeholder="Deixe vazio para manter" type="password" /></label>
      <button class="primary-button" type="submit">Salvar perfil</button>
    </form>
    <div class="data-actions">
      <button class="ghost-button" id="exportButton" type="button">Exportar dados</button>
      <button class="ghost-button" id="importButton" type="button">Importar dados</button>
      <button class="danger-button" id="resetButton" type="button">Limpar mural</button>
    </div>
  `;

  document.querySelector("#profileForm").addEventListener("submit", updateProfile);
  document.querySelector("#exportButton").addEventListener("click", exportData);
  document.querySelector("#importButton").addEventListener("click", importData);
  document.querySelector("#resetButton").addEventListener("click", resetData);
}

function updateProfile(event) {
  event.preventDefault();
  const user = getCurrentUser();
  const name = document.querySelector("#profileName").value.trim();
  const email = document.querySelector("#profileEmail").value.trim().toLowerCase();
  const password = document.querySelector("#profilePassword").value;

  if (!user || !name || !email) return;

  if (state.users.some((candidate) => candidate.email === email && candidate.id !== user.id)) {
    alert("Este email ja esta em uso.");
    return;
  }

  user.name = name;
  user.email = email;
  if (password) user.password = password;

  saveState();
  render();
}

function toggleLike(postId) {
  const user = getCurrentUser();
  const post = state.posts.find((candidate) => candidate.id === postId);
  if (!user || !post) return;

  post.likes = post.likes.includes(user.id)
    ? post.likes.filter((userId) => userId !== user.id)
    : [...post.likes, user.id];
  saveState();
  renderPosts();
  renderTopics();
  renderProfile(user);
}

function editPost(postId) {
  const post = state.posts.find((candidate) => candidate.id === postId);
  if (!post) return;

  const nextText = prompt("Edite a publicacao:", post.text);
  if (nextText === null) return;
  const cleanText = nextText.trim();
  if (!cleanText) {
    alert("A publicacao nao pode ficar vazia.");
    return;
  }

  post.text = cleanText.slice(0, MAX_POST_LENGTH);
  post.editedAt = Date.now();
  saveState();
  renderPosts();
}

function deletePost(postId) {
  if (!confirm("Excluir esta publicacao e todos os comentarios?")) return;
  state.posts = state.posts.filter((post) => post.id !== postId);
  saveState();
  render();
}

function addComment(postId, text) {
  const user = getCurrentUser();
  const post = state.posts.find((candidate) => candidate.id === postId);
  if (!user || !post || !text) return;

  post.comments.push({
    id: createId(),
    userId: user.id,
    text,
    createdAt: Date.now(),
  });
  saveState();
  renderPosts();
  renderTopics();
  renderProfile(user);
}

function deleteComment(postId, commentId) {
  const post = state.posts.find((candidate) => candidate.id === postId);
  if (!post || !confirm("Excluir este comentario?")) return;

  post.comments = post.comments.filter((comment) => comment.id !== commentId);
  saveState();
  renderPosts();
  renderTopics();
  renderProfile(getCurrentUser());
}

function exportData() {
  const payload = JSON.stringify(state, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "mural-digital-dados.json";
  link.click();
  URL.revokeObjectURL(url);
}

function importData() {
  const payload = prompt("Cole aqui o JSON exportado do mural:");
  if (!payload) return;

  try {
    const imported = normalizeState(JSON.parse(payload));
    if (!Array.isArray(imported.users) || !Array.isArray(imported.posts) || !Array.isArray(imported.topics)) {
      throw new Error("Formato invalido");
    }
    state = imported;
    saveState();
    render();
  } catch {
    alert("Nao foi possivel importar. Verifique se o JSON esta correto.");
  }
}

function resetData() {
  if (!confirm("Limpar todos os dados locais e voltar ao exemplo inicial?")) return;
  state = cloneDefaultState();
  selectedPhotoData = "";
  saveState();
  render();
}

function clearSelectedPhoto() {
  selectedPhotoData = "";
  elements.photoInput.value = "";
  elements.photoName.textContent = "Nenhuma foto selecionada";
  elements.photoPreview.removeAttribute("src");
  elements.photoPreview.classList.add("hidden");
  elements.clearPhotoButton.classList.add("hidden");
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getInitials(name) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

function createId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatTime(timestamp) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

render();
