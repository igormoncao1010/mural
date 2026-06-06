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
      .select("*, profiles(name, avatar_url), comments(*, profiles(name, avatar_url)), likes(user_id)")
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
        setMessage(error.message);
        return;
      }

      if (data.user) {
        await supabase.from("profiles").upsert({
          id: data.user.id,
          name,
          email,
          bio: "",
          neighborhood: "",
          avatar_url: "",
        });
      }

      setMessage("Conta criada. Se o Supabase pedir confirmacao, verifique o email.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage(error.message);
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

        <div className="profile-chip">
          <Avatar profile={profile} />
          <div>
            <strong>{profile?.name || session.user.email}</strong>
            <small>{profile?.neighborhood || "Perfil sem bairro"}</small>
          </div>
        </div>

        <button className="ghost-button" onClick={signOut} type="button">Sair</button>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">Comunidade local</p>
            <h1>Publique a rua, puxe o debate, organize a proposta.</h1>
          </div>
        </header>

        {message && <p className="notice">{message}</p>}

        <section className="profile-editor">
          <h2>Seu perfil</h2>
          <form onSubmit={updateProfile}>
            <input defaultValue={profile?.name || ""} name="name" placeholder="Nome publico" required />
            <input defaultValue={profile?.neighborhood || ""} name="neighborhood" placeholder="Bairro / regiao" />
            <input accept="image/*" name="avatar" type="file" />
            <textarea defaultValue={profile?.bio || ""} name="bio" placeholder="Bio curta" />
            <button className="primary-button" type="submit">Salvar perfil</button>
          </form>
        </section>

        <section className="composer">
          <h2>Nova foto da rua</h2>
          <form onSubmit={createPost}>
            <div className="form-grid">
              <select name="topic" required>
                {initialTopics.filter((topic) => topic.id !== "all").map((topic) => (
                  <option key={topic.id} value={topic.id}>{topic.name}</option>
                ))}
              </select>
              <input name="street" placeholder="Rua / avenida" />
              <input name="neighborhood" placeholder="Bairro" />
            </div>
            <textarea maxLength={500} name="body" placeholder="O que esta acontecendo nesse local?" required />
            <input accept="image/*" name="image" type="file" />
            <button className="primary-button" type="submit">Publicar</button>
          </form>
        </section>

        <section className="feed-tools">
          <input onChange={(event) => setQuery(event.target.value)} placeholder="Buscar rua, bairro ou assunto" />
          <select onChange={(event) => setFilter(event.target.value)} value={filter}>
            {initialTopics.map((topic) => (
              <option key={topic.id} value={topic.id}>{topic.name}</option>
            ))}
          </select>
        </section>

        <section className="feed">
          {filteredPosts.map((post) => (
            <article className="post-card" key={post.id}>
              <div className="post-header">
                <Avatar profile={post.profiles} />
                <div>
                  <strong>{post.profiles?.name || "Morador"}</strong>
                  <small>{post.street || "Rua nao informada"} {post.neighborhood ? `- ${post.neighborhood}` : ""}</small>
                </div>
                <span>{topicLabel(post.topic)}</span>
              </div>

              <p>{post.body}</p>
              {post.image_url && <img alt="Foto publicada no mural" className="post-image" src={post.image_url} />}

              <div className="post-actions">
                <button className="ghost-button" onClick={() => toggleLike(post)} type="button">
                  {post.likes?.some((like) => like.user_id === session.user.id) ? "Curtido" : "Curtir"} ({post.likes?.length || 0})
                </button>
              </div>

              <div className="comments">
                {(post.comments || []).map((comment) => (
                  <div className="comment" key={comment.id}>
                    <strong>{comment.profiles?.name || "Morador"}</strong>
                    <span>{comment.body}</span>
                  </div>
                ))}
              </div>

              <form className="comment-form" onSubmit={(event) => addComment(event, post.id)}>
                <input name="comment" placeholder="Entrar no debate" />
                <button type="submit">Enviar</button>
              </form>
            </article>
          ))}
        </section>
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
