"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabase } from "../lib/supabase";

const defaultDebates = [
  { id: "infraestrutura", slug: "infraestrutura", title: "Infraestrutura", description: "Ruas, calçadas, iluminação e obras." },
  { id: "saude", slug: "saude", title: "Saúde", description: "Atendimento, filas, unidades e prevenção." },
  { id: "educacao", slug: "educacao", title: "Educação", description: "Escolas, creches, transporte e aprendizagem." },
  { id: "seguranca", slug: "seguranca", title: "Segurança", description: "Iluminação, rondas e pontos de risco." },
  { id: "mobilidade", slug: "mobilidade", title: "Mobilidade", description: "Transporte, acessibilidade e trânsito." },
];

const allTopic = { id: "all", slug: "all", title: "Todos", description: "Todos os debates ativos." };

export default function HomePage() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [debates, setDebates] = useState(defaultDebates);
  const [adminProfiles, setAdminProfiles] = useState([]);
  const [adminReports, setAdminReports] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [showAlerts, setShowAlerts] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [activeView, setActiveView] = useState("feed");
  const [adminTab, setAdminTab] = useState("overview");
  const [showProfileSettings, setShowProfileSettings] = useState(false);
  const [activeCommentPostId, setActiveCommentPostId] = useState(null);
  const [viewedProfile, setViewedProfile] = useState(null);
  const [postDraft, setPostDraft] = useState({ body: "", topic: "", street: "", neighborhood: "" });
  const [postImageFile, setPostImageFile] = useState(null);
  const [postPreviewUrl, setPostPreviewUrl] = useState("");
  const [posting, setPosting] = useState(false);
  const [postProgress, setPostProgress] = useState(0);
  const [postStatus, setPostStatus] = useState("");
  const [commentDrafts, setCommentDrafts] = useState({});

  const supabase = useMemo(() => {
    try {
      return getSupabase();
    } catch {
      return null;
    }
  }, []);
  const supabaseReady = Boolean(supabase);
  const isAdmin = profile?.role === "admin";
  const activeDebates = debates.filter((debate) => debate.status !== "archived");
  const topicOptions = [allTopic, ...activeDebates];

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (!session?.user || !supabase) {
      setProfile(null);
      setPosts([]);
      setNotifications([]);
      return;
    }

    loadProfile();
    loadDebates();
    loadPosts();
    loadNotifications();
  }, [session, supabase]);

  useEffect(() => {
    if (isAdmin) loadAdminData();
  }, [isAdmin, posts.length]);

  useEffect(() => {
    if (!postDraft.topic && activeDebates[0]?.slug) {
      setPostDraft((draft) => ({ ...draft, topic: activeDebates[0].slug }));
    }
  }, [debates, postDraft.topic]);

  useEffect(() => {
    if (!postPreviewUrl) return undefined;
    return () => URL.revokeObjectURL(postPreviewUrl);
  }, [postPreviewUrl]);

  useEffect(() => {
    if (!posting) return undefined;
    const timer = setInterval(() => {
      setPostProgress((progress) => (progress >= 88 ? progress : Math.min(progress + 3, 88)));
    }, 450);
    return () => clearInterval(timer);
  }, [posting]);

  useEffect(() => {
    if (!session?.user || !supabase) return;

    let refreshTimer;
    const refreshEverything = () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(async () => {
        await loadDebates();
        await loadPosts();
        if (isAdmin) await loadAdminData();
      }, 250);
    };

    const channel = supabase
      .channel("nodus-live-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, refreshEverything)
      .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, refreshEverything)
      .on("postgres_changes", { event: "*", schema: "public", table: "likes" }, refreshEverything)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `recipient_id=eq.${session.user.id}` }, async () => {
        await loadNotifications();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "reports" }, refreshEverything)
      .on("postgres_changes", { event: "*", schema: "public", table: "debates" }, refreshEverything)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, refreshEverything)
      .subscribe();

    return () => {
      clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id, supabase, isAdmin]);

  async function loadProfile() {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .single();

    if (error?.code === "PGRST116") {
      const fallbackProfile = {
        id: session.user.id,
        name: session.user.user_metadata?.name || session.user.email?.split("@")[0] || "Morador",
        email: session.user.email,
        bio: "",
        neighborhood: "",
        contact: "",
        avatar_url: "",
        role: "member",
        badge_title: "",
      };

      const { data: createdProfile, error: createError } = await supabase
        .from("profiles")
        .upsert(fallbackProfile)
        .select()
        .single();

      if (createError) {
        setMessage(createError.message);
        return;
      }

      setProfile(createdProfile);
      return;
    }

    if (error) {
      setMessage(error.message);
      return;
    }

    setProfile(data);
  }

  async function loadDebates() {
    const { data, error } = await supabase
      .from("debates")
      .select("*")
      .eq("status", "active")
      .order("created_at", { ascending: false });

    if (!error && data?.length) {
      setDebates(data);
    }
  }

  async function loadPosts() {
    const { data, error } = await supabase
      .from("posts")
      .select("*, author:profiles!posts_user_id_fkey(id, name, avatar_url, neighborhood, bio, role, badge_title), comments(*, commenter:profiles!comments_user_id_fkey(id, name, avatar_url, neighborhood, bio, role, badge_title)), likes(user_id)")
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(error.message);
      return;
    }

    setPosts(data || []);
  }

  async function loadNotifications() {
    const { data, error } = await supabase
      .from("notifications")
      .select("*, actor:profiles!notifications_actor_id_fkey(name, avatar_url, role, badge_title), post:posts!notifications_post_id_fkey(body, street, neighborhood)")
      .order("created_at", { ascending: false })
      .limit(30);

    if (!error) setNotifications(data || []);
  }

  async function createNotification({ recipientId, type, postId, commentId }) {
    if (!recipientId || recipientId === session.user.id) return;

    await supabase.from("notifications").insert({
      recipient_id: recipientId,
      actor_id: session.user.id,
      type,
      post_id: postId || null,
      comment_id: commentId || null,
    });
  }

  async function markNotificationsAsRead() {
    const unreadIds = notifications.filter((item) => !item.read_at).map((item) => item.id);
    if (!unreadIds.length) return;

    const readAt = new Date().toISOString();
    setNotifications((items) => items.map((item) => (unreadIds.includes(item.id) ? { ...item, read_at: readAt } : item)));
    await supabase.from("notifications").update({ read_at: readAt }).in("id", unreadIds);
  }

  function openPublicProfile(person, fallbackId) {
    if (!person && !fallbackId) return;

    setViewedProfile({
      id: person?.id || fallbackId,
      name: person?.name || "Morador",
      avatar_url: person?.avatar_url || "",
      neighborhood: person?.neighborhood || "",
      bio: person?.bio || "",
      role: person?.role || "member",
      badge_title: person?.badge_title || "",
    });
    setActiveView("public-profile");
    setShowProfileSettings(false);

    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  async function loadAdminData() {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, name, email, neighborhood, contact, role, badge_title, created_at")
      .order("created_at", { ascending: false });

    if (!error) setAdminProfiles(data || []);

    const { data: reportData, error: reportError } = await supabase
      .from("reports")
      .select("id, reason, created_at, post_id, comment_id, reporter:profiles!reports_user_id_fkey(name, email, neighborhood, contact), post:posts!reports_post_id_fkey(body, street, neighborhood, topic, user_id), comment:comments!reports_comment_id_fkey(body, user_id)")
      .order("created_at", { ascending: false });

    if (!reportError) setAdminReports(reportData || []);
  }

  async function handleAuth(event) {
    event.preventDefault();
    setMessage("");

    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    const login = String(form.get("email") || "").trim().toLowerCase();
    const email = login === "admin" ? "admin@mural.local" : login;
    const password = String(form.get("password") || "");

    if (authMode === "register") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } },
      });
      if (error) {
        setMessage(getFriendlyAuthMessage(error.message));
        return;
      }

      if (data.session && data.user) {
        const { error: profileError } = await supabase.from("profiles").upsert({
          id: data.user.id,
          name,
          email,
          bio: "",
          neighborhood: "",
          contact: "",
          avatar_url: "",
          role: "member",
          badge_title: "",
        });

        if (profileError) {
          setMessage("Conta criada. Entre novamente para completar o perfil.");
          return;
        }
      }

      setMessage(
        data.session
          ? "Conta criada. Você já pode usar o feed."
          : "Conta criada. Verifique seu email para confirmar o cadastro."
      );
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage(getFriendlyAuthMessage(error.message));
    }
  }

  async function updateProfile(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const avatar = form.get("avatar");
    let avatarUrl = profile?.avatar_url || "";

    if (avatar?.size) {
      const path = `${session.user.id}/${Date.now()}-${avatar.name}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, avatar, { upsert: true });
      if (uploadError) {
        setMessage(uploadError.message);
        return;
      }
      avatarUrl = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
    }

    const nextProfile = {
      id: session.user.id,
      name: String(form.get("name") || "").trim(),
      email: session.user.email,
      neighborhood: String(form.get("neighborhood") || "").trim(),
      contact: String(form.get("contact") || "").trim(),
      bio: String(form.get("bio") || "").trim(),
      avatar_url: avatarUrl,
    };

    const { error } = await supabase.from("profiles").upsert(nextProfile);
    if (error) {
      setMessage(error.message);
      return;
    }

    setProfile({ ...profile, ...nextProfile });
    setShowProfileSettings(false);
    setMessage("Perfil atualizado.");
  }

  function updatePostDraft(field, value) {
    setPostDraft((draft) => ({ ...draft, [field]: value }));
  }

  function handlePostImageChange(event) {
    const file = event.target.files?.[0];
    if (!file) {
      setPostImageFile(null);
      setPostPreviewUrl("");
      return;
    }

    setPostImageFile(file);
    setPostPreviewUrl(URL.createObjectURL(file));
  }

  function clearPostComposer() {
    setPostDraft({
      body: "",
      topic: postDraft.topic || activeDebates[0]?.slug || "",
      street: "",
      neighborhood: "",
    });
    setPostImageFile(null);
    setPostPreviewUrl("");
  }

  async function createPost(event) {
    event.preventDefault();
    setMessage("");
    if (posting) return;

    const body = postDraft.body.trim();
    if (!body) {
      setMessage("Escreva algo antes de publicar.");
      return;
    }

    const topic = postDraft.topic || activeDebates[0]?.slug || "geral";
    let imageUrl = "";

    setPosting(true);
    setPostStatus("Preparando publicação...");
    setPostProgress(14);

    if (postImageFile?.size) {
      setPostStatus("Enviando foto...");
      setPostProgress(38);
      const path = `${session.user.id}/${Date.now()}-${postImageFile.name}`;
      const { error: uploadError } = await supabase.storage.from("post-images").upload(path, postImageFile);
      if (uploadError) {
        setMessage(uploadError.message);
        setPosting(false);
        setPostStatus("");
        setPostProgress(0);
        return;
      }
      imageUrl = supabase.storage.from("post-images").getPublicUrl(path).data.publicUrl;
    }

    setPostStatus("Salvando no feed...");
    setPostProgress(72);

    const { error } = await supabase.from("posts").insert({
      user_id: session.user.id,
      topic,
      street: postDraft.street.trim(),
      neighborhood: postDraft.neighborhood.trim(),
      body,
      image_url: imageUrl,
    });

    if (error) {
      setMessage(error.message);
      setPosting(false);
      setPostStatus("");
      setPostProgress(0);
      return;
    }

    setPostStatus("Atualizando feed...");
    setPostProgress(92);
    await loadPosts();
    setPostProgress(100);
    setPostStatus("Publicado.");
    clearPostComposer();
    setTimeout(() => {
      setPosting(false);
      setPostStatus("");
      setPostProgress(0);
    }, 650);
  }

  async function createDebate(event) {
    event.preventDefault();
    if (!isAdmin) return;

    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") || "").trim();
    const description = String(form.get("description") || "").trim();
    const slug = slugify(title);
    if (!title || !slug) return;

    const { error } = await supabase.from("debates").insert({
      title,
      slug,
      description,
      status: "active",
      created_by: session.user.id,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    event.currentTarget.reset();
    setMessage("Debate criado.");
    await loadDebates();
  }

  async function toggleLike(post) {
    const liked = post.likes?.some((like) => like.user_id === session.user.id);

    if (liked) {
      await supabase.from("likes").delete().eq("post_id", post.id).eq("user_id", session.user.id);
      setMessage("Curtida removida.");
    } else {
      const { error } = await supabase.from("likes").insert({ post_id: post.id, user_id: session.user.id });
      if (error) {
        setMessage(error.message);
        return;
      }
      await createNotification({ recipientId: post.user_id, type: "like", postId: post.id });
      setMessage("Curtido.");
    }

    await loadPosts();
  }

  async function sharePost(post) {
    const url = window.location.href;
    const title = "Nodus";
    const text = `${post.body}\n${post.street || ""} ${post.neighborhood || ""}`.trim();

    try {
      if (navigator.share) {
        await navigator.share({ title, text, url });
      } else {
        await navigator.clipboard.writeText(`${text}\n${url}`);
      }

      await supabase.rpc("increment_post_share", { post_id_input: post.id });
      setMessage("Compartilhamento registrado.");
      await loadPosts();
    } catch {
      setMessage("Não foi possível compartilhar agora.");
    }
  }

  async function addComment(event, postId) {
    event.preventDefault();
    const body = String(commentDrafts[postId] || "").trim();
    if (!body) return;

    const post = posts.find((item) => item.id === postId);
    const { data, error } = await supabase
      .from("comments")
      .insert({
        post_id: postId,
        user_id: session.user.id,
        body,
      })
      .select("id")
      .single();

    if (error) {
      setMessage(error.message);
      return;
    }

    setCommentDrafts((drafts) => ({ ...drafts, [postId]: "" }));
    await createNotification({ recipientId: post?.user_id, type: "comment", postId, commentId: data?.id });
    setActiveCommentPostId(postId);
    setMessage("Comentário enviado.");
    await loadPosts();
  }

  async function reportContent({ postId, commentId }) {
    const reason = window.prompt("Qual problema você quer relatar?");
    if (!reason?.trim()) return;

    const { error } = await supabase.from("reports").insert({
      post_id: postId || null,
      comment_id: commentId || null,
      user_id: session.user.id,
      reason: reason.trim(),
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Relatório enviado para o administrador.");
    if (isAdmin) await loadAdminData();
  }

  async function deletePost(post) {
    if (!canDeletePost(post)) return;
    const confirmed = window.confirm("Excluir esta publicação?");
    if (!confirmed) return;

    const { error } = await supabase.from("posts").delete().eq("id", post.id);
    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Publicação excluída.");
    await loadPosts();
    if (isAdmin) await loadAdminData();
  }

  async function deleteComment(comment) {
    if (!canDeleteComment(comment)) return;
    const confirmed = window.confirm("Excluir este comentário?");
    if (!confirmed) return;

    const { error } = await supabase.from("comments").delete().eq("id", comment.id);
    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Comentário excluído.");
    await loadPosts();
    if (isAdmin) await loadAdminData();
  }

  async function deleteProfile(person) {
    if (!isAdmin || person.id === session.user.id) return;
    const confirmed = window.confirm(`Excluir o perfil de ${person.name || person.email}? Isso também remove posts e comentários desse perfil.`);
    if (!confirmed) return;

    const { error } = await supabase.from("profiles").delete().eq("id", person.id);
    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Perfil excluído da plataforma.");
    await loadPosts();
    await loadAdminData();
  }

  async function updateUserBadge(event, person) {
    event.preventDefault();
    if (!isAdmin) return;

    const form = new FormData(event.currentTarget);
    const role = String(form.get("role") || "member");
    const badgeTitle = String(form.get("badge_title") || "").trim();

    const { error } = await supabase
      .from("profiles")
      .update({ role, badge_title: badgeTitle })
      .eq("id", person.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Insígnia atualizada.");
    await loadAdminData();
    await loadPosts();
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  function canDeletePost(post) {
    return isAdmin || post.user_id === session?.user?.id;
  }

  function canDeleteComment(comment) {
    return isAdmin || comment.user_id === session?.user?.id;
  }

  const filteredPosts = posts.filter((post) => {
    const text = `${post.body} ${post.street} ${post.neighborhood} ${post.topic}`.toLowerCase();
    const matchesFilter = filter === "all" || post.topic === filter;
    const matchesSearch = !query || text.includes(query.toLowerCase());
    return matchesFilter && matchesSearch;
  });
  const userPosts = posts.filter((post) => post.user_id === session?.user?.id).length;
  const userComments = posts.reduce(
    (total, post) => total + (post.comments || []).filter((comment) => comment.user_id === session?.user?.id).length,
    0
  );
  const totalLikes = posts.reduce((total, post) => total + (post.likes?.length || 0), 0);
  const totalComments = posts.reduce((total, post) => total + (post.comments?.length || 0), 0);
  const unreadNotifications = notifications.filter((item) => !item.read_at).length;
  const topicCounts = activeDebates.map((topic) => ({
    ...topic,
    count: posts.filter((post) => post.topic === topic.slug).length,
  }));
  const brasiliaUsers = adminProfiles.filter((person) =>
    /brasilia|df|samambaia|ceilandia|taguatinga|sobradinho|guara|gama|planaltina|recanto|riacho|paranoa|nucleo|brazlandia|cruzeiro|sudoeste|octogonal|aguas claras|vicente pires/i.test(person.neighborhood || "")
  ).length;
  const adminMetrics = [
    { label: "Cadastros", value: adminProfiles.length },
    { label: "Usuários Brasília", value: brasiliaUsers || adminProfiles.length },
    { label: "Publicações", value: posts.length },
    { label: "Comentários", value: totalComments },
    { label: "Curtidas", value: totalLikes },
    { label: "Relatórios", value: adminReports.length },
    { label: "Debates ativos", value: activeDebates.length },
  ];

  if (!supabaseReady) {
    return (
      <main className="setup-screen">
        <section className="setup-card">
          <p className="eyebrow">Configuração pendente</p>
          <h1>Adicione as chaves do Supabase para ativar o Nodus.</h1>
          <p>Copie `.env.example` para `.env.local` e preencha `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`.</p>
        </section>
      </main>
    );
  }

  if (loading) return <main className="setup-screen">Carregando feed...</main>;

  if (!session) {
    return (
      <main className="auth-page">
        <section className="auth-hero">
          <p className="eyebrow">Nodus</p>
          <h1>Conecte ruas, ideias e pessoas.</h1>
          <p>Uma rede local para publicar cenas da cidade, organizar debates e aproximar quem quer participar.</p>
        </section>

        <form className="auth-panel" onSubmit={handleAuth}>
          <div className="tabs">
            <button className={authMode === "login" ? "active" : ""} onClick={() => setAuthMode("login")} type="button">Login</button>
            <button className={authMode === "register" ? "active" : ""} onClick={() => setAuthMode("register")} type="button">Cadastro</button>
          </div>
          {authMode === "register" && <input name="name" placeholder="Nome público" required />}
          <input name="email" placeholder={authMode === "login" ? "Email ou admin" : "Email"} required type={authMode === "login" ? "text" : "email"} />
          <input minLength={6} name="password" placeholder="Senha" required type="password" />
          <button className="primary-button" type="submit">{authMode === "login" ? "Entrar" : "Criar conta"}</button>
          {message && <p className="form-message">{message}</p>}
        </form>
      </main>
    );
  }

  return (
    <main className="app-page">
      <aside className="sidebar">
        <div className="brand">
          <span>N</span>
          <div>
            <strong>Nodus</strong>
            <small>Rede local participativa</small>
          </div>
        </div>

        <nav className="side-nav" aria-label="Navegação principal">
          <button className={activeView === "feed" ? "side-nav-item active" : "side-nav-item"} onClick={() => setActiveView("feed")} type="button">Feed</button>
          <button className={activeView === "debates" ? "side-nav-item active" : "side-nav-item"} onClick={() => setActiveView("debates")} type="button">Debates</button>
          {isAdmin && (
            <button className={activeView === "admin" ? "side-nav-item active" : "side-nav-item"} onClick={() => setActiveView("admin")} type="button">Admin</button>
          )}
        </nav>

        <button className="mobile-settings-button" onClick={() => setShowProfileSettings((open) => !open)} title="Configurações do perfil" type="button">{"\u2699"}</button>

        <div className="profile-chip">
          <Avatar profile={profile} />
          <div>
            <strong>{profile?.name || session.user.email}</strong>
            <small>{profile?.neighborhood || "Perfil sem bairro"}</small>
          </div>
          <button className="icon-button" onClick={() => setShowProfileSettings((open) => !open)} title="Configurações do perfil" type="button">{"\u2699"}</button>
        </div>

        <div className="alerts-block">
          <button
            className={showAlerts ? "alerts-button active" : "alerts-button"}
            onClick={() => {
              setShowAlerts((open) => !open);
              if (!showAlerts) markNotificationsAsRead();
            }}
            type="button"
          >
            <span>Alertas</span>
            {unreadNotifications > 0 && <strong>{unreadNotifications}</strong>}
          </button>
          {showAlerts && <NotificationsPanel notifications={notifications} />}
        </div>

        <div className="sidebar-stats">
          <span><strong>{posts.length}</strong> posts</span>
          <span><strong>{userPosts}</strong> seus posts</span>
          <span><strong>{userComments}</strong> comentários</span>
        </div>

        <button className="ghost-button logout-button" onClick={signOut} type="button">Sair</button>
      </aside>

      <section className="content">
        {message && <p className="notice">{message}</p>}

        {showProfileSettings && (
          <section className="profile-editor mobile-profile-editor">
            <div className="panel-title">
              <h2>Configurações</h2>
              <Avatar profile={profile} />
            </div>
            <form onSubmit={updateProfile}>
              <input defaultValue={profile?.name || ""} name="name" placeholder="Nome público" required />
              <input defaultValue={profile?.neighborhood || ""} name="neighborhood" placeholder="Bairro / região" />
              <input defaultValue={profile?.contact || ""} name="contact" placeholder="Contato público" />
              <textarea defaultValue={profile?.bio || ""} name="bio" placeholder="Bio curta" />
              <label className="upload-line">
                Foto de perfil
                <input accept="image/*" name="avatar" type="file" />
              </label>
              <button className="primary-button" type="submit">Salvar perfil</button>
            </form>
          </section>
        )}

        {activeView === "public-profile" && viewedProfile ? (
          <PublicProfileView
            debates={activeDebates}
            onBack={() => setActiveView("feed")}
            posts={posts.filter((post) => post.user_id === viewedProfile.id)}
            profile={viewedProfile}
          />
        ) : activeView === "debates" ? (
          <DebatesView
            debates={activeDebates}
            isAdmin={isAdmin}
            onCreateDebate={createDebate}
            onSelectDebate={(slug) => {
              setFilter(slug);
              setActiveView("feed");
            }}
            posts={posts}
          />
        ) : activeView === "admin" && isAdmin ? (
          <AdminView
            activeTab={adminTab}
            onChangeTab={setAdminTab}
            metrics={adminMetrics}
            profiles={adminProfiles}
            debates={activeDebates}
            posts={posts}
            reports={adminReports}
            onDeleteComment={deleteComment}
            onDeletePost={deletePost}
            onDeleteProfile={deleteProfile}
            onRefresh={loadAdminData}
            onUpdateBadge={updateUserBadge}
          />
        ) : (
          <div className="social-layout">
            <section className="feed-column">
              <header className="feed-topbar">
                <div>
                  <p className="eyebrow">Comunidade local</p>
                  <h1 className="feed-title">Feed</h1>
                </div>
                <div className="feed-search">
                  <input onChange={(event) => setQuery(event.target.value)} placeholder="Buscar rua, bairro ou assunto" />
                  <select onChange={(event) => setFilter(event.target.value)} value={filter}>
                    {topicOptions.map((topic) => (
                      <option key={topic.slug} value={topic.slug}>{topic.title}</option>
                    ))}
                  </select>
                </div>
              </header>

              <section className="composer">
                <div className="composer-user">
                  <Avatar profile={profile} />
                  <div>
                    <strong>{profile?.name || "Morador"}</strong>
                    <small>Publique uma foto da rua e abra um debate</small>
                  </div>
                </div>
                <form onSubmit={createPost}>
                  <textarea
                    className="composer-textarea"
                    disabled={posting}
                    maxLength={500}
                    name="body"
                    onChange={(event) => updatePostDraft("body", event.target.value)}
                    placeholder="Compartilhe uma cena, uma ideia ou um problema da cidade."
                    required
                    value={postDraft.body}
                  />
                  <div className="form-grid">
                    <select disabled={posting} name="topic" onChange={(event) => updatePostDraft("topic", event.target.value)} required value={postDraft.topic}>
                      {activeDebates.map((topic) => (
                        <option key={topic.slug} value={topic.slug}>{topic.title}</option>
                      ))}
                    </select>
                    <input disabled={posting} name="street" onChange={(event) => updatePostDraft("street", event.target.value)} placeholder="Rua / avenida" value={postDraft.street} />
                    <input disabled={posting} name="neighborhood" onChange={(event) => updatePostDraft("neighborhood", event.target.value)} placeholder="Bairro" value={postDraft.neighborhood} />
                  </div>
                  {(postDraft.body || postDraft.street || postDraft.neighborhood || postPreviewUrl) && (
                    <article className="composer-preview">
                      <div className="preview-heading">
                        <span>Preview</span>
                        <button disabled={posting} onClick={clearPostComposer} type="button">Limpar</button>
                      </div>
                      <div className="preview-author">
                        <Avatar profile={profile} />
                        <div>
                          <strong>{profile?.name || "Morador"}</strong>
                          <small>{postDraft.street || "Rua não informada"} {postDraft.neighborhood ? `- ${postDraft.neighborhood}` : ""}</small>
                        </div>
                        <span>{topicLabel(postDraft.topic, activeDebates)}</span>
                      </div>
                      {postDraft.body && <p>{postDraft.body}</p>}
                      {postPreviewUrl && <img alt="Preview da foto escolhida" src={postPreviewUrl} />}
                    </article>
                  )}
                  <div className="composer-footer">
                    <label className="upload-button">
                      <PaperclipIcon />
                      <span>{postImageFile ? "Trocar foto" : "Anexar foto"}</span>
                      <input accept="image/*" disabled={posting} key={postPreviewUrl || "empty-post-image"} name="image" onChange={handlePostImageChange} type="file" />
                    </label>
                    <button className="primary-button" disabled={posting} type="submit">{posting ? "Postando..." : "Publicar"}</button>
                  </div>
                  {posting && (
                    <div className="post-progress" aria-live="polite">
                      <div>
                        <span>{postStatus}</span>
                        <strong>{postProgress}%</strong>
                      </div>
                      <progress max="100" value={postProgress}>{postProgress}%</progress>
                    </div>
                  )}
                </form>
              </section>

              <section className="feed">
                {filteredPosts.length === 0 && (
                  <article className="empty-feed">
                    <strong>Nenhum post encontrado.</strong>
                    <span>Troque o filtro ou seja o primeiro a publicar sobre esse tema.</span>
                  </article>
                )}

                {filteredPosts.map((post) => {
                  const liked = post.likes?.some((like) => like.user_id === session.user.id);
                  const commentsOpen = activeCommentPostId === post.id;

                  return (
                    <article className="post-card" key={post.id}>
                      <div className="post-header">
                        <button className="profile-link" onClick={() => openPublicProfile(post.author, post.user_id)} type="button">
                          <Avatar profile={post.author} />
                          <div>
                          <strong>{post.author?.name || "Morador"}</strong>
                          <small>{post.street || "Rua não informada"} {post.neighborhood ? `- ${post.neighborhood}` : ""}</small>
                            <Badge profile={post.author} />
                          </div>
                        </button>
                        <span>{topicLabel(post.topic, activeDebates)}</span>
                        {canDeletePost(post) && (
                          <button className="delete-button" onClick={() => deletePost(post)} type="button">Excluir</button>
                        )}
                      </div>

                      <p className="post-text">{post.body}</p>
                      {post.image_url && <img alt="Foto publicada no Nodus" className="post-image" src={post.image_url} />}

                      <div className="post-actions">
                        <button className={liked ? "action-button liked" : "action-button"} onClick={() => toggleLike(post)} title={liked ? "Curtido" : "Curtir"} type="button">
                          <HeartIcon filled={liked} />
                          <span>{post.likes?.length || 0}</span>
                        </button>
                        <button className="action-button" onClick={() => setActiveCommentPostId(commentsOpen ? null : post.id)} title={commentsOpen ? "Ocultar comentários" : "Ver comentários"} type="button">
                          <CommentIcon />
                          <span>{post.comments?.length || 0}</span>
                        </button>
                        <button className="action-button" onClick={() => sharePost(post)} title="Compartilhar" type="button">
                          <ShareIcon />
                          <span>{post.share_count || 0}</span>
                        </button>
                        <button className="action-button report-action" onClick={() => reportContent({ postId: post.id })} title="Relatar problema" type="button"><FlagIcon /></button>
                      </div>

                      {commentsOpen && (
                        <>
                          <div className="comments">
                            {(post.comments || []).length === 0 && <p className="empty-comments">Ainda não há comentários.</p>}
                            {(post.comments || []).map((comment) => (
                              <div className="comment" key={comment.id}>
                                <button className="comment-avatar-button" onClick={() => openPublicProfile(comment.commenter, comment.user_id)} type="button">
                                  <Avatar profile={comment.commenter} />
                                </button>
                                <div className="comment-content">
                                  <div className="comment-topline">
                                    <button className="comment-name-button" onClick={() => openPublicProfile(comment.commenter, comment.user_id)} type="button">
                                      <strong>{comment.commenter?.name || "Morador"}</strong>
                                      <Badge profile={comment.commenter} />
                                    </button>
                                    <div className="comment-tools">
                                      {canDeleteComment(comment) && (
                                        <button className="delete-button compact" onClick={() => deleteComment(comment)} type="button">Excluir</button>
                                      )}
                                      <button className="delete-button compact neutral" onClick={() => reportContent({ commentId: comment.id })} type="button">Relatar</button>
                                    </div>
                                  </div>
                                  <p className="comment-body">{comment.body}</p>
                                </div>
                              </div>
                            ))}
                          </div>

                          <form className="comment-form" onSubmit={(event) => addComment(event, post.id)}>
                            <Avatar profile={profile} />
                            <input
                              name="comment"
                              onChange={(event) => setCommentDrafts((drafts) => ({ ...drafts, [post.id]: event.target.value }))}
                              placeholder="Escreva um comentário"
                              value={commentDrafts[post.id] || ""}
                            />
                            <button type="submit">Enviar</button>
                          </form>
                        </>
                      )}
                    </article>
                  );
                })}
              </section>
            </section>

            <aside className="right-panel">
              {showProfileSettings && (
                <section className="profile-editor">
                  <div className="panel-title">
                    <h2>Configurações</h2>
                    <Avatar profile={profile} />
                  </div>
                  <form onSubmit={updateProfile}>
                    <input defaultValue={profile?.name || ""} name="name" placeholder="Nome público" required />
                    <input defaultValue={profile?.neighborhood || ""} name="neighborhood" placeholder="Bairro / região" />
                    <input defaultValue={profile?.contact || ""} name="contact" placeholder="Contato público" />
                    <textarea defaultValue={profile?.bio || ""} name="bio" placeholder="Bio curta" />
                    <label className="upload-line">
                      Foto de perfil
                      <input accept="image/*" name="avatar" type="file" />
                    </label>
                    <button className="primary-button" type="submit">Salvar perfil</button>
                  </form>
                </section>
              )}

              <section className="topic-panel">
                <h2>Debates ativos</h2>
                <div className="topic-list">
                  {topicCounts.map((topic) => (
                    <button className={filter === topic.slug ? "topic-item active" : "topic-item"} key={topic.slug} onClick={() => setFilter(topic.slug)} type="button">
                      <span>{topic.title}</span>
                      <strong>{topic.count}</strong>
                    </button>
                  ))}
                </div>
              </section>
            </aside>
          </div>
        )}
      </section>
    </main>
  );
}

function NotificationsPanel({ notifications }) {
  return (
    <section className="alerts-panel">
      <div className="alerts-title">
        <strong>Notificações</strong>
        <span>{notifications.length}</span>
      </div>
      {notifications.length === 0 ? (
        <p className="empty-alerts">Nenhuma notificação ainda.</p>
      ) : (
        <div className="alerts-list">
          {notifications.map((item) => (
            <article className={item.read_at ? "alert-item" : "alert-item unread"} key={item.id}>
              <Avatar profile={item.actor} />
              <div>
                <strong>{item.actor?.name || "Alguém"}</strong>
                <p>{item.type === "like" ? "curtiu sua publicação." : "comentou na sua publicação."}</p>
                <small>{item.post?.street || item.post?.body || "Publicação do feed"}</small>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function PublicProfileView({ debates, onBack, posts, profile }) {
  const profileLikes = posts.reduce((total, post) => total + (post.likes?.length || 0), 0);

  return (
    <section className="public-profile-view">
      <button className="ghost-button profile-back-button" onClick={onBack} type="button">Voltar ao feed</button>

      <section className="public-profile-card">
        <Avatar profile={profile} />
        <div className="public-profile-info">
          <div>
            <h1>{profile?.name || "Morador"}</h1>
            <Badge profile={profile} />
          </div>
          <p>{profile?.bio || "Este perfil ainda não adicionou uma bio."}</p>
          <small>{profile?.neighborhood || "Bairro não informado"}</small>
        </div>
        <div className="public-profile-stat">
          <strong>{posts.length}</strong>
          <span>{posts.length === 1 ? "publicação" : "publicações"}</span>
        </div>
        <div className="public-profile-stat">
          <strong>{profileLikes}</strong>
          <span>{profileLikes === 1 ? "curtida" : "curtidas"}</span>
        </div>
      </section>

      <section className="public-profile-posts">
        <div className="section-heading">
          <h2>Conteúdo postado</h2>
          <span>{posts.length} no feed</span>
        </div>

        {posts.length === 0 ? (
          <article className="empty-feed">
            <strong>Nenhuma publicação ainda.</strong>
            <span>Quando esta pessoa postar, o conteúdo aparecerá aqui.</span>
          </article>
        ) : (
          <div className="profile-post-grid">
            {posts.map((post) => (
              <article className="profile-post-tile" key={post.id}>
                {post.image_url ? (
                  <img alt="Foto publicada no Nodus" src={post.image_url} />
                ) : (
                  <div className="profile-post-placeholder">Nodus</div>
                )}
                <div>
                  <strong>{topicLabel(post.topic, debates)}</strong>
                  <p>{post.body}</p>
                  <small>{post.street || "Rua não informada"} {post.neighborhood ? `- ${post.neighborhood}` : ""}</small>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

function DebatesView({ debates, isAdmin, onCreateDebate, onSelectDebate, posts }) {
  return (
    <section className="view-panel">
      <header className="view-header">
        <p className="eyebrow">Debates</p>
      <h1>Debates ativos</h1>
      </header>

      {isAdmin && (
        <form className="admin-form" onSubmit={onCreateDebate}>
          <input name="title" placeholder="Novo debate" required />
          <input name="description" placeholder="Descrição curta" />
          <button className="primary-button" type="submit">Criar debate</button>
        </form>
      )}

      <div className="debate-grid">
        {debates.map((debate) => (
          <article className="debate-card" key={debate.slug}>
            <div>
              <h2>{debate.title}</h2>
              <p>{debate.description || "Debate aberto pelo administrador da página."}</p>
            </div>
            <strong>{posts.filter((post) => post.topic === debate.slug).length} posts</strong>
            <button className="ghost-button" onClick={() => onSelectDebate(debate.slug)} type="button">Abrir no feed</button>
          </article>
        ))}
      </div>
    </section>
  );
}

function AdminView({ activeTab, debates, metrics, onChangeTab, onDeleteComment, onDeletePost, onDeleteProfile, onRefresh, onUpdateBadge, posts, profiles, reports }) {
  const allComments = posts.flatMap((post) =>
    (post.comments || []).map((comment) => ({
      ...comment,
      postBody: post.body,
      postStreet: post.street,
    }))
  );
  const neighborhoods = profiles.reduce((items, person) => {
    const key = person.neighborhood || "Não informado";
    items[key] = (items[key] || 0) + 1;
    return items;
  }, {});
  const leadEmails = profiles
    .map((person) => person.email)
    .filter(Boolean)
    .join(", ");
  const issueRows = Object.values(
    reports.reduce((items, report) => {
      const category = report.post?.topic || (report.comment ? "comentário" : "geral");
      const city = report.post?.neighborhood || report.reporter?.neighborhood || "Não informado";
      const key = `${category}__${city}`;
      if (!items[key]) items[key] = { category, city, count: 0 };
      items[key].count += 1;
      return items;
    }, {})
  ).sort((a, b) => b.count - a.count);

  function downloadReport() {
    const rows = [
      ["categoria", "cidade_ou_região", "quantidade"],
      ...issueRows.map((row) => [row.category, row.city, row.count]),
      [],
      ["nome", "email", "contato", "bairro", "perfil"],
      ...profiles.map((person) => [person.name || "", person.email || "", person.contact || "", person.neighborhood || "", person.role || "member"]),
    ];
    const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `nodus-relatorio-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="view-panel">
      <header className="view-header">
        <p className="eyebrow">Administrador geral</p>
        <h1>Dashboard de controle</h1>
        <button className="ghost-button report-download" onClick={downloadReport} type="button">Baixar relatório</button>
      </header>

      <div className="admin-tabs">
        <button className={activeTab === "overview" ? "active" : ""} onClick={() => onChangeTab("overview")} type="button">Métricas</button>
        <button className={activeTab === "users" ? "active" : ""} onClick={() => onChangeTab("users")} type="button">Usuários e leads</button>
        <button className={activeTab === "content" ? "active" : ""} onClick={() => onChangeTab("content")} type="button">Conteúdo</button>
        <button className={activeTab === "reports" ? "active" : ""} onClick={() => onChangeTab("reports")} type="button">Relatórios</button>
      </div>

      {activeTab === "overview" && (
        <>
      <div className="metrics-grid">
        {metrics.map((metric) => (
          <article className="metric-card" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </article>
        ))}
      </div>

      <section className="admin-table">
        <div className="panel-title">
              <h2>Regioes de Brasilia</h2>
              <small>Quantidade de usuários por bairro/região</small>
        </div>
            <div className="topic-list">
              {Object.entries(neighborhoods).map(([name, count]) => (
                <div className="topic-item read-only" key={name}>
                  <span>{name}</span>
                  <strong>{count}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="admin-table">
            <div className="panel-title">
              <h2>Debates administrados</h2>
              <small>{debates.length} ativos</small>
            </div>
            <div className="topic-list">
              {debates.map((debate) => (
                <div className="topic-item read-only" key={debate.slug}>
                  <span>{debate.title}</span>
                  <strong>ativo</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="admin-table">
            <div className="panel-title">
              <h2>Problemas por categoria e cidade</h2>
              <small>{reports.length} relatos recebidos</small>
            </div>
            <div className="topic-list">
              {issueRows.length === 0 && <div className="topic-item read-only"><span>Nenhum problema relatado</span><strong>0</strong></div>}
              {issueRows.map((row) => (
                <div className="topic-item read-only" key={`${row.category}-${row.city}`}>
                  <span>{row.category} / {row.city}</span>
                  <strong>{row.count}</strong>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {activeTab === "users" && (
        <section className="admin-table">
          <div className="panel-title">
            <h2>Pessoas, cadastros, emails e contatos</h2>
            <button className="ghost-button" onClick={onRefresh} type="button">Atualizar</button>
          </div>
          <textarea className="lead-box" readOnly value={leadEmails} />
          <small>Use essa lista somente com pessoas que autorizaram contato. Para disparo em massa, respeite consentimento e LGPD.</small>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Email</th>
                  <th>Contato</th>
                  <th>Bairro</th>
                  <th>Perfil</th>
                  <th>Insígnia</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((person) => (
                  <tr key={person.id}>
                    <td>{person.name || "Sem nome"}</td>
                    <td>{person.email || "-"}</td>
                    <td>{person.contact || "-"}</td>
                    <td>{person.neighborhood || "-"}</td>
                    <td>{person.role || "member"}</td>
                    <td>
                      <form className="badge-form" onSubmit={(event) => onUpdateBadge(event, person)}>
                        <select defaultValue={person.role || "member"} name="role">
                          <option value="member">Membro</option>
                          <option value="moderator">Moderador</option>
                          <option value="organizer">Organizador</option>
                          <option value="admin">Administrador</option>
                        </select>
                        <input defaultValue={person.badge_title || ""} name="badge_title" placeholder="Título ou insígnia" />
                        <button className="ghost-button" type="submit">Salvar</button>
                      </form>
                    </td>
                    <td><button className="delete-button" onClick={() => onDeleteProfile(person)} type="button">Excluir perfil</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === "content" && (
        <>
          <section className="admin-table">
            <div className="panel-title">
              <h2>Posts publicados</h2>
              <small>{posts.length} posts</small>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Autor</th>
                    <th>Local</th>
                    <th>Debate</th>
                    <th>Conteúdo</th>
                    <th>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {posts.map((post) => (
                    <tr key={post.id}>
                      <td>{post.author?.name || "Morador"}</td>
                      <td>{post.street || "-"} {post.neighborhood ? `- ${post.neighborhood}` : ""}</td>
                      <td>{post.topic}</td>
                      <td>{post.body}</td>
                      <td><button className="delete-button" onClick={() => onDeletePost(post)} type="button">Excluir post</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="admin-table">
            <div className="panel-title">
              <h2>Comentários</h2>
              <small>{allComments.length} comentários</small>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Autor</th>
                    <th>Comentário</th>
                    <th>Post</th>
                    <th>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {allComments.map((comment) => (
                    <tr key={comment.id}>
                      <td>{comment.commenter?.name || "Morador"}</td>
                      <td>{comment.body}</td>
                      <td>{comment.postStreet || "-"} | {comment.postBody}</td>
                      <td><button className="delete-button" onClick={() => onDeleteComment(comment)} type="button">Excluir comentário</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {activeTab === "reports" && (
        <section className="admin-table">
          <div className="panel-title">
            <h2>Relatórios de problemas</h2>
            <small>{reports.length} relatos</small>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Quem relatou</th>
                  <th>Problema</th>
                  <th>Conteúdo</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => (
                  <tr key={report.id}>
                    <td>{report.reporter?.name || "-"}<br />{report.reporter?.email || ""}</td>
                    <td>{report.reason}</td>
                    <td>{report.post?.body || report.comment?.body || "-"}</td>
                    <td>
                      {report.post && <button className="delete-button" onClick={() => onDeletePost({ id: report.post_id, user_id: report.post.user_id })} type="button">Excluir post</button>}
                      {report.comment && <button className="delete-button" onClick={() => onDeleteComment({ id: report.comment_id, user_id: report.comment.user_id })} type="button">Excluir comentário</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </section>
  );
}

function Avatar({ profile }) {
  if (profile?.avatar_url) {
    return <img alt="Foto de perfil" className="avatar" src={profile.avatar_url} />;
  }

  const initials = (profile?.name || "MD")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return <div className="avatar">{initials}</div>;
}

function Badge({ profile }) {
  const label = profile?.badge_title || getRoleLabel(profile?.role);
  if (!label) return null;
  return <span className="profile-badge">{label}</span>;
}

function getRoleLabel(role) {
  if (role === "admin") return "Administrador";
  if (role === "moderator") return "Moderador";
  if (role === "organizer") return "Organizador";
  return "";
}

function PaperclipIcon() {
  return (
    <svg aria-hidden="true" className="ui-icon" viewBox="0 0 24 24">
      <path d="M8 12.6l6.8-6.8a3.2 3.2 0 014.5 4.5l-8 8a5 5 0 01-7.1-7.1l8.4-8.4" />
    </svg>
  );
}

function HeartIcon({ filled }) {
  return (
    <svg aria-hidden="true" className={filled ? "ui-icon heart filled" : "ui-icon heart"} viewBox="0 0 24 24">
      <path d="M20.4 5.6a5 5 0 00-7.1 0L12 6.9l-1.3-1.3a5 5 0 00-7.1 7.1L12 21l8.4-8.3a5 5 0 000-7.1z" />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg aria-hidden="true" className="ui-icon" viewBox="0 0 24 24">
      <path d="M21 11.5a8.4 8.4 0 01-8.7 8.4 9.7 9.7 0 01-4-.8L3 20l1.4-4.1A8 8 0 013 11.5a8.4 8.4 0 018.7-8.4A8.4 8.4 0 0121 11.5z" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg aria-hidden="true" className="ui-icon" viewBox="0 0 24 24">
      <path d="M4 12l17-8-7.2 17-2.6-7.6L4 12z" />
    </svg>
  );
}

function FlagIcon() {
  return (
    <svg aria-hidden="true" className="ui-icon" viewBox="0 0 24 24">
      <path d="M5 21V4h11l-1 4 1 4H5" />
    </svg>
  );
}

function escapeCsv(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function topicLabel(topicId, debates) {
  return debates.find((topic) => topic.slug === topicId)?.title || "Debate";
}

function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function getFriendlyAuthMessage(message) {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes("invalid login credentials")) {
    return "Email ou senha incorretos.";
  }

  if (lowerMessage.includes("email not confirmed")) {
    return "Confirme seu email antes de entrar.";
  }

  if (lowerMessage.includes("user already registered")) {
    return "Este email ja tem cadastro. Tente entrar pelo login.";
  }

  if (lowerMessage.includes("password")) {
    return "A senha precisa ter pelo menos 6 caracteres.";
  }

  return message;
}
