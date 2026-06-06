-- Rode depois de fazer login/cadastro pelo site pelo menos uma vez.
-- Para o login de teste, crie no Supabase Auth um usuario:
-- Email: admin@mural.local
-- Senha: igor.1010
--
-- Se quiser transformar outro cadastro real em admin, troque SEU_EMAIL_AQUI pelo email exato.

insert into public.profiles (id, name, email, role)
select id, 'Administrador', email, 'admin'
from auth.users
where email in ('admin@mural.local', 'SEU_EMAIL_AQUI')
on conflict (id) do update
set role = 'admin',
    email = excluded.email;

select id, name, email, role
from public.profiles
where email in ('admin@mural.local', 'SEU_EMAIL_AQUI');
