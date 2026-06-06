# Mural Digital

Aplicacao Next.js + Supabase para usuarios criarem login, perfil com foto, publicarem fotos das ruas e iniciarem debates por tema.

## O que ja esta pronto

- Cadastro e login com Supabase Auth.
- Perfil com nome, bairro/regiao, bio e foto.
- Upload de avatar no bucket `avatars`.
- Publicacao com foto no bucket `post-images`.
- Feed com filtro por tema e busca.
- Curtidas.
- Comentarios/debates por post.
- Estrutura de banco com RLS em `supabase/schema.sql`.
- Pronto para deploy na Vercel.

## Configurar Supabase

1. Crie um projeto no Supabase.
2. Va em `SQL Editor`.
3. Cole e execute o arquivo `supabase/schema.sql`.
4. Va em `Project Settings > API`.
5. Copie:
   - Project URL
   - anon public key

## Variaveis de ambiente

Crie um arquivo `.env.local` baseado em `.env.example`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-chave-anon-publica
```

Na Vercel, coloque essas mesmas variaveis em:

`Project Settings > Environment Variables`

## Rodar local

```bash
npm install
npm run dev
```

Depois abra:

```text
http://localhost:3000
```

## Deploy na Vercel

1. Suba o projeto para um repositorio GitHub.
2. Importe o repositorio na Vercel.
3. Configure as variaveis de ambiente.
4. Deploy.

## Observacao

O arquivo `index.html` antigo continua na pasta como prototipo estatico, mas a aplicacao real agora e a estrutura Next.js em `app/`.
