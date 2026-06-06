"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabase } from "../lib/supabase";

const defaultDebates = [
  { id: "infraestrutura", slug: "infraestrutura", title: "Infraestrutura", description: "Ruas, calcadas, iluminacao e obras." },
  { id: "saude", slug: "saude", title: "Saude", description: "Atendimento, filas, unidades e prevencao." },
  { id: "educacao", slug: "educacao", title: "Educacao", description: "Escolas, creches, transporte e aprendizagem." },
  { id: "seguranca", slug: "seguranca", title: "Seguranca", description: "Iluminacao, rondas e pontos de risco." },
  { id: "mobilidade", slug: "mobilidade", title: "Mobilidade", description: "Transporte, acessibilidade e transito." },
];

const allTopic = { id: "all", slug: "all", title: "Todos", description: "Todos os debates ativos." };

export default function HomePage() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [debates, setDebates] = useState(defaultDebates);
  const [adminProfiles, setAdminProfiles] = useState([]);
  const [adminReports, setAdminReports] = useState([]);
  const [authMode, setAuthMode] = useState("login");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [activeView, setActiveView] = useState("feed");
  const [adminTab, setAdminTab] = useState("overview");
  const [showProfileSettings, setShowProfileSettings] = useState(false);
  const [activeCommentPostId, setActiveCommentPostId] = useState(null);

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
      return;
    }

    loadProfile();
    loadDebates();
    loadPosts();
  }, [session, supabase]);

  useEffect(() => {
    if (isAdmin) loadAdminData();
  }, [isAdmin, posts.length]);

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
      .select("*, author:profiles!posts_user_id_fkey(name, avatar_url, neighborhood), comments(*, commenter:profiles!comments_user_id_fkey(name, avatar_url)), likes(user_id)")
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(error.message);
      return;
    }

    setPosts(data || []);
  }

  async function loadAdminData() {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, name, email, neighborhood, contact, role, created_at")
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
        });

        if (profileError) {
          setMessage("Conta criada. Entre novamente para completar o perfil.");
          return;
        }
      }

      setMessage(
        data.session
          ? "Conta criada. Voce ja pode usar o feed."
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

  async function createPost(event) {
    event.preventDefault();
    setMessage("");

    const form = new FormData(event.currentTarget);
    const image = form.get("image");
    let imageUrl = "";

    if (image?.size) {
      const path = `${session.user.id}/${Date.now()}-${image.name}`;
      const { error: uploadError } = await supabase.storage.from("post-images").upload(path, image);
      if (uploadError) {
        setMessage(uploadError.message);
        return;
      }
      imageUrl = supabase.storage.from("post-images").getPublicUrl(path).data.publicUrl;
    }

    const { error } = await supabase.from("posts").insert({
      user_id: session.user.id,
      topic: form.get("topic"),
      street: String(form.get("street") || "").trim(),
      neighborhood: String(form.get("neighborhood") || "").trim(),
      body: String(form.get("body") || "").trim(),
      image_url: imageUrl,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    event.currentTarget.reset();
    await loadPosts();
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
    } else {
      await supabase.from("likes").insert({ post_id: post.id, user_id: session.user.id });
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
        return;
      }

      await navigator.clipboard.writeText(`${text}\n${url}`);
      setMessage("Link do post copiado.");
    } catch {
      setMessage("Nao foi possivel compartilhar agora.");
    }
  }

  async function addComment(event, postId) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = String(form.get("comment") || "").trim();
    if (!body) return;

    const { error } = await supabase.from("comments").insert({
      post_id: postId,
      user_id: session.user.id,
      body,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    event.currentTarget.reset();
    setActiveCommentPostId(postId);
    await loadPosts();
  }

  async function reportContent({ postId, commentId }) {
    const reason = window.prompt("Qual problema voce quer relatar?");
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

    setMessage("Relatorio enviado para o administrador.");
    if (isAdmin) await loadAdminData();
  }

  async function deletePost(post) {
    if (!canDeletePost(post)) return;
    const confirmed = window.confirm("Excluir esta publicacao?");
    if (!confirmed) return;

    const { error } = await supabase.from("posts").delete().eq("id", post.id);
    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Publicacao excluida.");
    await loadPosts();
    if (isAdmin) await loadAdminData();
  }

  async function deleteComment(comment) {
    if (!canDeleteComment(comment)) return;
    const confirmed = window.confirm("Excluir este comentario?");
    if (!confirmed) return;

    const { error } = await supabase.from("comments").delete().eq("id", comment.id);
    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Comentario excluido.");
    await loadPosts();
    if (isAdmin) await loadAdminData();
  }

  async function deleteProfile(person) {
    if (!isAdmin || person.id === session.user.id) return;
    const confirmed = window.confirm(`Excluir o perfil de ${person.name || person.email}? Isso tambem remove posts e comentarios desse perfil.`);
    if (!confirmed) return;

    const { error } = await supabase.from("profiles").delete().eq("id", person.id);
    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Perfil excluido da plataforma.");
    await loadPosts();
    await loadAdminData();
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
  const topicCounts = activeDebates.map((topic) => ({
    ...topic,
    count: posts.filter((post) => post.topic === topic.slug).length,
  }));
  const brasiliaUsers = adminProfiles.filter((person) =>
    /brasilia|df|samambaia|ceilandia|taguatinga|sobradinho|guara|gama|planaltina|recanto|riacho|paranoa|nucleo|brazlandia|cruzeiro|sudoeste|octogonal|aguas claras|vicente pires/i.test(person.neighborhood || "")
  ).length;
  const adminMetrics = [
    { label: "Cadastros", value: adminProfiles.length },
    { label: "Usuarios Brasilia", value: brasiliaUsers || adminProfiles.length },
    { label: "Publicacoes", value: posts.length },
    { label: "Comentarios", value: totalComments },
    { label: "Curtidas", value: totalLikes },
    { label: "Relatorios", value: adminReports.length },
    { label: "Debates ativos", value: activeDebates.length },
  ];

  if (!supabaseReady) {
    return (
      <main className="setup-screen">
        <section className="setup-card">
          <p className="eyebrow">Configuracao pendente</p>
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
          {authMode === "register" && <input name="name" placeholder="Nome publico" required />}
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

        <nav className="side-nav" aria-label="Navegacao principal">
          <button className={activeView === "feed" ? "side-nav-item active" : "side-nav-item"} onClick={() => setActiveView("feed")} type="button">Feed</button>
          <button className={activeView === "debates" ? "side-nav-item active" : "side-nav-item"} onClick={() => setActiveView("debates")} type="button">Debates</button>
          {isAdmin && (
            <button className={activeView === "admin" ? "side-nav-item active" : "side-nav-item"} onClick={() => setActiveView("admin")} type="button">Admin</button>
          )}
        </nav>

        <div className="profile-chip">
          <Avatar profile={profile} />
          <div>
            <strong>{profile?.name || session.user.email}</strong>
            <small>{profile?.neighborhood || "Perfil sem bairro"}</small>
          </div>
          <button className="icon-button" onClick={() => setShowProfileSettings((open) => !open)} title="Configuracoes do perfil" type="button">{"\u2699"}</button>
        </div>

        <div className="sidebar-stats">
          <span><strong>{posts.length}</strong> posts</span>
          <span><strong>{userPosts}</strong> seus posts</span>
          <span><strong>{userComments}</strong> comentarios</span>
        </div>

        <button className="ghost-button logout-button" onClick={signOut} type="button">Sair</button>
      </aside>

      <section className="content">
        {message && <p className="notice">{message}</p>}

        {activeView === "debates" ? (
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
          />
        ) : (
          <div className="social-layout">
            <section className="feed-column">
              <header className="feed-topbar">
                <div>
                  <p className="eyebrow">Comunidade local</p>
                  <h1>Nodus Feed</h1>
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
                  <textarea maxLength={500} name="body" placeholder="O que voce viu na rua hoje?" required />
                  <div className="form-grid">
                    <select name="topic" required>
                      {activeDebates.map((topic) => (
                        <option key={topic.slug} value={topic.slug}>{topic.title}</option>
                      ))}
                    </select>
                    <input name="street" placeholder="Rua / avenida" />
                    <input name="neighborhood" placeholder="Bairro" />
                  </div>
                  <div className="composer-footer">
                    <label className="upload-button">
                      Foto
                      <input accept="image/*" name="image" type="file" />
                    </label>
                    <button className="primary-button" type="submit">Publicar</button>
                  </div>
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
                        <Avatar profile={post.author} />
                        <div>
                          <strong>{post.author?.name || "Morador"}</strong>
                          <small>{post.street || "Rua nao informada"} {post.neighborhood ? `- ${post.neighborhood}` : ""}</small>
                        </div>
                        <span>{topicLabel(post.topic, activeDebates)}</span>
                        {canDeletePost(post) && (
                          <button className="delete-button" onClick={() => deletePost(post)} type="button">Excluir</button>
                        )}
                      </div>

                      <p className="post-text">{post.body}</p>
                      {post.image_url && <img alt="Foto publicada no Nodus" className="post-image" src={post.image_url} />}

                      <div className="engagement-row">
                        <span>{post.likes?.length || 0} curtidas</span>
                        <span>{post.comments?.length || 0} comentarios</span>
                      </div>

                      <div className="post-actions">
                        <button className={liked ? "action-button liked" : "action-button"} onClick={() => toggleLike(post)} type="button">
                          <span className="heart-icon" aria-hidden="true">{"\u2665"}</span>{liked ? "Curtido" : "Curtir"}
                        </button>
                        <button className="action-button" onClick={() => setActiveCommentPostId(commentsOpen ? null : post.id)} type="button">
                          {commentsOpen ? "Ocultar comentarios" : `Ver comentarios (${post.comments?.length || 0})`}
                        </button>
                        <button className="action-button" onClick={() => sharePost(post)} type="button">Compartilhar</button>
                        <button className="action-button" onClick={() => reportContent({ postId: post.id })} type="button">Relatar</button>
                      </div>

                      {commentsOpen && (
                        <>
                          <div className="comments">
                            {(post.comments || []).length === 0 && <p className="empty-comments">Ainda nao ha comentarios.</p>}
                            {(post.comments || []).map((comment) => (
                              <div className="comment" key={comment.id}>
                                <Avatar profile={comment.commenter} />
                                <div>
                                  <strong>{comment.commenter?.name || "Morador"}</strong>
                                  <span>{comment.body}</span>
                                </div>
                                {canDeleteComment(comment) && (
                                  <button className="delete-button compact" onClick={() => deleteComment(comment)} type="button">Excluir</button>
                                )}
                                <button className="delete-button compact neutral" onClick={() => reportContent({ commentId: comment.id })} type="button">Relatar</button>
                              </div>
                            ))}
                          </div>

                          <form className="comment-form" onSubmit={(event) => addComment(event, post.id)}>
                            <Avatar profile={profile} />
                            <input name="comment" placeholder="Escreva um comentario" />
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
                    <h2>Configuracoes</h2>
                    <Avatar profile={profile} />
                  </div>
                  <form onSubmit={updateProfile}>
                    <input defaultValue={profile?.name || ""} name="name" placeholder="Nome publico" required />
                    <input defaultValue={profile?.neighborhood || ""} name="neighborhood" placeholder="Bairro / regiao" />
                    <input defaultValue={profile?.contact || ""} name="contact" placeholder="Contato publico" />
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
          <input name="description" placeholder="Descricao curta" />
          <button className="primary-button" type="submit">Criar debate</button>
        </form>
      )}

      <div className="debate-grid">
        {debates.map((debate) => (
          <article className="debate-card" key={debate.slug}>
            <div>
              <h2>{debate.title}</h2>
              <p>{debate.description || "Debate aberto pelo administrador da pagina."}</p>
            </div>
            <strong>{posts.filter((post) => post.topic === debate.slug).length} posts</strong>
            <button className="ghost-button" onClick={() => onSelectDebate(debate.slug)} type="button">Abrir no feed</button>
          </article>
        ))}
      </div>
    </section>
  );
}

function AdminView({ activeTab, debates, metrics, onChangeTab, onDeleteComment, onDeletePost, onDeleteProfile, onRefresh, posts, profiles, reports }) {
  const allComments = posts.flatMap((post) =>
    (post.comments || []).map((comment) => ({
      ...comment,
      postBody: post.body,
      postStreet: post.street,
    }))
  );
  const neighborhoods = profiles.reduce((items, person) => {
    const key = person.neighborhood || "Nao informado";
    items[key] = (items[key] || 0) + 1;
    return items;
  }, {});
  const leadEmails = profiles
    .map((person) => person.email)
    .filter(Boolean)
    .join(", ");

  return (
    <section className="view-panel">
      <header className="view-header">
        <p className="eyebrow">Administrador geral</p>
        <h1>Dashboard de controle</h1>
      </header>

      <div className="admin-tabs">
        <button className={activeTab === "overview" ? "active" : ""} onClick={() => onChangeTab("overview")} type="button">Metricas</button>
        <button className={activeTab === "users" ? "active" : ""} onClick={() => onChangeTab("users")} type="button">Usuarios e leads</button>
        <button className={activeTab === "content" ? "active" : ""} onClick={() => onChangeTab("content")} type="button">Conteudo</button>
        <button className={activeTab === "reports" ? "active" : ""} onClick={() => onChangeTab("reports")} type="button">Relatorios</button>
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
              <small>Quantidade de usuarios por bairro/regiao</small>
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
                  <th>Acao</th>
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
                    <th>Conteudo</th>
                    <th>Acao</th>
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
              <h2>Comentarios</h2>
              <small>{allComments.length} comentarios</small>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Autor</th>
                    <th>Comentario</th>
                    <th>Post</th>
                    <th>Acao</th>
                  </tr>
                </thead>
                <tbody>
                  {allComments.map((comment) => (
                    <tr key={comment.id}>
                      <td>{comment.commenter?.name || "Morador"}</td>
                      <td>{comment.body}</td>
                      <td>{comment.postStreet || "-"} | {comment.postBody}</td>
                      <td><button className="delete-button" onClick={() => onDeleteComment(comment)} type="button">Excluir comentario</button></td>
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
            <h2>Relatorios de problemas</h2>
            <small>{reports.length} relatos</small>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Quem relatou</th>
                  <th>Problema</th>
                  <th>Conteudo</th>
                  <th>Acao</th>
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
                      {report.comment && <button className="delete-button" onClick={() => onDeleteComment({ id: report.comment_id, user_id: report.comment.user_id })} type="button">Excluir comentario</button>}
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
