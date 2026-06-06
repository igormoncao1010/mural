"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabase } from "../lib/supabase";

const initialTopics = [
  { id: "all", name: "Todos" },
  { id: "infraestrutura", name: "Infraestrutura" },
  { id: "saude", name: "Saude" },
  { id: "educacao", name: "Educacao" },
  { id: "seguranca", name: "Seguranca" },
  { id: "mobilidade", name: "Mobilidade" },
];

export default function HomePage() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [authMode, setAuthMode] = useState("login");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [activeCommentPostId, setActiveCommentPostId] = useState(null);

  const supabase = useMemo(() => {
    try {
      return getSupabase();
    } catch {
      return null;
    }
  }, []);
  const supabaseReady = Boolean(supabase);

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
    loadPosts();
  }, [session, supabase]);

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
        avatar_url: "",
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

  async function handleAuth(event) {
    event.preventDefault();
    setMessage("");

    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    const email = String(form.get("email") || "").trim().toLowerCase();
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
          avatar_url: "",
        });

        if (profileError) {
          setMessage("Conta criada. Entre novamente para completar o perfil.");
          return;
        }
      }

      setMessage(
        data.session
          ? "Conta criada. Voce ja pode usar o mural."
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
      bio: String(form.get("bio") || "").trim(),
      avatar_url: avatarUrl,
    };

    const { error } = await supabase.from("profiles").upsert(nextProfile);
    if (error) {
      setMessage(error.message);
      return;
    }

    setProfile(nextProfile);
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
    const title = "Mural Digital";
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

  async function signOut() {
    await supabase.auth.signOut();
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
  const topicCounts = initialTopics
    .filter((topic) => topic.id !== "all")
    .map((topic) => ({
      ...topic,
      count: posts.filter((post) => post.topic === topic.id).length,
    }));

  if (!supabaseReady) {
    return (
      <main className="setup-screen">
        <section className="setup-card">
          <p className="eyebrow">Configuracao pendente</p>
          <h1>Adicione as chaves do Supabase para ativar o mural.</h1>
          <p>Copie `.env.example` para `.env.local` e preencha `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`.</p>
        </section>
      </main>
    );
  }

  if (loading) return <main className="setup-screen">Carregando mural...</main>;

  if (!session) {
    return (
      <main className="auth-page">
        <section className="auth-hero">
          <p className="eyebrow">Mural Digital</p>
          <h1>Fotos das ruas virando debate publico.</h1>
          <p>Moradores criam perfil, publicam imagens dos lugares por onde passam e ajudam a organizar prioridades por tema.</p>
        </section>

        <form className="auth-panel" onSubmit={handleAuth}>
          <div className="tabs">
            <button className={authMode === "login" ? "active" : ""} onClick={() => setAuthMode("login")} type="button">Login</button>
            <button className={authMode === "register" ? "active" : ""} onClick={() => setAuthMode("register")} type="button">Cadastro</button>
          </div>
          {authMode === "register" && <input name="name" placeholder="Nome publico" required />}
          <input name="email" placeholder="Email" required type="email" />
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
          <span>MD</span>
          <div>
            <strong>Mural Digital</strong>
            <small>Pre-campanha participativa</small>
          </div>
        </div>

        <nav className="side-nav" aria-label="Navegacao principal">
          <button className="side-nav-item active" type="button">Mural</button>
          <button className="side-nav-item" onClick={() => setFilter("all")} type="button">Debates</button>
          <button className="side-nav-item" type="button">Perfil</button>
        </nav>

        <div className="profile-chip">
          <Avatar profile={profile} />
          <div>
            <strong>{profile?.name || session.user.email}</strong>
            <small>{profile?.neighborhood || "Perfil sem bairro"}</small>
          </div>
        </div>

        <div className="sidebar-stats">
          <span><strong>{posts.length}</strong> posts</span>
          <span><strong>{userPosts}</strong> seus posts</span>
          <span><strong>{userComments}</strong> comentarios</span>
        </div>

        <button className="ghost-button logout-button" onClick={signOut} type="button">Sair</button>
      </aside>

      <section className="content">
        <div className="social-layout">
          <section className="feed-column">
            <header className="feed-topbar">
              <div>
                <p className="eyebrow">Comunidade local</p>
                <h1>Mural da cidade</h1>
              </div>
              <div className="feed-search">
                <input onChange={(event) => setQuery(event.target.value)} placeholder="Buscar rua, bairro ou assunto" />
                <select onChange={(event) => setFilter(event.target.value)} value={filter}>
                  {initialTopics.map((topic) => (
                    <option key={topic.id} value={topic.id}>{topic.name}</option>
                  ))}
                </select>
              </div>
            </header>

            {message && <p className="notice">{message}</p>}

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
                    {initialTopics.filter((topic) => topic.id !== "all").map((topic) => (
                      <option key={topic.id} value={topic.id}>{topic.name}</option>
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
                      <span>{topicLabel(post.topic)}</span>
                    </div>

                    <p className="post-text">{post.body}</p>
                    {post.image_url && <img alt="Foto publicada no mural" className="post-image" src={post.image_url} />}

                    <div className="engagement-row">
                      <span>{post.likes?.length || 0} curtidas</span>
                      <span>{post.comments?.length || 0} comentarios</span>
                    </div>

                    <div className="post-actions">
                      <button className={liked ? "action-button liked" : "action-button"} onClick={() => toggleLike(post)} type="button">
                        <span aria-hidden="true">+</span>{liked ? "Curtido" : "Curtir"}
                      </button>
                      <button className="action-button" onClick={() => setActiveCommentPostId(commentsOpen ? null : post.id)} type="button">
                        <span aria-hidden="true">#</span>Comentar
                      </button>
                      <button className="action-button" onClick={() => sharePost(post)} type="button">
                        <span aria-hidden="true">@</span>Compartilhar
                      </button>
                    </div>

                    {(commentsOpen || (post.comments || []).length > 0) && (
                      <div className="comments">
                        {(post.comments || []).map((comment) => (
                          <div className="comment" key={comment.id}>
                            <Avatar profile={comment.commenter} />
                            <div>
                              <strong>{comment.commenter?.name || "Morador"}</strong>
                              <span>{comment.body}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {commentsOpen && (
                      <form className="comment-form" onSubmit={(event) => addComment(event, post.id)}>
                        <Avatar profile={profile} />
                        <input name="comment" placeholder="Escreva um comentario" />
                        <button type="submit">Enviar</button>
                      </form>
                    )}
                  </article>
                );
              })}
            </section>
          </section>

          <aside className="right-panel">
            <section className="profile-editor">
              <div className="panel-title">
                <h2>Seu perfil</h2>
                <Avatar profile={profile} />
              </div>
              <form onSubmit={updateProfile}>
                <input defaultValue={profile?.name || ""} name="name" placeholder="Nome publico" required />
                <input defaultValue={profile?.neighborhood || ""} name="neighborhood" placeholder="Bairro / regiao" />
                <textarea defaultValue={profile?.bio || ""} name="bio" placeholder="Bio curta" />
                <label className="upload-line">
                  Foto de perfil
                  <input accept="image/*" name="avatar" type="file" />
                </label>
                <button className="primary-button" type="submit">Salvar perfil</button>
              </form>
            </section>

            <section className="topic-panel">
              <h2>Debates ativos</h2>
              <div className="topic-list">
                {topicCounts.map((topic) => (
                  <button className={filter === topic.id ? "topic-item active" : "topic-item"} key={topic.id} onClick={() => setFilter(topic.id)} type="button">
                    <span>{topic.name}</span>
                    <strong>{topic.count}</strong>
                  </button>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </section>
    </main>
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

function topicLabel(topicId) {
  return initialTopics.find((topic) => topic.id === topicId)?.name || "Debate";
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
