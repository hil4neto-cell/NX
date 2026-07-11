# Acesso ao NXGEO por e-mail

Execute primeiro a migration `migrations/20260711170000_nxgeo_email_allowlist.sql` no SQL Editor do Supabase.

Depois abra **Authentication > Auth Hooks > Before User Created**, escolha **Postgres Function**, selecione `public.nxgeo_before_user_created`, ative e salve. Esse hook impede no servidor a criacao de qualquer usuario que nao esteja na lista.

## Autorizar um e-mail

```sql
insert into public.nxgeo_allowed_emails (email, label)
values (lower(btrim('cliente@exemplo.com')), 'Cliente ou empresa')
on conflict (email) do update
set active = true,
    label = excluded.label;
```

## Bloquear um e-mail

```sql
update public.nxgeo_allowed_emails
set active = false
where email = lower(btrim('cliente@exemplo.com'));
```

## Reativar um e-mail

```sql
update public.nxgeo_allowed_emails
set active = true
where email = lower(btrim('cliente@exemplo.com'));
```

## Conferir acessos

```sql
select email, label, active, created_at
from public.nxgeo_allowed_emails
order by created_at desc;
```

Somente o SQL Editor administrativo e o servico de autenticacao acessam a tabela. O navegador nunca consegue listar os e-mails autorizados.

Para o primeiro acesso criar o usuario no Supabase Auth, mantenha **Allow new users to sign up** ligado. O hook da allowlist decide quem pode ser criado, e a sessao e conferida novamente ao abrir o NXGEO. Mantenha login anonimo desligado.
